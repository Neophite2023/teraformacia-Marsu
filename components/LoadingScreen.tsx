import React, { useEffect, useState } from 'react';
import { sounds } from './SoundManager';

// Tento modul bude zaisťovať prednačítanie všetkých assetov
interface LoadingScreenProps {
  onLoadComplete: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onLoadComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Inicializácia systémov...');

  useEffect(() => {
    let isCancelled = false;

    const runPreloadSequence = async () => {
      // Failsafe: Ak sa čokoľvek zasekne, po 6 sekundách hru spustíme tak či tak
      const failsafeTimer = setTimeout(() => {
        if (!isCancelled) {
          console.warn('Loading failsafe triggered');
          onLoadComplete();
        }
      }, 6000);

      try {
        // Krok 1: Audio
        setStatus('Kalibrácia audio senzorov...');
        try { sounds.resume(); } catch(e) { /* Audio context might not be resumed without user interaction */ }
        await new Promise(r => setTimeout(r, 200));
        if (isCancelled) return;
        setProgress(25);

        // Krok 2: Assety (Fonty neriešime separátne, načítajú sa priebežne)
        setStatus('Skenujem povrch (Načítavam assety)...');
        const heavyAlienImg = new Image();
        const imgLoadPromise = new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 2000); // Max 2s na aliena
          heavyAlienImg.onload = () => { clearTimeout(t); resolve(); };
          heavyAlienImg.onerror = () => { clearTimeout(t); resolve(); };
          // V Electron/Vite produkcii je cesta v assets/
          heavyAlienImg.src = 'assets/velky_alien.png';
        });
        await imgLoadPromise;
        if (isCancelled) return;
        setProgress(60);

        // Krok 3: Pre-rendering
        setStatus('Zahrievam grafické procesory (Pre-rendering)...');
        await new Promise<void>(resolve => {
            const offscreen = document.createElement('canvas');
            offscreen.width = 100; offscreen.height = 100;
            const ctx = offscreen.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'rgba(255,255,255,0.01)';
                ctx.fillRect(0, 0, 100, 100);
            }
            setTimeout(resolve, 400);
        });
        if (isCancelled) return;
        setProgress(90);

        // Krok 4: Dokončenie
        setStatus('Teraformácia pripravená...');
        setProgress(100);
        clearTimeout(failsafeTimer);

        setTimeout(() => {
          if (!isCancelled) onLoadComplete();
        }, 300);

      } catch (err) {
        console.error('Loading sequence error', err);
        clearTimeout(failsafeTimer);
        onLoadComplete();
      }
    };

    runPreloadSequence();

    return () => {
      isCancelled = true;
    };
  }, [onLoadComplete]);

  return (
    <div className="w-full h-full absolute inset-0 bg-black flex flex-col items-center justify-center font-orbitron text-slate-100 z-[9999]">
      
      <h1 className="text-5xl font-bold tracking-widest text-[#ce4c29] mb-8 drop-shadow-[0_0_15px_rgba(206,76,41,0.6)] animate-pulse">
        TERAFORMÁCIA MARSU
      </h1>

      <div className="w-1/3 max-w-lg bg-gray-900 border border-slate-700/50 rounded-full h-6 mb-4 overflow-hidden relative shadow-[0_0_20px_rgba(40,150,250,0.1)]">
        <div 
          className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent"></div>
        </div>
      </div>

      <div className="flex justify-between w-1/3 max-w-lg text-sm text-slate-400">
        <p className="animate-pulse">{status}</p>
        <p>{Math.round(progress)}%</p>
      </div>

    </div>
  );
};

export default LoadingScreen;

