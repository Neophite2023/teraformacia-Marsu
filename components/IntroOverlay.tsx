/**
 * Overlay pre introvekovú sekvenciu (pristávanie).
 * Extrahované z App.tsx.
 */

import React from 'react';
import { IntroSequence } from '../types';

interface IntroOverlayProps {
  intro: IntroSequence;
}

const PHASE_MESSAGES: Record<string, string> = {
  FALLING: 'ORBITAL DESCENT SEQUENCE INITIATED...',
  LANDED: 'TOUCHDOWN CONFIRMED. STABILIZING...',
  RAMP_EXTENDING: 'DEPLOYING RAMP...',
  ROVER_EXITING: 'ROVER DEPLOYMENT...',
};

const IntroOverlay: React.FC<IntroOverlayProps> = ({ intro }) => {
  if (!intro.active) return null;

  const message = PHASE_MESSAGES[intro.phase] || 'ROVER DEPLOYMENT...';

  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      <div className="absolute top-0 w-full h-[10vh] bg-black border-b border-blue-500/30"></div>
      <div className="absolute bottom-0 w-full h-[10vh] bg-black border-t border-blue-500/30 flex items-center justify-center">
        <p className="text-blue-400 font-orbitron uppercase tracking-widest animate-pulse text-sm">
          {message}
        </p>
      </div>
    </div>
  );
};

export default IntroOverlay;
