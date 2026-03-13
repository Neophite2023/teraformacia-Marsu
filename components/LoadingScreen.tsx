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
      try {
        // Krok 1: Inicializácia Audio Contextu
        setStatus('Kalibrácia audio senzorov...');
        sounds.resume(); 
        await new Promise(r => setTimeout(r, 100));
        setProgress(15);

        // Krok 2: Prednačítanie fontu Orbitron
        setStatus('Načítavam navigačné systémy (Fonty)...');
        await document.fonts.ready;
        if (isCancelled) return;
        setProgress(30);

        // Krok 3: Explicitné prednačítanie assetov
        setStatus('Skenujem povrch (Načítavam assety)...');
        const heavyAlienImg = new Image();
        const imgLoadPromise = new Promise<void>((resolve) => {
          heavyAlienImg.onload = () => resolve();
          heavyAlienImg.onerror = () => resolve();
          heavyAlienImg.src = 'velky_alien.png';
        });
        await imgLoadPromise;
        if (isCancelled) return;
        setProgress(50);

        // Krok 4: "Shader Warm-up" - Eliminácia micro-stutteringu
        // Vykreslíme kritické objekty na neviditeľný canvas, aby prehliadač skompiloval cesty a shadery
        setStatus('Zahrievam grafické procesory (Pre-rendering)...');
        await new Promise<void>(resolve => {
            const offscreen = document.createElement('canvas');
            offscreen.width = 100;
            offscreen.height = 100;
            const ctx = offscreen.getContext('2d');
            if (ctx) {
                // Skúsime aspoň jeden render cyklus pre aliena a kráter (ako referenciu)
                ctx.beginPath();
                ctx.arc(50, 50, 40, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.01)';
                ctx.fill();
                
                // Vykonáme niekoľko komplexných operácií
                ctx.globalAlpha = 0.5;
                const grad = ctx.createRadialGradient(50, 50, 0, 50, 50, 50);
                grad.addColorStop(0, 'white');
                grad.addColorStop(1, 'black');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 100, 100);
            }
            setTimeout(resolve, 300); // Dáme prehliadaču čas na spracovanie
        });
        if (isCancelled) return;
        setProgress(85);

        // Krok 5: Dokončenie
        setStatus('Teraformácia pripravená...');
        setProgress(100);

        setTimeout(() => {
          if (!isCancelled) onLoadComplete();
        }, 300);

      } catch (err) {
        console.error('Core loading failed', err);
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

