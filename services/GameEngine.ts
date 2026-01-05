import * as THREE from 'three';
import { CONFIG, VIEWPORT } from '../constants';
import { BlockData, BlockMap, InputState, PlayerState } from '../types';
import { LevelGenerator } from './LevelGenerator';
import { PhysicsEngine } from './PhysicsEngine';
import { VisualBuilder } from './VisualBuilder';

export class GameEngine {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private reqId: number | null = null;
  private container: HTMLElement;
  
  private playerMesh: THREE.Group;
  private levelGroup: THREE.Group;
  
  private blocksData: BlockData[] = [];
  private blockMap: BlockMap = new Map();
  private winHeight: number = 0;

  private visualBuilder: VisualBuilder;
  private physicsEngine: PhysicsEngine;

  private player: PlayerState;
  private input: InputState;

  // Camera State
  private cameraAngle: number = Math.PI / 4;
  private targetCameraAngle: number = Math.PI / 4;

  // Time Step Control
  private lastTime: number = 0;
  private accumulator: number = 0;
  private readonly TIME_STEP = 1 / 60; // Fixed 60 ticks per second

  // Callbacks
  private onScoreUpdate: (score: number) => void;
  private onStatusUpdate: (msg: string) => void;

  constructor(
    container: HTMLElement, 
    onScoreUpdate: (s: number) => void,
    onStatusUpdate: (m: string) => void
  ) {
    this.container = container;
    this.onScoreUpdate = onScoreUpdate;
    this.onStatusUpdate = onStatusUpdate;
    
    // 1. Initialize Three.js Basics
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    // Initial sizing based on container
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
    this.camera.position.set(VIEWPORT.isoRadius, VIEWPORT.isoRadius, VIEWPORT.isoRadius);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // 2. Initialize Sub-systems
    this.visualBuilder = new VisualBuilder();
    this.physicsEngine = new PhysicsEngine();

    // 3. Generate Content
    const levelData = LevelGenerator.generate();
    this.blocksData = levelData.blocksData;
    this.blockMap = levelData.blockMap;
    this.winHeight = levelData.winHeight;

    this.levelGroup = this.visualBuilder.createLevelMesh(this.blocksData, this.blockMap);
    this.scene.add(this.levelGroup);

    this.playerMesh = this.visualBuilder.createPlayerMesh();
    this.scene.add(this.playerMesh);

    // 4. Initialize State
    this.player = {
      pos: new THREE.Vector3(0, 150, 0),
      vel: new THREE.Vector3(0, 0, 0),
      grounded: false,
      coyoteTime: 0,
    };

    this.input = { w: false, a: false, s: false, d: false, space: false };

    // 5. Input Listeners
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onWindowResize);

    // Trigger initial resize to set correct camera frustum
    this.onWindowResize();

