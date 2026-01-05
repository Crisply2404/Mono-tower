import * as THREE from 'three';
import { CONFIG, PHYSICS } from '../constants';
import { BlockData, BlockMap, BlockType, PlayerState } from '../types';

export class PhysicsEngine {
  private tempVec3 = new THREE.Vector3();
  private tempVec3B = new THREE.Vector3();
  private tempVec3C = new THREE.Vector3();

  private debugLandingSeams = false;
  private debugCooldownFrames = 0;
  private debugLastVelY = 0;
  private debugLastPosY = 0;
  private debugFrames = 0;

  private static clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  private static sqr(v: number) {
    return v * v;
  }

  private getNeighbor(blockMap: BlockMap, gx: number, gy: number, gz: number) {
    return blockMap.get(`${gx},${gy},${gz}`);
  }

  // Merge two adjacent blocks on the same Y layer into a single AABB for collision resolution.
  // This reduces seam/edge artifacts when the sphere touches the gap between blocks.
  private tryMergeWithNeighbor(
    block: BlockData,
    blockMap: BlockMap
  ): { min: THREE.Vector3; max: THREE.Vector3 } | null {
    // Only merge standard blocks.
    if (block.type !== BlockType.Standard) return null;

    // Prefer merging along the axis where the sphere is closer to an internal edge.
    // We don't have the sphere position here; this method is used only after we know we are colliding.
    // We'll attempt all four horizontal neighbors and pick the first that creates a bigger continuous face.
    const neighbors = [
      this.getNeighbor(blockMap, block.gx + 1, block.gy, block.gz),
      this.getNeighbor(blockMap, block.gx - 1, block.gy, block.gz),
      this.getNeighbor(blockMap, block.gx, block.gy, block.gz + 1),
      this.getNeighbor(blockMap, block.gx, block.gy, block.gz - 1),
    ].filter(Boolean) as BlockData[];

    for (const nb of neighbors) {
      if (nb.type !== BlockType.Standard) continue;
      // Must be same height layer.
      if (nb.gy !== block.gy) continue;
      // Must touch face-to-face.
      const touchesX = nb.gz === block.gz && Math.abs(nb.gx - block.gx) === 1;
      const touchesZ = nb.gx === block.gx && Math.abs(nb.gz - block.gz) === 1;
      if (!touchesX && !touchesZ) continue;

      const mergedMin = this.tempVec3B.set(
        Math.min(block.min.x, nb.min.x),
        Math.min(block.min.y, nb.min.y),
        Math.min(block.min.z, nb.min.z)
      );
      const mergedMax = this.tempVec3C.set(
        Math.max(block.max.x, nb.max.x),
        Math.max(block.max.y, nb.max.y),
        Math.max(block.max.z, nb.max.z)
      );
      return { min: mergedMin.clone(), max: mergedMax.clone() };
    }

    return null;
  }

  private mergeAllConnectedOnLayer(start: BlockData, blockMap: BlockMap): { min: THREE.Vector3; max: THREE.Vector3 } {
    // Flood fill on same gy for Standard blocks, 4-neighborhood, and return merged AABB.
    const keyOf = (gx: number, gy: number, gz: number) => `${gx},${gy},${gz}`;
    const visited = new Set<string>();
    const queue: Array<[number, number, number]> = [[start.gx, start.gy, start.gz]];

    let minX = start.min.x;
    let minY = start.min.y;
    let minZ = start.min.z;
    let maxX = start.max.x;
    let maxY = start.max.y;
    let maxZ = start.max.z;

    while (queue.length) {
      const [gx, gy, gz] = queue.shift()!;
      const k = keyOf(gx, gy, gz);
      if (visited.has(k)) continue;
      visited.add(k);
      const b = blockMap.get(k);
      if (!b || b.type !== BlockType.Standard || b.gy !== start.gy) continue;

      minX = Math.min(minX, b.min.x);
      minY = Math.min(minY, b.min.y);
      minZ = Math.min(minZ, b.min.z);
      maxX = Math.max(maxX, b.max.x);
      maxY = Math.max(maxY, b.max.y);
      maxZ = Math.max(maxZ, b.max.z);

      queue.push([gx + 1, gy, gz]);
      queue.push([gx - 1, gy, gz]);
      queue.push([gx, gy, gz + 1]);
      queue.push([gx, gy, gz - 1]);
    }

    return {
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
    };
  }

