import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { GameEngine } from '../services/GameEngine';

interface GameCanvasProps {
  onScoreUpdate: (score: number) => void;
  onStatusUpdate: (msg: string) => void;
  onGameReady: () => void;
}

export interface GameCanvasRef {
  handleInput: (action: string, isPressed: boolean) => void;
}

const GameCanvas = forwardRef<GameCanvasRef, GameCanvasProps>(({ onScoreUpdate, onStatusUpdate, onGameReady }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    handleInput: (action: string, isPressed: boolean) => {
      if (engineRef.current) {
        engineRef.current.handleInput(action, isPressed);
      }
    }
  }));

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (mounted && containerRef.current && !engineRef.current) {
          engineRef.current = new GameEngine(
            containerRef.current,
            onScoreUpdate,
            onStatusUpdate
          );
          onGameReady();
        }
      } catch (e: any) {
        console.error(e);
        setError("Failed to initialize Game Engine.");
      }
    };

    init();

    return () => {
      mounted = false;
      if (engineRef.current) {
        engineRef.current.cleanup();
        engineRef.current = null;
      }
    };
  }, [onScoreUpdate, onStatusUpdate, onGameReady]);

  if (error) {
    return <div className="w-full h-full flex items-center justify-center text-red-600 font-bold">{error}</div>;
  }

  return (
    <div ref={containerRef} className="w-full h-full outline-none bg-white cursor-none" />
  );
});

GameCanvas.displayName = "GameCanvas";

export default GameCanvas;