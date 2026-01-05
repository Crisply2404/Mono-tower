import React, { useCallback, useRef, useState } from 'react';
import GameCanvas, { GameCanvasRef } from './components/GameCanvas';
import MobileControls from './components/MobileControls';
import UIOverlay from './components/UIOverlay';

const App: React.FC = () => {
  const [score, setScore] = useState(0);
  const [debugMsg, setDebugMsg] = useState<string>('');
  const [gameState, setGameState] = useState<'loading' | 'playing' | 'gameover'>('loading');
  
  // Reference to game engine to pass button inputs
  const gameRef = useRef<GameCanvasRef>(null);

  const handleScoreUpdate = useCallback((newScore: number) => {
    setScore(newScore);
  }, []);

  const handleStatusUpdate = useCallback((msg: string) => {
    setDebugMsg(msg);
  }, []);

  const handleGameReady = useCallback(() => {
    setGameState('playing');
  }, []);

  const handleControlInput = (action: string, isPressed: boolean) => {
    if (gameRef.current) {
      gameRef.current.handleInput(action, isPressed);
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-white text-black font-sans select-none overflow-hidden touch-none">
      {/* DESKTOP LAYOUT: title on top + framed game area */}
      <div className="hidden md:flex w-full h-full flex-col items-center justify-start pt-6 pb-4 px-6">
        <header className="w-full max-w-6xl text-center pointer-events-none">
          <h1 className="text-5xl font-black tracking-tighter uppercase border-b-4 border-black inline-block pb-1 bg-white/90 backdrop-blur-sm">
            MONO TOWER
          </h1>
        </header>

        <div className="w-full max-w-6xl flex-1 mt-5 min-h-0">
          <div className="relative w-full h-full border-4 border-black bg-white rounded-sm overflow-hidden">
            <div className="relative w-full h-full overflow-hidden">
              <GameCanvas
                ref={gameRef}
                onScoreUpdate={handleScoreUpdate}
                onStatusUpdate={handleStatusUpdate}
                onGameReady={handleGameReady}
              />
            </div>

            <UIOverlay
              score={score}
              message={debugMsg}
              isLoading={gameState === 'loading'}
            />
          </div>
        </div>
      </div>

      {/* MOBILE LAYOUT: unchanged full screen */}
      <div
        className="md:hidden relative w-full h-full bg-white"
        style={{
          boxSizing: 'border-box',
        }}
      >
        <div className="relative w-full h-full overflow-hidden">
          <GameCanvas
            ref={gameRef}
            onScoreUpdate={handleScoreUpdate}
            onStatusUpdate={handleStatusUpdate}
            onGameReady={handleGameReady}
          />
        </div>

        <UIOverlay
          score={score}
          message={debugMsg}
          isLoading={gameState === 'loading'}
        />

        {/* Mobile Controls Overlay */}
        <MobileControls onInput={handleControlInput} />
      </div>
    </div>
  );
};

export default App;