  public resolveCollisions(player: PlayerState, blocks: BlockData[], blockMap: BlockMap, onReset: () => void): void {
    const { playerRadius: r } = CONFIG;
    const p = player.pos;
    let isGroundedThisFrame = false;

    this.debugFrames++;
    if (this.debugCooldownFrames > 0) this.debugCooldownFrames--;

    const dbg = (globalThis as any)?.__MT_DEBUG_SEAMS__;
    if (dbg && this.debugFrames % 120 === 0) {
      // eslint-disable-next-line no-console
      console.log('[MT seam-debug] enabled', {
        frame: this.debugFrames,
        pos: p.toArray(),
        vel: player.vel.toArray(),
        grounded: player.grounded,
        coyoteTime: player.coyoteTime,
      });
    }

    // Optimization: Only check blocks nearby
    for (const b of blocks) {
      if (Math.abs(b.center.x - p.x) > PHYSICS.collisionRange || 
          Math.abs(b.center.y - p.y) > PHYSICS.collisionRange || 
          Math.abs(b.center.z - p.z) > PHYSICS.collisionRange) continue;

      // For large flat platforms (like the spawn area), seams between blocks cause corner/edge contacts.
      // Merge the entire connected component on this layer into one AABB to remove seams altogether.
      const merged = (b.type === BlockType.Standard)
        ? this.mergeAllConnectedOnLayer(b, blockMap)
        : this.tryMergeWithNeighbor(b, blockMap);
      const min = merged?.min ?? b.min;
      const max = merged?.max ?? b.max;

      // AABB vs Sphere closest point (optionally merged)
      const closestX = PhysicsEngine.clamp(p.x, min.x, max.x);
      const closestY = PhysicsEngine.clamp(p.y, min.y, max.y);
      const closestZ = PhysicsEngine.clamp(p.z, min.z, max.z);

      const distX = p.x - closestX;
      const distY = p.y - closestY;
      const distZ = p.z - closestZ;
      const distSq = distX * distX + distY * distY + distZ * distZ;

      // Collision detected
      if (distSq < r * r && distSq > 0.00001) {
        // Spike collision check
        if (b.type === BlockType.Spike) {
          onReset();
          return;
        }

        const dist = Math.sqrt(distSq);
        const normal = this.tempVec3.set(distX, distY, distZ).divideScalar(dist);
        const penetration = r - dist;

        // Internal seam smoothing:
        // When blocks tile a flat platform, the sphere can catch on edges/corners and get a sideways impulse.
        // If we are moving downward and the collision normal is mostly horizontal, treat it as a seam and skip.
        // This reduces "landing then suddenly rolling" artifacts.
        const absX = Math.abs(normal.x);
        const absY = Math.abs(normal.y);
        const absZ = Math.abs(normal.z);
        const movingDown = player.vel.y < 0;
        const seamLike = movingDown && absY < 0.35 && (absX > 0.5 || absZ > 0.5);

        // Additionally, if there is a neighbor block in the direction of the horizontal normal on the same layer,
        // consider this an internal seam and skip resolution against this block.
        let hasNeighborInNormalDir = false;
        if (absY < 0.5) {
          if (absX > absZ) {
            const sign = Math.sign(normal.x);
            hasNeighborInNormalDir = blockMap.has(`${b.gx + sign},${b.gy},${b.gz}`);
          } else {
            const sign = Math.sign(normal.z);
            hasNeighborInNormalDir = blockMap.has(`${b.gx},${b.gy},${b.gz + sign}`);
          }
        }

        if (!(seamLike || hasNeighborInNormalDir)) {
          // Push out
          p.add(normal.clone().multiplyScalar(penetration));

          // Cancel velocity into the wall
          const velAlongNormal = player.vel.dot(normal);
          if (velAlongNormal < 0) {
            const j = -velAlongNormal;
            player.vel.add(normal.clone().multiplyScalar(j));
            
            // Check if this counts as "ground" (normal pointing up)
            if (normal.y > 0.7) isGroundedThisFrame = true;
          }
        }

        // Debug: when player is landing and we see a strong horizontal normal, log details.
        // Enable via: window.__MT_DEBUG_SEAMS__ = true
        if (dbg && this.debugCooldownFrames === 0) {
          // Broaden logging: emit when we detect a seam-like situation OR we are applying a strong horizontal impulse.
          const strongHorizontal = absY < 0.35 && (absX > 0.5 || absZ > 0.5);
          const interesting = seamLike || hasNeighborInNormalDir || strongHorizontal;

          if (interesting) {
            const blockId = `${b.gx},${b.gy},${b.gz}`;
            const mergedInfo = merged ? {
              mergedMin: merged.min.toArray(),
              mergedMax: merged.max.toArray(),
            } : null;

            // Keep logs sparse (once every ~10 frames) so it still stays readable.
            this.debugCooldownFrames = 10;

            // eslint-disable-next-line no-console
            console.log('[MT seam-debug] contact', {
              frame: this.debugFrames,
              pos: p.toArray(),
              vel: player.vel.toArray(),
              lastPosY: this.debugLastPosY,
              lastVelY: this.debugLastVelY,
              grounded: player.grounded,
              coyoteTime: player.coyoteTime,
              block: blockId,
              blockType: b.type,
              normal: normal.toArray(),
              penetration,
              seamLike,
              hasNeighborInNormalDir,
              strongHorizontal,
              merged: !!merged,
              mergedInfo,
              closest: [closestX, closestY, closestZ],
              distSq,
            });
          }
        }
      }
    }

    // State update based on collision results
    if (isGroundedThisFrame) {
      player.grounded = true;
      player.coyoteTime = PHYSICS.coyoteFrames;
    } else {
      if (player.coyoteTime > 0) player.coyoteTime--;
      else player.grounded = false;
    }

    this.debugLastVelY = player.vel.y;
    this.debugLastPosY = player.pos.y;
  }

  public applyPhysics(player: PlayerState, inputForce: THREE.Vector3): void {
    // Add movement force
    player.vel.add(inputForce);

    // Friction
    player.vel.x *= CONFIG.friction;
    player.vel.z *= CONFIG.friction;

    // Gravity
    player.vel.y -= CONFIG.gravity;

    // Speed Limit (Horizontal only)
    const hSpeed = Math.sqrt(player.vel.x ** 2 + player.vel.z ** 2);
    if (hSpeed > CONFIG.maxSpeed) {
        const ratio = CONFIG.maxSpeed / hSpeed;
        player.vel.x *= ratio;
        player.vel.z *= ratio;
    }

    // Apply Velocity
    player.pos.add(player.vel);
  }
}