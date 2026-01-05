export const CONFIG = {
  blockSize: 40,
  thickness: 2.5,
  verticalSeamEpsilonFactor: 0.12,
  gravity: 0.65,
  jumpForce: 14,
  moveSpeed: 1.2,
  friction: 0.82,
  maxSpeed: 10,
  playerRadius: 20,
  winHeight: 0, // Will be calculated dynamically
};

export const COLORS = {
  white: 0xffffff,
  black: 0x000000,
};

export const VIEWPORT = {
  width: 800,
  height: 600,
  frustumSize: 800,
  isoRadius: 1000,
};

export const PHYSICS = {
  collisionRange: 80,
  coyoteFrames: 5,
};