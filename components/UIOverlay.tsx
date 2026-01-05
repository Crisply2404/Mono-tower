import React from 'react';

interface UIOverlayProps {
  score: number;
  message: string;
  isLoading: boolean;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ score, message, isLoading }) => {
  return (
    <>
      {/* Loading Screen */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-20">
          <div className="text-2xl font-black mb-2 tracking-widest animate-pulse">LOADING ENGINE...</div>
          <div className="w-16 h-1 bg-black animate-pulse"></div>
        </div>
      )}

      {/* Persistent HUD */}
      {/* Mobile: Smaller font (text-sm), closer to edge (top-2 left-2) */}
      {/* Desktop: Larger font (text-3xl), standard margin (top-6 left-6) */}
      <div className="absolute top-2 left-2 md:top-6 md:left-6 font-black text-sm md:text-3xl bg-white/90 px-2 py-1 border-2 border-transparent pointer-events-none select-none z-10 backdrop-blur-sm">
        HEIGHT: {score}m
      </div>

      {/* Alert Messages */}
      {message && !isLoading && (
        <div className="absolute top-16 md:top-6 right-4 md:right-6 animate-bounce z-20">
            <div className="text-red-600 font-black text-xs md:text-sm bg-white px-3 py-2 border-2 border-red-600 uppercase tracking-wide shadow-md">
            {message}
            </div>
        </div>
      )}

      {/* Controls Overlay - HIDDEN on mobile to avoid blocking inputs */}
      <div className="absolute bottom-4 right-4 text-right pointer-events-none select-none z-10 opacity-70 hidden md:block">
        <div className="bg-white/80 p-2 text-xs font-bold leading-relaxed tracking-tight">
          <span className="block">W / A / S / D - MOVE</span>
          <span className="block">SPACE - JUMP</span>
          <span className="block">ARROWS - ROTATE CAM</span>
        </div>
      </div>
    </>
  );
};

export default UIOverlay;