    // Start Loop
    this.reqId = requestAnimationFrame(this.animate);
  }

  private onWindowResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;

    // SCALING LOGIC:
    // We want to ensure a minimum visible area of world units.
    // If aspect < 1 (Portrait), the width is the limiting factor.
    // frustumHeight * aspect = frustumWidth.
    // If we want frustumWidth >= 1000 (increased from 800 to zoom out on mobile):
    // frustumHeight >= 1000 / aspect.
    
    const minWidth = 1000; // Increased to ensure tower fits on narrow screens
    let frustumSize = VIEWPORT.frustumSize;

    if (width < height) {
        // Portrait mode: Increase frustum size to fit the width
        frustumSize = minWidth / aspect;
    } else {
        // Landscape: Default size usually fine, but ensure height
        if (frustumSize < 600) frustumSize = 600;
    }

    this.camera.left = -frustumSize * aspect / 2;
    this.camera.right = frustumSize * aspect / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  // --- External Input Handler for Mobile Controls ---
  public handleInput(action: string, isPressed: boolean) {
    switch (action) {
      case 'up': this.input.w = isPressed; break;
      case 'down': this.input.s = isPressed; break;
      case 'left': this.input.a = isPressed; break;
      case 'right': this.input.d = isPressed; break;
      case 'up-left':
        this.input.w = isPressed;
        this.input.a = isPressed;
        break;
      case 'up-right':
        this.input.w = isPressed;
        this.input.d = isPressed;
        break;
      case 'down-left':
        this.input.s = isPressed;
        this.input.a = isPressed;
        break;
      case 'down-right':
        this.input.s = isPressed;
        this.input.d = isPressed;
        break;
      case 'jump': this.input.space = isPressed; break;
      case 'rotateLeft': 
        if (isPressed) this.targetCameraAngle += Math.PI / 2; 
        break;
      case 'rotateRight': 
        if (isPressed) this.targetCameraAngle -= Math.PI / 2; 
        break;
    }
  }

  // Force reset inputs (useful on death/respawn)
  public resetInputs() {
    this.input.w = false;
    this.input.s = false;
    this.input.a = false;
    this.input.d = false;
    this.input.space = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w') this.input.w = true;
    if (k === 'a') this.input.a = true;
    if (k === 's') this.input.s = true;
    if (k === 'd') this.input.d = true;
    if (k === ' ') this.input.space = true;
    if (k === 'arrowleft') this.targetCameraAngle += Math.PI / 2;
    if (k === 'arrowright') this.targetCameraAngle -= Math.PI / 2;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'w') this.input.w = false;
    if (k === 'a') this.input.a = false;
    if (k === 's') this.input.s = false;
    if (k === 'd') this.input.d = false;
    if (k === ' ') this.input.space = false;
  };

  private resetPlayer = () => {
    this.player.pos.set(0, 150, 0);
    this.player.vel.set(0, 0, 0);
    this.resetInputs(); // Stop movement on death
    this.onStatusUpdate("RESPAWNED!");
    setTimeout(() => this.onStatusUpdate(""), 1000);
  };

  // --- Fixed Update Loop for Physics (Deterministic) ---
  private fixedUpdate = () => {
    // 1. Input Handling relative to Camera
    const force = new THREE.Vector3(0, 0, 0);
    let dx = 0, dz = 0;
    if (this.input.w) dz -= 1;
    if (this.input.s) dz += 1;
    if (this.input.a) dx -= 1;
    if (this.input.d) dx += 1;

    if (dx !== 0 || dz !== 0) {
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      camDir.y = 0; camDir.normalize();
      const camRight = new THREE.Vector3(-camDir.z, 0, camDir.x);
      const targetDir = camDir.clone().multiplyScalar(-dz).add(camRight.clone().multiplyScalar(dx)).normalize();
      force.add(targetDir.multiplyScalar(CONFIG.moveSpeed));
    }

    // 2. Physics
    this.physicsEngine.applyPhysics(this.player, force);
    // Resolve collisions 4 times for stability
    for(let i=0; i<4; i++) {
        this.physicsEngine.resolveCollisions(this.player, this.blocksData, this.blockMap, this.resetPlayer);
    }

    // Jump
    if (this.input.space && (this.player.grounded || this.player.coyoteTime > 0)) {
      this.player.vel.y = CONFIG.jumpForce;
      this.player.grounded = false;
      this.player.coyoteTime = 0;
      this.input.space = false;
    }

    // Fall check
    if (this.player.pos.y < -300) this.resetPlayer();

    // 3. Game Logic (Score)
    if (this.player.pos.y > this.winHeight) {
       this.onStatusUpdate("VICTORY REACHED!");
    }

    const relativeY = this.player.pos.y - CONFIG.blockSize;
    const heightInMeters = Math.max(0, Math.floor(relativeY / CONFIG.blockSize));
    this.onScoreUpdate(heightInMeters);
  };

  // --- Frame Update for Visuals (Interpolation/Smoothness) ---
  private renderUpdate = () => {
    // Camera Smoothing
    // This remains per-frame for visual smoothness
    this.cameraAngle += (this.targetCameraAngle - this.cameraAngle) * 0.15;

    // Camera Orbit
    const camOffset = 800;
    this.camera.position.x = this.player.pos.x + Math.sin(this.cameraAngle) * camOffset;
    this.camera.position.z = this.player.pos.z + Math.cos(this.cameraAngle) * camOffset;
    this.camera.position.y = this.player.pos.y + camOffset * 0.8;
    this.camera.lookAt(this.player.pos.x, this.player.pos.y, this.player.pos.z);

    // Player Billboard & Position
    this.playerMesh.position.copy(this.player.pos);
    this.playerMesh.quaternion.copy(this.camera.quaternion); // Always face camera
  };

  private animate = (time: number) => {
    this.reqId = requestAnimationFrame(this.animate);
    
    // Initial frame handling
    const seconds = time / 1000;
    if (this.lastTime === 0) {
        this.lastTime = seconds;
        // Don't update first frame, just render
        this.renderer.render(this.scene, this.camera);
        return;
    }

    // Cap deltaTime to avoid "spiral of death" on lag spikes
    // If the game freezes, we don't try to simulate 1000 physics steps at once.
    const deltaTime = Math.min(seconds - this.lastTime, 0.1);
    this.lastTime = seconds;
    this.accumulator += deltaTime;

    // Consume accumulated time in fixed steps
    while (this.accumulator >= this.TIME_STEP) {
        this.fixedUpdate();
        this.accumulator -= this.TIME_STEP;
    }

    // Render visuals (interpolated or snapped to latest state)
    this.renderUpdate();
    this.renderer.render(this.scene, this.camera);
  };

  public cleanup() {
    if (this.reqId) cancelAnimationFrame(this.reqId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onWindowResize);
    this.visualBuilder.dispose();
    this.renderer.dispose();
  }
}