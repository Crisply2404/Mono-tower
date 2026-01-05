import * as THREE from 'three';
import { COLORS, CONFIG } from '../constants';
import { BlockData, BlockMap, BlockType } from '../types';

export class VisualBuilder {
  private materialWhite: THREE.MeshBasicMaterial;
  private materialBlack: THREE.MeshBasicMaterial;
  private jointGeometry: THREE.SphereGeometry;
  private resources: THREE.Object3D[] | THREE.Material[] | THREE.Geometry[] = [];

  constructor() {
    this.materialWhite = new THREE.MeshBasicMaterial({
      color: COLORS.white,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.materialBlack = new THREE.MeshBasicMaterial({ color: COLORS.black });
    
    // Pre-create geometry for joints to reuse
    const radius = CONFIG.thickness / 2;
    this.jointGeometry = new THREE.SphereGeometry(radius, 8, 8);
  }

  public createLevelMesh(blocksData: BlockData[], blockMap: BlockMap): THREE.Group {
    const levelGroup = new THREE.Group();
    const s = CONFIG.blockSize;
    const t = CONFIG.thickness;
    const half = s / 2;
    const radius = t / 2;

    // Vertical seam case: two blocks touch diagonally around a vertical pillar.
    // That pillar looks thinner because each block occludes part of the cylinder.
    // For that specific case only, we bias the pillar slightly outward.
    const verticalSeamEpsilon = Math.max(0.001, t * CONFIG.verticalSeamEpsilonFactor);

    blocksData.forEach(b => {
      const { gx, gy, gz, type, center } = b;

      if (type === BlockType.Standard) {
        // Solid white interior for occlusion
        const boxGeo = new THREE.BoxGeometry(s, s, s);
        const boxMesh = new THREE.Mesh(boxGeo, this.materialWhite);
        boxMesh.position.copy(center);
        levelGroup.add(boxMesh);
        this.resources.push(boxGeo); // Track for disposal
      } else if (type === BlockType.Spike) {
        const spikeGroup = this.createSpikeVisual(s, s, t, center);
        levelGroup.add(spikeGroup);
        return; // Spikes handle their own edges
      }

      // Smart Edge Drawing (Occlusion Culling for aesthetics)
      // We only draw edges if there isn't a neighbor in that direction
      const has = (dx: number, dy: number, dz: number) => blockMap.has(`${gx + dx},${gy + dy},${gz + dz}`);
      
      const corners = {
        trf: new THREE.Vector3(half, half, half),
        trb: new THREE.Vector3(half, half, -half),
        tlf: new THREE.Vector3(-half, half, half),
        tlb: new THREE.Vector3(-half, half, -half),
        brf: new THREE.Vector3(half, -half, half),
        brb: new THREE.Vector3(half, -half, -half),
        blf: new THREE.Vector3(-half, -half, half),
        blb: new THREE.Vector3(-half, -half, -half),
      };

      // Helper to draw edge between two local points
      const draw = (p1: THREE.Vector3, p2: THREE.Vector3, bias?: { dir: THREE.Vector3; amount: number }) => {
        if (bias) {
          const offset = bias.dir.clone().normalize().multiplyScalar(bias.amount);
          this.createEdge(p1.clone().add(offset), p2.clone().add(offset), center, radius, levelGroup);
          return;
        }
        this.createEdge(p1, p2, center, radius, levelGroup);
      };

      // Determine whether an edge is a "diagonal seam" and return the outward bias direction if so.
      // Edge types we draw:
      // - Horizontal top/bottom edges (vary in x/z, constant y)
      // - Vertical pillar edges (vary in y, constant x/z)
      const verticalSeamBiasForEdge = (p1: THREE.Vector3, p2: THREE.Vector3): THREE.Vector3 | null => {
        const a = p1;
        const b = p2;

        // Vertical edge at corner (x,z fixed at +/-half)
        if (a.x === b.x && a.z === b.z && a.y !== b.y) {
          const xDir = a.x > 0 ? 1 : -1;
          const zDir = a.z > 0 ? 1 : -1;

          // If there is no direct neighbor on either +x/-x or +z/-z (so pillar is considered exposed),
          // but there IS a diagonal neighbor at (xDir, 0, zDir), then it's the seam case.
          if (!has(xDir, 0, 0) && !has(0, 0, zDir) && has(xDir, 0, zDir)) {
            return new THREE.Vector3(xDir, 0, zDir);
          }
        }
        return null;
      };

      // Logic to determine which edges to draw based on neighbors
      if (!has(0, 1, 0)) { // Top face exposed
        if (!has(1, 0, 0)) draw(corners.trf, corners.trb);
        if (!has(-1, 0, 0)) draw(corners.tlf, corners.tlb);
        if (!has(0, 0, 1)) draw(corners.trf, corners.tlf);
        if (!has(0, 0, -1)) draw(corners.trb, corners.tlb);
      }
      if (!has(0, -1, 0)) { // Bottom face exposed
        if (!has(1, 0, 0)) draw(corners.brf, corners.brb);
        if (!has(-1, 0, 0)) draw(corners.blf, corners.blb);
        if (!has(0, 0, 1)) draw(corners.brf, corners.blf);
        if (!has(0, 0, -1)) draw(corners.brb, corners.blb);
      }
      // Vertical pillars
      const biasTRF = verticalSeamBiasForEdge(corners.trf, corners.brf);
      if (!has(1, 0, 0) && !has(0, 0, 1)) draw(corners.trf, corners.brf, biasTRF ? { dir: biasTRF, amount: verticalSeamEpsilon } : undefined);

      const biasTLF = verticalSeamBiasForEdge(corners.tlf, corners.blf);
      if (!has(-1, 0, 0) && !has(0, 0, 1)) draw(corners.tlf, corners.blf, biasTLF ? { dir: biasTLF, amount: verticalSeamEpsilon } : undefined);

      const biasTRB = verticalSeamBiasForEdge(corners.trb, corners.brb);
      if (!has(1, 0, 0) && !has(0, 0, -1)) draw(corners.trb, corners.brb, biasTRB ? { dir: biasTRB, amount: verticalSeamEpsilon } : undefined);

      const biasTLB = verticalSeamBiasForEdge(corners.tlb, corners.blb);
      if (!has(-1, 0, 0) && !has(0, 0, -1)) draw(corners.tlb, corners.blb, biasTLB ? { dir: biasTLB, amount: verticalSeamEpsilon } : undefined);
    });

    return levelGroup;
  }

  private createEdge(p1: THREE.Vector3, p2: THREE.Vector3, center: THREE.Vector3, radius: number, parent: THREE.Group) {
    // 1. The Cylinder (Line)
    const vec = new THREE.Vector3().subVectors(p2, p1);
    const len = vec.length();
    const edgeGeo = new THREE.CylinderGeometry(radius, radius, len, 8, 1);
    const edgeMesh = new THREE.Mesh(edgeGeo, this.materialBlack);
    
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    edgeMesh.position.copy(mid).add(center);
    edgeMesh.lookAt(p2.clone().add(center));
    edgeMesh.rotateX(Math.PI / 2); // Align cylinder with direction
    parent.add(edgeMesh);
    this.resources.push(edgeGeo);

    // 2. The Ball Joints (Vertices) - Seamless look
    const j1 = new THREE.Mesh(this.jointGeometry, this.materialBlack);
    j1.position.copy(p1).add(center);
    parent.add(j1);

    const j2 = new THREE.Mesh(this.jointGeometry, this.materialBlack);
    j2.position.copy(p2).add(center);
    parent.add(j2);
  }

  private createSpikeVisual(size: number, height: number, thickness: number, center: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    const half = size / 2;
    const radius = thickness / 2;
    const innerRadius = (size / 2) * Math.sqrt(2);

    // White core
    const innerGeo = new THREE.CylinderGeometry(0, innerRadius, height, 4, 1);
    innerGeo.rotateY(Math.PI / 4);
    innerGeo.translate(0, height / 2, 0);
    const innerMesh = new THREE.Mesh(innerGeo, this.materialWhite);
    group.add(innerMesh);
    this.resources.push(innerGeo);

    // Edges
    const top = new THREE.Vector3(0, height, 0);
    const corners = [
      new THREE.Vector3(half, 0, half),
      new THREE.Vector3(half, 0, -half),
      new THREE.Vector3(-half, 0, -half),
      new THREE.Vector3(-half, 0, half)
    ];

    const addSpikeEdge = (p1: THREE.Vector3, p2: THREE.Vector3) => {
      this.createEdge(p1, p2, new THREE.Vector3(0,0,0), radius, group);
    };

    corners.forEach(c => addSpikeEdge(top, c));
    for (let i = 0; i < 4; i++) {
      addSpikeEdge(corners[i], corners[(i + 1) % 4]);
    }

    group.position.copy(center);
    group.position.y -= half; // Align base with block
    return group;
  }

  public createPlayerMesh(): THREE.Group {
    const group = new THREE.Group();
    const outlineR = CONFIG.playerRadius + CONFIG.thickness / 2;
    const fillR = CONFIG.playerRadius - CONFIG.thickness / 2;

    const outlineGeo = new THREE.CircleGeometry(outlineR, 64);
    const outlineMesh = new THREE.Mesh(outlineGeo, this.materialBlack);
    outlineMesh.position.z = -0.1;
    group.add(outlineMesh);
    this.resources.push(outlineGeo);

    const fillGeo = new THREE.CircleGeometry(fillR, 64);
    const fillMesh = new THREE.Mesh(fillGeo, this.materialWhite);
    group.add(fillMesh);
    this.resources.push(fillGeo);

    return group;
  }

  public dispose() {
    this.materialWhite.dispose();
    this.materialBlack.dispose();
    this.jointGeometry.dispose();
    this.resources.forEach((res: any) => {
      if (res.dispose) res.dispose();
    });
    this.resources = [];
  }
}