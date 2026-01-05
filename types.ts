import * as THREE from 'three';

export interface GameConfig {
  blockSize: number;
  thickness: number;
  gravity: number;
  jumpForce: number;
  moveSpeed: number;
  friction: number;
  maxSpeed: number;
  playerRadius: number;
}

export interface PlayerState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  grounded: boolean;
  coyoteTime: number;
}

export interface InputState {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  space: boolean;
}

export enum BlockType {
  Standard = 1,
  Spike = 3,
}

export interface BlockData {
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  gx: number;
  gy: number;
  gz: number;
  type: BlockType;
  id: number;
}

export type BlockMap = Map<string, BlockData>;