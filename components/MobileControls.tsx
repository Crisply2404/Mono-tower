import React, { useMemo, useRef, useState } from 'react';

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

  const dpadRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const activeDirRef = useRef<string | null>(null);
  const activeActionRef = useRef<string | null>(null);
  const activeActionPointerIdRef = useRef<number | null>(null);
  const rotateArmedRef = useRef<boolean>(true);

  const dpadPointerIdRef = useRef<number | null>(null);

  const dirFromDpadPoint = (clientX: number, clientY: number): string | null => {
    const el = dpadRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

    // Normalize to [-1, 1] where center is (0,0)
    const nx = (x / rect.width) * 2 - 1;
    const ny = (y / rect.height) * 2 - 1;

    // 8-way by angle; always returns a direction inside the D-pad area.
    const angle = Math.atan2(ny, nx); // [-pi, pi]

    // Split circle into 8 sectors (each 45deg). Use a +22.5deg offset for nearest.
    const step = Math.PI / 4;
    const idx = Math.round((angle + Math.PI) / step) % 8;
    // idx mapping (starting at left, going CCW):
    // 0:left,1:up-left,2:up,3:up-right,4:right,5:down-right,6:down,7:down-left
    switch (idx) {
      case 0:
        return 'left';
      case 1:
        return 'up-left';
      case 2:
        return 'up';
      case 3:
        return 'up-right';
      case 4:
        return 'right';
      case 5:
        return 'down-right';
      case 6:
        return 'down';
      case 7:
        return 'down-left';
      default:
        return null;
    }
  };

  const actionFromPoint = (clientX: number, clientY: number): string | null => {
    const root = actionsRef.current;
    if (!root) return null;
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const actionEl = el?.closest?.('[data-action]') as HTMLElement | null;
    if (!actionEl || !root.contains(actionEl)) return null;
    return actionEl.getAttribute('data-action');
  };

  const setKeyActive = (key: string, isPressed: boolean) => {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (isPressed) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const releaseDir = () => {
    const prev = activeDirRef.current;
    if (prev) {
      onInput(prev, false);
      setKeyActive(prev, false);
    }
    activeDirRef.current = null;
  };

  const pressDir = (nextDir: string | null) => {
    const prev = activeDirRef.current;
    if (prev === nextDir) return;
    if (prev) {
      onInput(prev, false);
      setKeyActive(prev, false);
    }
    activeDirRef.current = nextDir;
    if (nextDir) {
      onInput(nextDir, true);
      setKeyActive(nextDir, true);
    }
  };

  const releaseAction = () => {
    const prev = activeActionRef.current;
    if (prev) {
      onInput(prev, false);
      setKeyActive(prev, false);
    }
    activeActionRef.current = null;
    activeActionPointerIdRef.current = null;
  };

  const pressAction = (nextAction: string | null, pointerId?: number) => {
    if (typeof pointerId === 'number') activeActionPointerIdRef.current = pointerId;

    const prev = activeActionRef.current;

    // If finger is not on any action, release immediately.
    if (!nextAction) {
      if (prev) {
        onInput(prev, false);
        setKeyActive(prev, false);
      }
      activeActionRef.current = null;
      return;
    }

    // If staying on the same button, do nothing (prevents rotate multi-trigger on jitter).
    if (prev === nextAction) return;

    // Switch buttons: release previous first.
    if (prev) {
      onInput(prev, false);
      setKeyActive(prev, false);
    }

    activeActionRef.current = nextAction;

    if (nextAction === 'rotateLeft' || nextAction === 'rotateRight') {
      // One-shot rotate: only trigger when armed; requires leaving button or lifting finger to re-arm.
      if (!rotateArmedRef.current) return;
      rotateArmedRef.current = false;

      setKeyActive(nextAction, true);
      onInput(nextAction, true);
      // Keep pressed visual feedback briefly until release; actual release happens on up/leave.
      return;
    }

    // Continuous action (jump): press and hold until finger leaves or lifts.
    onInput(nextAction, true);
    setKeyActive(nextAction, true);
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

  const isDirActive = (dir: string) => activeKeys.has(dir);

  const DPadBtn = ({ dir, rot }: { dir: string, rot: number }) => (
    <div className={getBtnClass(isDirActive(dir), dir.includes('-'))}>
      <ArrowIcon rot={rot} />
    </div>
  );

  const dpadHandlers = useMemo(() => {
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (dpadPointerIdRef.current !== null && dpadPointerIdRef.current !== e.pointerId) return;
      dpadPointerIdRef.current = e.pointerId;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      pressDir(dirFromDpadPoint(e.clientX, e.clientY));
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (dpadPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      pressDir(dirFromDpadPoint(e.clientX, e.clientY));
    };
    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (dpadPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      releaseDir();
      dpadPointerIdRef.current = null;
    };
    const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
      if (dpadPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      releaseDir();
      dpadPointerIdRef.current = null;
    };
    return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
  }, []);

  const actionsHandlers = useMemo(() => {
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      // Allow D-pad and actions simultaneously by tracking separate pointer IDs.
      activeActionPointerIdRef.current = e.pointerId;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      rotateArmedRef.current = true;
      pressAction(actionFromPoint(e.clientX, e.clientY), e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeActionPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      const next = actionFromPoint(e.clientX, e.clientY);
      if (!next) {
        // Leaving the action buttons re-arms rotate for the next entry.
        rotateArmedRef.current = true;
      }
      pressAction(next);
    };
    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeActionPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      releaseAction();
      rotateArmedRef.current = true;
    };
    const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeActionPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      releaseAction();
      rotateArmedRef.current = true;
    };
    return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-row items-end justify-between p-4 pb-8 md:p-8 md:pb-12 z-50 select-none touch-none md:hidden">
      
      {/* LEFT: 8-WAY D-PAD */}
      <div 
        ref={dpadRef}
        className="pointer-events-auto w-48 aspect-square grid grid-cols-3 grid-rows-3 gap-1 touch-none"
        {...dpadHandlers}
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
        ref={actionsRef}
        className="pointer-events-auto flex flex-col items-end touch-none -mr-4 -mb-4 p-4"
        {...actionsHandlers}
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