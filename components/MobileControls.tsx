import React, { useCallback, useEffect, useRef, useState } from 'react';

interface MobileControlsProps {
  onInput: (action: string, isPressed: boolean) => void;
}

// Unified Arrow Icon
const ArrowIcon = ({ rot = 0 }: { rot: number }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className="pointer-events-none w-[40%] h-[40%]" 
    style={{ transform: `rotate(${rot}deg)` }}
  >
    <path d="M12 4L4 12H9V20H15V12H20L12 4Z" />
  </svg>
);

const MobileControls: React.FC<MobileControlsProps> = ({ onInput }) => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  
  // Refs to track state without re-rendering listeners
  const currentLeftAction = useRef<string | null>(null);
  const currentRightAction = useRef<string | null>(null);
  const leftTouchId = useRef<number | null>(null);
  const rightTouchId = useRef<number | null>(null);
  const dpadRef = useRef<HTMLDivElement>(null);

  // Stable ref for the callback
  const onInputRef = useRef(onInput);
  useEffect(() => { onInputRef.current = onInput; }, [onInput]);

  const mapDirToKeys = (dir: string): string[] => {
    const map: Record<string, string[]> = {
      'up': ['up'],
      'down': ['down'],
      'left': ['left'],
      'right': ['right'],
      'up-left': ['up', 'left'],
      'up-right': ['up', 'right'],
      'down-left': ['down', 'left'],
      'down-right': ['down', 'right'],
    };
    return map[dir] || [];
  };

  const setPressed = useCallback((key: string, isPressed: boolean) => {
    onInputRef.current(key, isPressed);
    setActiveKeys(prev => {
      const next = new Set(prev);
      if (isPressed) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const releaseLeftAll = useCallback(() => {
    const keys = Array.from(activeKeys).filter(k => k === 'up' || k === 'down' || k === 'left' || k === 'right');
    keys.forEach(k => setPressed(k, false));
    currentLeftAction.current = null;
    leftTouchId.current = null;
  }, [activeKeys, setPressed]);

  const releaseRightAll = useCallback(() => {
    const keys = Array.from(activeKeys).filter(k => k === 'jump' || k === 'rotateLeft' || k === 'rotateRight');
    keys.forEach(k => setPressed(k, false));
    currentRightAction.current = null;
    rightTouchId.current = null;
  }, [activeKeys, setPressed]);

  const applyLeftDir = useCallback((dir: string | null) => {
    const prevDir = currentLeftAction.current;
    if (prevDir === dir) return;

    if (prevDir) {
      const prevKeys = new Set(mapDirToKeys(prevDir));
      prevKeys.forEach(k => setPressed(k, false));
    }

    if (dir) {
      const nextKeys = new Set(mapDirToKeys(dir));
      nextKeys.forEach(k => setPressed(k, true));
    }

    currentLeftAction.current = dir;
  }, [setPressed]);

  const applyRightAction = useCallback((action: string | null) => {
    const prevAction = currentRightAction.current;
    if (prevAction === action) return;

    if (prevAction) setPressed(prevAction, false);
    if (action) setPressed(action, true);
    currentRightAction.current = action;
  }, [setPressed]);

  // --- GLOBAL RELEASE HANDLER ---
  // We use a global listener to catch releases even if the finger drifts off the button.
  useEffect(() => {
    const handleGlobalLift = (e: TouchEvent) => {
      // 1. Precise Check: Did specific fingers lift?
      // changedTouches contains ONLY the fingers that just triggered the event (lifted/canceled)
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        
        if (t.identifier === leftTouchId.current) {
          releaseLeftAll();
        }
        
        if (t.identifier === rightTouchId.current) {
          releaseRightAll();
        }
      }

      // 2. Fail-safe: If screen is empty, clear everything.
      // This catches edge cases where identifiers might get desynced.
      if (e.touches.length === 0) {
        releaseLeftAll();
        releaseRightAll();
      }
    };

    // Use passive: false to ensure we can control behavior if needed, though mostly needed for move
    document.addEventListener('touchend', handleGlobalLift);
    document.addEventListener('touchcancel', handleGlobalLift);

    return () => {
      document.removeEventListener('touchend', handleGlobalLift);
      document.removeEventListener('touchcancel', handleGlobalLift);
      
      // Cleanup on unmount
      if (onInputRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (currentLeftAction.current) mapDirToKeys(currentLeftAction.current!).forEach(k => onInputRef.current(k, false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (currentRightAction.current) onInputRef.current(currentRightAction.current!, false);
      }
    };
  }, [releaseLeftAll, releaseRightAll]);


  // --- LEFT HAND: GEOMETRIC D-PAD ---
  const handleLeftTouch = (e: React.TouchEvent) => {
    e.preventDefault(); 
    e.stopPropagation();

    let touch: React.Touch | undefined;

    // If starting, take the new touch
    if (e.type === 'touchstart') {
       touch = e.changedTouches[0];
       leftTouchId.current = touch.identifier;
    } 
    // If moving, find our tracked touch
    else {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === leftTouchId.current) {
          touch = e.changedTouches[i];
          break;
        }
      }
    }

    if (touch && dpadRef.current) {
      const rect = dpadRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = touch.clientX - centerX;
      const dy = touch.clientY - centerY;
      
      // Deadzone in center
      if (Math.sqrt(dx * dx + dy * dy) < 15) {
        applyLeftDir(null);
        return;
      }

      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      let dir = null;
      
      // 8-way directional logic
      if (angle > -22.5 && angle <= 22.5) dir = 'right';
      else if (angle > 22.5 && angle <= 67.5) dir = 'down-right';
      else if (angle > 67.5 && angle <= 112.5) dir = 'down';
      else if (angle > 112.5 && angle <= 157.5) dir = 'down-left';
      else if (angle > 157.5 || angle <= -157.5) dir = 'left';
      else if (angle > -157.5 && angle <= -112.5) dir = 'up-left';
      else if (angle > -112.5 && angle <= -67.5) dir = 'up';
      else if (angle > -67.5 && angle <= -22.5) dir = 'up-right';

      applyLeftDir(dir);
    }
  };

  // --- RIGHT HAND: ELEMENT TRACKING ---
  const handleRightTouch = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let touch: React.Touch | undefined;

    if (e.type === 'touchstart') {
        touch = e.changedTouches[0];
        rightTouchId.current = touch.identifier;
    } else {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === rightTouchId.current) {
            touch = e.changedTouches[i];
            break;
          }
        }
    }

    if (!touch) return;

    // Check what is under the finger
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const actionEl = el?.closest('[data-action]'); 
    
    if (actionEl instanceof HTMLElement && actionEl.dataset.action) {
      applyRightAction(actionEl.dataset.action);
    } else {
      // Finger is on screen but slid off buttons -> cancel input
      applyRightAction(null);
    }
  };


  // --- STYLES ---
  const getBtnClass = (isActive: boolean, isSmall: boolean = false) => `
    border-2 border-black 
    flex items-center justify-center 
    select-none touch-none 
    w-full h-full aspect-square 
    transition-colors duration-75 
    p-0 m-0 leading-none
    ${isActive ? 'bg-black text-white' : 'bg-white text-black'}
    ${isSmall ? 'text-xs' : 'text-lg font-bold'}
  `;

  const DPadBtn = ({ dir, rot }: { dir: string, rot: number }) => (
    <div className={getBtnClass(activeKeys.has(dir), dir.includes('-'))}>
      <ArrowIcon rot={rot} />
    </div>
  );

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-row items-end justify-between p-4 pb-8 md:p-8 md:pb-12 z-50 select-none touch-none md:hidden">
      
      {/* LEFT: 8-WAY D-PAD */}
      <div 
        ref={dpadRef}
        className="pointer-events-auto w-48 h-48 grid grid-cols-3 grid-rows-3 gap-1 touch-none"
        onTouchStart={handleLeftTouch}
        onTouchMove={handleLeftTouch}
        onTouchEnd={releaseLeftAll}
        onTouchCancel={releaseLeftAll}
      >
        <DPadBtn dir="up-left" rot={-45} />
        <DPadBtn dir="up" rot={0} />
        <DPadBtn dir="up-right" rot={45} />
        
        <DPadBtn dir="left" rot={-90} />
        <div className="bg-white/10" /> 
        <DPadBtn dir="right" rot={90} />
        
        <DPadBtn dir="down-left" rot={-135} />
        <DPadBtn dir="down" rot={180} />
        <DPadBtn dir="down-right" rot={135} />
      </div>

      {/* RIGHT: ACTION PAD */}
      <div 
        className="pointer-events-auto flex flex-col items-end touch-none -mr-4 -mb-4 p-4"
        onTouchStart={handleRightTouch}
        onTouchMove={handleRightTouch}
        onTouchEnd={releaseRightAll}
        onTouchCancel={releaseRightAll}
      >
        
        {/* Rotation Controls */}
        {/* w-[9rem] matches the JUMP button width exactly */}
        <div className="flex justify-between w-[9rem] mb-4 shrink-0">
           <div className="w-16 h-16" data-action="rotateLeft">
             <div className={getBtnClass(activeKeys.has('rotateLeft'))}>
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-1/2 h-1/2 pointer-events-none">
                 <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                 <path d="M3 3v5h5" />
               </svg>
             </div>
           </div>
           
           <div className="w-16 h-16" data-action="rotateRight">
             <div className={getBtnClass(activeKeys.has('rotateRight'))}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-1/2 h-1/2 pointer-events-none">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
             </div>
           </div>
        </div>

        {/* JUMP Button */}
        <div className="w-[9rem] h-[9rem] shrink-0" data-action="jump">
           <div className={getBtnClass(activeKeys.has('jump'))}>
             <span className="text-xl font-bold tracking-widest pointer-events-none">JUMP</span>
           </div>
        </div>
      </div>

    </div>
  );
};

export default MobileControls;