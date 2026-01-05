import * as THREE from 'three';
import { CONFIG } from '../constants';
import { BlockData, BlockMap, BlockType } from '../types';

export class LevelGenerator {
  public static generate(): { blocksData: BlockData[], blockMap: BlockMap, winHeight: number } {
    const blocksData: BlockData[] = [];
    const blockMap: BlockMap = new Map();

    const addBlock = (gx: number, gy: number, gz: number, type: BlockType) => {
      const px = gx * CONFIG.blockSize;
      const py = gy * CONFIG.blockSize;
      const pz = gz * CONFIG.blockSize;
      const half = CONFIG.blockSize / 2;

      const block: BlockData = {
        min: new THREE.Vector3(px - half, py - half, pz - half),
        max: new THREE.Vector3(px + half, py + half, pz + half),
        center: new THREE.Vector3(px, py, pz),
        gx, gy, gz,
        type,
        id: blocksData.length
      };

      blocksData.push(block);
      blockMap.set(`${gx},${gy},${gz}`, block);
    };

    // 1. Base Platform
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        addBlock(x, 0, z, BlockType.Standard);
      }
    }

    // 2. Spiral Tower
    let currentY = 1;
    const towerHeight = 100;
    
    for (let i = 0; i < towerHeight; i++) {
      const angle = i * 0.35;
      const r = 4 + Math.sin(i * 0.1) * 1.5;
      const bx = Math.round(Math.cos(angle) * r);
      const bz = Math.round(Math.sin(angle) * r);

      addBlock(bx, currentY, bz, BlockType.Standard);

      // Random side platforms
      if (i % 6 === 0) {
        const nx = bx + (Math.random() > 0.5 ? 1 : -1);
        if (!blockMap.has(`${nx},${currentY},${bz}`)) {
          addBlock(nx, currentY, bz, BlockType.Standard);
        }
      }

      // Spikes placement
      if (i > 10 && i % 8 === 0) {
        addBlock(bx, currentY + 1, bz, BlockType.Spike);
      } else {
        // Only increase height every other step for playability
        if (i % 2 === 0) currentY++;
      }
    }

    // 3. Victory Platform
    const topY = currentY + 1;
    addBlock(0, topY, 0, BlockType.Standard);
    addBlock(0, topY + 1, 0, BlockType.Spike); // Finial decoration

    const winHeight = topY * CONFIG.blockSize;

    return { blocksData, blockMap, winHeight };
  }
}