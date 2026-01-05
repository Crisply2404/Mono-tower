import * as THREE from 'three';
import { CONFIG, PHYSICS } from '../constants';
import { PlayerState, BlockData, BlockMap, BlockType } from '../types';

export class PhysicsEngine {
  private tempVec3 = new THREE.Vector3();

  public resolveCollisions(player: PlayerState, blocks: BlockData[], blockMap: BlockMap, onReset: () => void): void {
    const { playerRadius: r } = CONFIG;
    const p = player.pos;
    let isGroundedThisFrame = false;

    // Optimization: Only check blocks nearby
    for (const b of blocks) {
      if (Math.abs(b.center.x - p.x) > PHYSICS.collisionRange || 
          Math.abs(b.center.y - p.y) > PHYSICS.collisionRange || 
          Math.abs(b.center.z - p.z) > PHYSICS.collisionRange) continue;

      // AABB vs Sphere closest point
      const closestX = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const closestY = Math.max(b.min.y, Math.min(p.y, b.max.y));
      const closestZ = Math.max(b.min.z, Math.min(p.z, b.max.z));

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

        // Internal Edge Smoothing
        // Determine if we are hitting an internal "seam" between blocks to prevent bumping
        const absX = Math.abs(normal.x);
        const absY = Math.abs(normal.y);
        const absZ = Math.abs(normal.z);
        let isInternalEdge = false;

        // If hitting a side/vertical wall, check if there is a neighbor in that direction
        // The original logic was a bit specific to Y-axis smoothness, replicating it here:
        if (absY < 0.5) { 
            let neighborKey = null;
            if (absX > absZ) {
                const sign = Math.sign(normal.x);
                neighborKey = `${b.gx + sign},${b.gy},${b.gz}`;
            } else {
                const sign = Math.sign(normal.z);
                neighborKey = `${b.gx},${b.gy},${b.gz + sign}`;
            }
            if (neighborKey && blockMap.has(neighborKey)) isInternalEdge = true;
        }

        if (!isInternalEdge) {
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