/**
 * Komponenta hlavného menu (titulná obrazovka).
 * Extrahované z App.tsx.
 */

import React from 'react';

interface MainMenuProps {
  hasSave: boolean;
  onNewGame: () => void;
  onContinue: () => void;
}

const MainMenu: React.FC<MainMenuProps> = ({ hasSave, onNewGame, onContinue }) => (
  <div className="flex items-center justify-center min-h-screen relative overflow-hidden font-rajdhani text-slate-100">
    <div className="absolute inset-0 bg-[#020617]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#451a03] via-[#1a0c02] to-[#020617] opacity-80"></div>
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-[#451a03] rounded-full blur-[180px] opacity-30 animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-blue-900 rounded-full blur-[160px] opacity-20"></div>
    </div>

    <div className="relative z-10 max-w-2xl w-full p-12 space-y-12 bg-black/50 backdrop-blur-3xl border border-white/10 rounded-[50px] text-center shadow-[0_0_120px_rgba(69,26,3,0.4)]">
      <div className="space-y-6">
        <h1 className="text-7xl font-orbitron font-bold text-transparent bg-clip-text bg-gradient-to-b from-[#f97316] to-[#451a03] tracking-tighter drop-shadow-2xl uppercase">
          Project Mars
        </h1>
        <p className="text-slate-300 text-xl leading-relaxed font-light px-4">
          Píše sa rok <span className="text-[#f97316] font-extrabold">2142</span>. Planéta Mars je zamrznutá pustatina.
          Vašou úlohou je vybudovať infraštruktúru potrebnú na terraformáciu.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <button
          onClick={onNewGame}
          className="group relative w-full py-7 bg-gradient-to-r from-[#451a03] to-[#f97316] hover:from-[#f97316] hover:to-[#451a03] text-white font-orbitron font-bold text-2xl rounded-2xl transition-all duration-500 shadow-[0_0_40px_rgba(249,115,22,0.3)] overflow-hidden"
        >
          <span className="relative z-10 tracking-widest uppercase">SPUSTIŤ NOVÚ MISIU</span>
        </button>

        {hasSave && (
          <button
            onClick={onContinue}
            className="group relative w-full py-6 bg-slate-800/80 hover:bg-slate-700 text-slate-100 font-orbitron font-bold text-xl rounded-2xl transition-all duration-300 border border-white/10 shadow-xl overflow-hidden"
          >
            <span className="relative z-10 tracking-widest flex items-center justify-center gap-4 uppercase">
              POKRAČOVAŤ v MISII
            </span>
          </button>
        )}
      </div>

      <p className="text-xs text-slate-600 uppercase tracking-[0.3em] font-medium pt-4">
        AIVA-OS v4.2 // DEEP SPACE EXPLORATION // PROTOCOL MARS
      </p>
    </div>
  </div>
);

export default MainMenu;
