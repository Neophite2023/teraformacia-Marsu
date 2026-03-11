
import React, { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { GameState, ResourceType, BuildingType, EnvFeature } from '../types';
import { MAP_SIZE, TERRAFORM_STAGES, LASER_RANGE, BUILDING_STATS, LASER_COOLDOWN, BUILDING_ZONE_RADIUS, FOG_GRID_SIZE, SYNTHESIZER_TIME, TANKER_CAPACITY } from '../constants';
import heavyAlienImgUrl from '../assets/velky_alien.png';

const heavyAlienImg = new Image();
heavyAlienImg.src = heavyAlienImgUrl;

interface Particle {
  x: number;
  y: number;
  life: number;
  size: number;
  vx: number;
  vy: number;
  color?: string;
}

interface TireTrack {
  x: number;
  y: number;
  rotation: number;
  life: number; // 1.0 to 0.0
  createdAt: number;
}

interface GameCanvasProps {
  stateRef: MutableRefObject<GameState>;
  onSelectBuildingId?: (id: string | null) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ stateRef, onSelectBuildingId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const hasInitializedPosRef = useRef(false);
  const harvesterLastPosRef = useRef<Record<string, { x: number, y: number }>>({});
  const harvesterTrackAccumulatorsRef = useRef<Record<string, number>>({});
  const walkDistanceRef = useRef(0);
  const trackDistAccumulatorRef = useRef(0);
  const heatParticlesRef = useRef<Particle[]>([]);
  const dustParticlesRef = useRef<Particle[]>([]);
  const tireTracksRef = useRef<TireTrack[]>([]);
  const staticLayerRef = useRef<HTMLCanvasElement | null>(null);
  const staticLayerCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const staticLayerOriginRef = useRef({ x: 0, y: 0 });
  const staticLayerSizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);

  // Mouse selection logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onSelectBuildingId) return;

    const handleMouseDown = (e: MouseEvent) => {
      const state = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      // Transform to world coordinates
      const camX = state.player.x;
      const camY = state.player.y;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      const worldX = camX + (mouseX - centerX) / CAMERA_ZOOM;
      const worldY = camY + (mouseY - centerY) / CAMERA_ZOOM;

      // Find building at world coordinates
      const clickedBuilding = state.buildings.find(b => {
        const dist = Math.sqrt(Math.pow(b.x - worldX, 2) + Math.pow(b.y - worldY, 2));
        const radius = (b.type === BuildingType.REFINERY || b.type === BuildingType.WATER_PUMP || b.type === BuildingType.SYNTHESIZER) ? 80 : 50;
        return dist < radius;
      });

      if (clickedBuilding) {
        onSelectBuildingId(clickedBuilding.id);
      } else {
        // Deselect if clicking empty space (and not in build mode)
        if (!state.isBuildMode) {
          onSelectBuildingId(null);
        }
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    return () => canvas.removeEventListener('mousedown', handleMouseDown);
  }, [onSelectBuildingId, stateRef]);

  const STATIC_LAYER_MARGIN = 300;
  const MAX_HEAT_PARTICLES = 400;
  const MAX_DUST_PARTICLES = 800;
  const MAX_TIRE_TRACKS = 1200; // Increased to accommodate more vehicles
  const DRAW_RADIUS = 1400;
  const DRAW_RADIUS_SQ = DRAW_RADIUS * DRAW_RADIUS;
  const LOD_NEAR = 900;
  const LOD_NEAR_SQ = LOD_NEAR * LOD_NEAR;
  const CAMERA_ZOOM = 1.5; // midway between original (1x) and 2x zoom

  // Pomocná funkcia na kontrolu viditeľnosti (Fog of War)
  const isChunkExplored = (objX: number, objY: number, chunks: Record<string, boolean>) => {
    const gx = Math.floor(objX / FOG_GRID_SIZE);
    const gy = Math.floor(objY / FOG_GRID_SIZE);
    return !!chunks[`${gx}_${gy}`];
  };

  const drawCraterBase = (ctx: CanvasRenderingContext2D, f: EnvFeature) => {
    if (!f.points) return;
    ctx.save();
    ctx.translate(f.x, f.y);

    // Ostré svetlo zľava trochu zhora
    const globalLightAngle = -Math.PI * 0.85;
    const localLightAngle = globalLightAngle - f.rotation;
    const lightDx = Math.cos(globalLightAngle);
    const lightDy = Math.sin(globalLightAngle);
    const seed = Math.floor(Math.abs(f.x * 7 + f.y * 13)) % 1000;

    // --- FUNKCIE PRE GENERÁCIE POLYGÓNOV A TIENOV ---
    // Funkcia pre zubatý lúčovitý displacement z existujúceho polygónu
    const extrudePoints = (basePoints: {x:number, y:number}[], scaleMultiplier: number, noiseAmp: number, noiseFreq: number) => {
        return basePoints.map((p, i) => {
            const angle = Math.atan2(p.y, p.x);
            const dist = Math.sqrt(p.x*p.x + p.y*p.y);
            const noise = (Math.sin(angle * noiseFreq + seed) + Math.cos(angle * (noiseFreq*1.7) - seed)) * noiseAmp;
            const newDist = dist * scaleMultiplier + noise;
            return { x: Math.cos(angle) * newDist, y: Math.sin(angle) * newDist };
        });
    };

    const drawPolygon = (pts: {x:number, y:number}[]) => {
        ctx.beginPath();
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
    };

    ctx.rotate(f.rotation);

    // 0. EJECTA (Vrstva vyvrhnutého materiálu okolo krátera)
    const ejectaLayer = extrudePoints(f.points, 1.4, f.size*0.15, 8);
    drawPolygon(ejectaLayer);
    const ejectaGrad = ctx.createRadialGradient(0, 0, f.size * 0.6, 0, 0, f.size * 1.5);
    // Hrdzavejšie farby bližšie k foto (podklad je #8c4524)
    ejectaGrad.addColorStop(0, 'rgba(110, 50, 25, 0.4)');
    ejectaGrad.addColorStop(0.5, 'rgba(130, 60, 30, 0.2)');
    ejectaGrad.addColorStop(1, 'rgba(140, 65, 30, 0)');
    ctx.fillStyle = ejectaGrad;
    ctx.fill();

    // Radial ejecta lines (rilles/spokes)
    const streakCount = 15 + (seed % 10);
    ctx.lineWidth = 1;
    for (let i = 0; i < streakCount; i++) {
      const a = ((seed + i * 29) % 360) * Math.PI / 180;
      const r1 = f.size * 1.0;
      const r2 = f.size * (1.2 + ((seed + i * 11) % 20) * 0.03);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      // Zig-zag čiary von
      ctx.lineTo(Math.cos(a+0.05) * (r1+r2)/2, Math.sin(a+0.05) * (r1+r2)/2);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.strokeStyle = `rgba(80, 35, 15, ${0.1 + ((seed + i) % 10) * 0.015})`;
      ctx.stroke();
    }

    // 1. OUTER RIM SHADOW (Vrhnutý tieň na okolitý terén - pravá strana)
    ctx.save();
    const shadowShift = Math.max(3, f.size * 0.08);
    // Vrháme ostrý stmavovací tieň opačným smerom k svetlu
    ctx.translate(-lightDx * shadowShift, -lightDy * shadowShift);
    const rimPoints = extrudePoints(f.points, 1.08, f.size*0.02, 12);
    drawPolygon(rimPoints);
    ctx.fillStyle = 'rgba(40, 15, 5, 0.35)'; // Tmavý hrdzavý tieň
    ctx.fill();
    ctx.restore();

    // 2. MAIN RIM (Zvýšený okrajový hrebeň krátera)
    drawPolygon(rimPoints);
    const rimGrad = ctx.createLinearGradient(
        Math.cos(localLightAngle)*f.size, Math.sin(localLightAngle)*f.size,
        -Math.cos(localLightAngle)*f.size, -Math.sin(localLightAngle)*f.size
    );
    // Ľavá strana (nasvietená)
    rimGrad.addColorStop(0, '#d88b5a');
    rimGrad.addColorStop(0.3, '#b86b3e');
    // Pravá strana (vzadu za hrebeňom)
    rimGrad.addColorStop(0.7, '#6b2e15');
    rimGrad.addColorStop(1, '#4a1e0c');
    ctx.fillStyle = rimGrad;
    ctx.fill();

    // 3. INTERNAL TERRACES (Schodovité strmé steny krátera smerom k dnu)
    const terracesCount = f.size > 50 ? 2 : 1;
    let currentInners = f.points;
    
    for (let t = 0; t <= terracesCount; t++) {
        // Zmenšujeme kráter smerom dnu
        const scale = 1.0 - (t+1) * (0.8 / (terracesCount + 1));
        const innerPoints = extrudePoints(currentInners, scale, f.size*0.015, 15+t*5);
        
        ctx.save();
        // Ostrý vnútorný tieň od hrany (Padá z hrebeňa na protiľahlú pravú stenu)
        const innerShadowShift = Math.max(2, f.size * 0.1 * (t===0 ? 1 : 0.5));
        ctx.translate(-lightDx * innerShadowShift, -lightDy * innerShadowShift);
        drawPolygon(innerPoints);
        ctx.fillStyle = 'rgba(25, 8, 2, 0.7)'; // Ostrý čierno-hnedý tieň
        ctx.fill();
        ctx.restore();

        // Samotná stena terasy
        drawPolygon(innerPoints);
        const wallGrad = ctx.createLinearGradient(
            Math.cos(localLightAngle)*f.size*scale, Math.sin(localLightAngle)*f.size*scale,
            -Math.cos(localLightAngle)*f.size*scale, -Math.sin(localLightAngle)*f.size*scale
        );
        // Pri t==terracesCount sme už na dne (najtmavšie)
        if (t === terracesCount) {
            // Dno (Floor)
            wallGrad.addColorStop(0, '#2e1206');
            wallGrad.addColorStop(0.5, '#4a200e');
            wallGrad.addColorStop(1, '#8c4524'); // Odráža svetlo svietiacej steny vľavo
        } else {
            // Skala pod hranou (pravá strana pod tieňom je extrémne tmavá, ľavá chytá svetlo)
            wallGrad.addColorStop(0, '#1c0a03'); 
            wallGrad.addColorStop(0.6, '#5e2a12');
            wallGrad.addColorStop(1, '#a65e34');
        }
        ctx.fillStyle = wallGrad;
        ctx.fill();
        currentInners = innerPoints; // Ďalšia terasa vychádza z aktuálnej
    }

    const floorRadius = f.size * 0.2;

    // 4. CENTRAL PEAK (Mnohé veľké marťanské krátery majú vrcholovú horu v strede)
    if (f.size > 80) {
        ctx.save();
        const peakRadius = f.size * 0.15;
        // Podstava vrchu
        const peakPoints = [];
        for (let i = 0; i < 7; i++) {
            const angle = (i/7) * Math.PI*2;
            const r = peakRadius * (0.7 + (seed % (i+1)) * 0.1);
            peakPoints.push({x: Math.cos(angle)*r, y: Math.sin(angle)*r});
        }
        
        // Tieň vrcholu 
        ctx.translate(-lightDx * peakRadius * 0.4, -lightDy * peakRadius * 0.4);
        drawPolygon(peakPoints);
        ctx.fillStyle = 'rgba(20, 5, 0, 0.6)';
        ctx.fill();
        ctx.restore();

        // Samotný vrchol nasvietený
        drawPolygon(peakPoints);
        const peakGrad = ctx.createLinearGradient(
            Math.cos(localLightAngle)*peakRadius, Math.sin(localLightAngle)*peakRadius,
            -Math.cos(localLightAngle)*peakRadius, -Math.sin(localLightAngle)*peakRadius
        );
        peakGrad.addColorStop(0, '#d88b5a');
        peakGrad.addColorStop(1, '#2e1206');
        ctx.fillStyle = peakGrad;
        ctx.fill();
    }

    // 5. MINI CRATERS ON FLOOR (Drobné impakty na dne pre rozbitie dokonalej plochy)
    if (f.size > 80 && seed % 5 === 0) {
        const poxCount = (seed % 3) + 1;
        for (let i = 0; i < poxCount; i++) {
            const poxR = f.size * 0.4 * ((seed % (i+1))/3);
            const poxA = ((seed * i * 31) % 360) * Math.PI / 180;
            const px = Math.cos(poxA) * poxR;
            const py = Math.sin(poxA) * poxR;
            const pSize = 1.0 + (seed % 2);
            
            // Mini kráter - tmavá dierka a svetlý highlight na ľavo
            ctx.beginPath();
            ctx.arc(px, py, pSize, 0, Math.PI*2);
            ctx.fillStyle = '#1c0a03';
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(px + Math.cos(localLightAngle)*pSize*0.5, py + Math.sin(localLightAngle)*pSize*0.5, pSize*0.6, 0, Math.PI*2);
            ctx.fillStyle = '#b86b3e';
            ctx.fill();
        }
    }

    // 6. OSTRÉ HRANY (Highglights and crevasses strokes na ráfiku)
    // Nasvietené hrany do žlto-pieskovej
    drawPolygon(rimPoints);
    const lineGrad = ctx.createLinearGradient(
        Math.cos(localLightAngle)*f.size, Math.sin(localLightAngle)*f.size,
        -Math.cos(localLightAngle)*f.size, -Math.sin(localLightAngle)*f.size
    );
    lineGrad.addColorStop(0, 'rgba(230, 160, 100, 0.6)');
    lineGrad.addColorStop(0.3, 'rgba(230, 160, 100, 0)');
    lineGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
    lineGrad.addColorStop(1, 'rgba(10, 5, 2, 0.5)'); // Spodný tmavý outline
    ctx.lineJoin = 'round';
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  };

  const drawCraterDynamic = (ctx: CanvasRenderingContext2D, f: EnvFeature, timeSec: number) => {
    if (!f.points || !f.hasIce) return;
    const melt = f.meltProgress || 0;
    ctx.save();
    
    // Create a clip path for the crater interior - this ensures everything stays inside the crater
    ctx.beginPath();
    ctx.moveTo(f.points[0].x, f.points[0].y);
    f.points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.clip();

    const craterRadius = f.size;

    // 1. Wet Shoreline Effect (Subtle darkening of the crater floor where water will be)
    if (melt > 0.05) {
      ctx.beginPath();
      ctx.moveTo(f.points[0].x, f.points[0].y);
      f.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = `rgba(10, 5, 2, ${0.1 + melt * 0.15})`; // Darker "wet" ground
      ctx.fill();
    }

    // 2. Water Layer (Fills the irregular crater shape)
    if (melt > 0.01) {
      ctx.save();
      
      // Instead of scaling, we use the full crater points but control visibility with a gradient
      ctx.beginPath();
      ctx.moveTo(f.points[0].x, f.points[0].y);
      f.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();

      // The water level "rises" by increasing the gradient radius and opacity
      const waterGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, craterRadius);
      const waterAlpha = 0.4 + melt * 0.4;
      
      // Deep water in center, shallow at the irregular edges
      waterGrad.addColorStop(0, `rgba(12, 74, 110, ${waterAlpha})`);
      waterGrad.addColorStop(0.5 * melt, `rgba(14, 165, 233, ${waterAlpha * 0.7})`);
      waterGrad.addColorStop(Math.min(0.9, melt * 1.2), `rgba(186, 230, 253, 0.2)`);
      waterGrad.addColorStop(1, `rgba(186, 230, 253, 0)`);

      ctx.fillStyle = waterGrad;
      ctx.fill();

      // Subtle water waves following the crater shape
      if (melt > 0.1) {
        const waveOffset = timeSec * 0.6;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + melt * 0.1})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        // Waves are drawn as concentric irregular lines
        for (let step = 0.3; step <= melt; step += 0.25) {
          ctx.save();
          ctx.scale(step, step);
          ctx.beginPath();
          ctx.moveTo(f.points[0].x, f.points[0].y + Math.sin(waveOffset + step) * 2);
          f.points.forEach((p, i) => {
            const waveY = Math.sin(waveOffset + i * 0.5) * 1.5;
            ctx.lineTo(p.x, p.y + waveY);
          });
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 3. Ice Layer (Recedes from the irregular edges)
    if (melt < 1.0) {
      ctx.save();
      
      // Use the actual crater points for the ice shape
      ctx.beginPath();
      ctx.moveTo(f.points[0].x, f.points[0].y);
      f.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();

      const shimmer = Math.sin(timeSec * 2 + f.x) * 0.05;
      const iceAlpha = Math.max(0, 1.0 - melt * 1.1);
      
      // The ice "shrinks" by pulling the gradient towards the center
      const iceGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, craterRadius);
      const iceCoreLimit = Math.max(0, 0.8 - melt * 1.2);
      const iceEdgeLimit = Math.max(0.1, 1.0 - melt * 1.0);

      iceGrad.addColorStop(0, `rgba(255, 255, 255, ${iceAlpha})`);
      iceGrad.addColorStop(iceCoreLimit, `rgba(224, 242, 254, ${iceAlpha * 0.9})`);
      iceGrad.addColorStop(iceEdgeLimit, `rgba(186, 230, 253, ${iceAlpha * 0.6 + shimmer})`);
      iceGrad.addColorStop(Math.min(1.0, iceEdgeLimit + 0.1), `rgba(125, 211, 252, 0)`);

      ctx.fillStyle = iceGrad;
      ctx.fill();

      // Ice cracks (only visible on remaining ice)
      if (melt < 0.85) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 - melt * 0.4})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const seed = Math.floor(f.x + f.y);
        const crackScale = 1.0 - melt;
        for (let i = 0; i < 4; i++) {
          const angle = (seed % 10 + i * 1.5);
          const r = craterRadius * crackScale * (0.5 + (seed % 5) * 0.1);
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          
          const branchAngle = angle + 0.5;
          ctx.moveTo(Math.cos(angle) * r * 0.5, Math.sin(angle) * r * 0.5);
          ctx.lineTo(Math.cos(branchAngle) * r * 0.8, Math.sin(branchAngle) * r * 0.8);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  };

  const drawRockBase = (ctx: CanvasRenderingContext2D, f: EnvFeature) => {
    if (!f.points) return;
    const cv = f.colorVariant || 0;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rotation);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.moveTo(f.points[0].x + 2, f.points[0].y + 2);
    f.points.forEach(p => ctx.lineTo(p.x + 2, p.y + 2)); ctx.closePath(); ctx.fill();
    // Rock body – Mars-like brownish-grey tones
    const r = 50 + Math.floor(cv * 30);
    const g = 38 + Math.floor(cv * 20);
    const b = 28 + Math.floor(cv * 15);
    ctx.beginPath(); ctx.moveTo(f.points[0].x, f.points[0].y);
    f.points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`; ctx.fill();
    // Light highlight edge
    if (f.size > 8) {
      const lg = ctx.createLinearGradient(-f.size, -f.size, f.size, f.size);
      lg.addColorStop(0, 'rgba(180, 155, 130, 0.3)');
      lg.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
      ctx.strokeStyle = lg; ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  };


  const renderStaticLayer = React.useCallback((originX: number, originY: number, layerW: number, layerH: number, features: EnvFeature[]) => {
    if (!staticLayerRef.current || !staticLayerCtxRef.current) return;
    const layerCtx = staticLayerCtxRef.current;
    layerCtx.clearRect(0, 0, layerW, layerH);
    layerCtx.save();
    layerCtx.translate(-originX, -originY);
    const maxX = originX + layerW;
    const maxY = originY + layerH;
    
    // Pridanie jemného šumu (procedurálny piesok) pre realistickejšiu textúru
    // Namiesto drahého per-pixel noise vytvoríme rýchly pseudo-noise pomocou malých čiarociek
    layerCtx.save();
    layerCtx.fillStyle = 'rgba(100, 40, 15, 0.05)';
    for(let i=0; i<300; i++) {
        const nx = originX + Math.random() * layerW;
        const ny = originY + Math.random() * layerH;
        layerCtx.fillRect(nx, ny, 2 + Math.random()*3, 1 + Math.random()*2);
    }
    layerCtx.fillStyle = 'rgba(220, 140, 80, 0.04)';
    for(let i=0; i<300; i++) {
        const nx = originX + Math.random() * layerW;
        const ny = originY + Math.random() * layerH;
        layerCtx.fillRect(nx, ny, 1 + Math.random()*2, 1 + Math.random()*2);
    }
    layerCtx.restore();

    features.forEach(f => {
      if (f.type !== 'rock' && f.type !== 'crater') return;
      const radius = f.size + 40;
      if (f.x + radius < originX || f.x - radius > maxX || f.y + radius < originY || f.y - radius > maxY) return;
      if (f.type === 'rock') drawRockBase(layerCtx, f);
      if (f.type === 'crater') drawCraterBase(layerCtx, f);
    });
    layerCtx.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    let animationFrameId: number;

    const render = () => {
      if (!canvas) return;
      const currentState = stateRef.current;
      const { player, buildings, creatures, harvesters, discoveredResources, stats, projectiles, envFeatures, isBuildMode, selectedBuilding, selectedBuildingId, intro, time, exploredChunks } = currentState;

      if (!hasInitializedPosRef.current) {
        lastPosRef.current = { x: player.x, y: player.y };
        hasInitializedPosRef.current = true;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;

      const nowMs = performance.now();
      const timeSec = nowMs * 0.001;

      const dx = player.x - lastPosRef.current.x;
      const dy = player.y - lastPosRef.current.y;
      const distMoved = Math.sqrt(dx * dx + dy * dy);

      if (distMoved > 0.1) {
        walkDistanceRef.current += distMoved;
        trackDistAccumulatorRef.current += distMoved;

        if (trackDistAccumulatorRef.current > 7) {
          trackDistAccumulatorRef.current = 0;
          const trackRotation = player.rotation;
          const offsets = [-15, 15];
          offsets.forEach(offset => {
            const tx = player.x + Math.cos(trackRotation + Math.PI / 2) * offset;
            const ty = player.y + Math.sin(trackRotation + Math.PI / 2) * offset;
            if (tireTracksRef.current.length < MAX_TIRE_TRACKS) {
              tireTracksRef.current.push({
                x: tx,
                y: ty,
                rotation: trackRotation,
                life: 1.0,
                createdAt: nowMs
              });
            }
          });
        }
      }
      lastPosRef.current = { x: player.x, y: player.y };

      // Tire tracks for harvesters (Miners and Tankers)
      harvesters.forEach(h => {
        const lastHPos = harvesterLastPosRef.current[h.id] || { x: h.x, y: h.y };
        const dhx = h.x - lastHPos.x;
        const dhy = h.y - lastHPos.y;
        const hDistMoved = Math.sqrt(dhx * dhx + dhy * dhy);

        if (hDistMoved > 0.1) {
          const hAccumulator = (harvesterTrackAccumulatorsRef.current[h.id] || 0) + hDistMoved;
          
          if (hAccumulator > 12) { // Slightly larger interval for harvesters
            harvesterTrackAccumulatorsRef.current[h.id] = 0;
            const trackRotation = h.rotation;
            // Different width for different types if needed, currently 12 is good for both
            const offsets = [-12, 12];
            offsets.forEach(offset => {
              const tx = h.x + Math.cos(trackRotation + Math.PI / 2) * offset;
              const ty = h.y + Math.sin(trackRotation + Math.PI / 2) * offset;
              if (tireTracksRef.current.length < MAX_TIRE_TRACKS) {
                tireTracksRef.current.push({
                  x: tx,
                  y: ty,
                  rotation: trackRotation,
                  life: 0.8, // Slightly more faint than player tracks
                  createdAt: nowMs
                });
              }
            });
          } else {
            harvesterTrackAccumulatorsRef.current[h.id] = hAccumulator;
          }
        }
        harvesterLastPosRef.current[h.id] = { x: h.x, y: h.y };
      });

      const heat = heatParticlesRef.current;
      let hW = 0;
      for (let i = 0; i < heat.length; i++) {
        const p = heat[i];
        p.life -= 0.015; p.x += p.vx; p.y += p.vy;
        if (p.life > 0) heat[hW++] = p;
      }
      heat.length = hW;

      const dust = dustParticlesRef.current;
      let dW = 0;
      for (let i = 0; i < dust.length; i++) {
        const p = dust[i];
        p.life -= 0.025; p.x += p.vx; p.y += p.vy; p.size *= 0.98;
        if (p.life > 0) dust[dW++] = p;
      }
      dust.length = dW;

      const tracks = tireTracksRef.current;
      let tW = 0;
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        const age = nowMs - t.createdAt;
        t.life = Math.max(0, 1.0 - age / 1000);
        if (t.life > 0) tracks[tW++] = t;
      }
      tracks.length = tW;

      harvesters?.forEach(h => {
        const dH = (h.x - player.x) * (h.x - player.x) + (h.y - player.y) * (h.y - player.y);
        if (dH > DRAW_RADIUS_SQ) return;
        if (h.state === 'MOVING_TO_RESOURCE' || h.state === 'RETURNING' || h.state === 'MOVING_TO_CRATER' || h.state === 'ALIGNING_TO_DOCK') {
          if (Math.random() < 0.3 && dustParticlesRef.current.length < MAX_DUST_PARTICLES) {
            dustParticlesRef.current.push({
              x: h.x + (Math.random() - 0.5) * 10, y: h.y + (Math.random() - 0.5) * 10,
              life: 0.5, size: 2 + Math.random() * 2,
              vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
              color: 'rgba(100, 80, 60, 0.2)'
            });
          }
        } else if (h.state === 'MINING') {
          if (dustParticlesRef.current.length < MAX_DUST_PARTICLES) {
            dustParticlesRef.current.push({
              x: h.x + Math.cos(h.rotation) * 30 + (Math.random() - 0.5) * 10,
              y: h.y + Math.sin(h.rotation) * 30 + (Math.random() - 0.5) * 10,
              life: 0.6, size: 3 + Math.random() * 4,
              vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
              color: 'rgba(200, 200, 200, 0.3)'
            });
          }
        }
      });

      buildings.forEach(b => {
        const dB = (b.x - player.x) * (b.x - player.x) + (b.y - player.y) * (b.y - player.y);
        if (dB > DRAW_RADIUS_SQ) return;
        const isActive = b.progress >= 1 && b.health > 0.1;
        if (isActive && Math.random() < 0.15) {
          if (b.type === BuildingType.HEATER) {
            if (heatParticlesRef.current.length < MAX_HEAT_PARTICLES) {
              heatParticlesRef.current.push({
                x: b.x + (Math.random() - 0.5) * 40, y: b.y + (Math.random() - 0.5) * 40,
                life: 1.0, size: 2 + Math.random() * 3, vx: (Math.random() - 0.5) * 0.4, vy: -0.8 - Math.random() * 1.2
              });
            }
          } else if (b.type === BuildingType.DRILL) {
            if (dustParticlesRef.current.length < MAX_DUST_PARTICLES) {
              dustParticlesRef.current.push({
                x: b.x + (Math.random() - 0.5) * 30, y: b.y + (Math.random() - 0.5) * 30,
                life: 1.0, size: 4 + Math.random() * 6,
                vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
                color: Math.random() > 0.5 ? 'rgba(120, 53, 15, 0.4)' : 'rgba(165, 42, 42, 0.3)'
              });
            }
          } else if (b.type === BuildingType.REFINERY && isActive) {
            if (Math.random() < 0.2) {
              if (dustParticlesRef.current.length < MAX_DUST_PARTICLES) {
                dustParticlesRef.current.push({
                  x: b.x - 25, y: b.y - 30,
                  life: 2.0, size: 4 + Math.random() * 5,
                  vx: (Math.random() - 0.5) * 0.5, vy: -1 - Math.random(),
                  color: 'rgba(200, 200, 200, 0.2)'
                });
              }
            }
          }
        }

        if (b.type === BuildingType.SYNTHESIZER && b.isProcessing && Math.random() < 0.4) {
          if (heatParticlesRef.current.length < MAX_HEAT_PARTICLES) {
            heatParticlesRef.current.push({
              x: b.x + (Math.random() - 0.5) * 20, y: b.y + (Math.random() - 0.5) * 20,
              life: 0.8, size: 1 + Math.random() * 3, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5,
              color: '#fff'
            });
          }
          if (Math.random() < 0.1 && dustParticlesRef.current.length < MAX_DUST_PARTICLES) {
            dustParticlesRef.current.push({
              x: b.x, y: b.y,
              life: 0.5, size: 1, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
              color: '#38bdf8'
            });
          }
        }
      });

      const ti = stats.temperature + stats.pressure + stats.oxygen + stats.biomass;
      let stageInfo = TERRAFORM_STAGES[0];
      for (let i = 0; i < TERRAFORM_STAGES.length; i++) {
        if (ti >= TERRAFORM_STAGES[i].ti) stageInfo = TERRAFORM_STAGES[i];
      }

      let totalGen = 0;
      let totalReq = 0;
      buildings.forEach(b => {
        if (b.progress >= 1 && b.health > 0.1) {
          const bStats = BUILDING_STATS[b.type];
          if (bStats && bStats.power) totalGen += bStats.power;
          if (bStats && bStats.powerReq) totalReq += bStats.powerReq;
        }
      });
      const hasPower = totalGen >= totalReq;

      const zoom = CAMERA_ZOOM;
      const viewW = width / zoom;
      const viewH = height / zoom;
      const CULL_MARGIN = 120; // small buffer to avoid pop-in
      const viewMinX = player.x - viewW / 2 - CULL_MARGIN;
      const viewMaxX = player.x + viewW / 2 + CULL_MARGIN;
      const viewMinY = player.y - viewH / 2 - CULL_MARGIN;
      const viewMaxY = player.y + viewH / 2 + CULL_MARGIN;
      const isInView = (x: number, y: number, radius: number = 0) =>
        x + radius >= viewMinX && x - radius <= viewMaxX && y + radius >= viewMinY && y - radius <= viewMaxY;

      const layerW = viewW + STATIC_LAYER_MARGIN * 2;
      const layerH = viewH + STATIC_LAYER_MARGIN * 2;
      let needsRedraw = false;
      const dpr = dprRef.current || 1;
      const pixelW = Math.ceil(layerW * dpr);
      const pixelH = Math.ceil(layerH * dpr);
      if (!staticLayerRef.current || staticLayerSizeRef.current.w !== layerW || staticLayerSizeRef.current.h !== layerH || staticLayerRef.current.width !== pixelW || staticLayerRef.current.height !== pixelH) {
        const layerCanvas = staticLayerRef.current || document.createElement('canvas');
        layerCanvas.width = pixelW;
        layerCanvas.height = pixelH;
        const layerCtx = layerCanvas.getContext('2d');
        if (layerCtx) {
          layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          staticLayerRef.current = layerCanvas;
          staticLayerCtxRef.current = layerCtx;
          staticLayerSizeRef.current = { w: layerW, h: layerH };
          needsRedraw = true;
        }
      }
      const origin = staticLayerOriginRef.current;
      const centerX = origin.x + layerW / 2;
      const centerY = origin.y + layerH / 2;
      if (needsRedraw || Math.abs(player.x - centerX) > STATIC_LAYER_MARGIN / 2 || Math.abs(player.y - centerY) > STATIC_LAYER_MARGIN / 2) {
        const newOriginX = player.x - layerW / 2;
        const newOriginY = player.y - layerH / 2;
        staticLayerOriginRef.current = { x: newOriginX, y: newOriginY };
        renderStaticLayer(newOriginX, newOriginY, layerW, layerH, envFeatures);
      }

      ctx.clearRect(0, 0, width, height);
      ctx.save();

      let shakeX = 0;
      let shakeY = 0;
      if (intro.phase === 'LANDED' && intro.progress < 0.5) {
        const intensity = (0.5 - intro.progress) * 12;
        shakeX = (Math.random() - 0.5) * intensity;
        shakeY = (Math.random() - 0.5) * intensity;
      }

      const camX = width / 2 - player.x * zoom + shakeX;
      const camY = height / 2 - player.y * zoom + shakeY;
      ctx.translate(camX, camY);
      ctx.scale(zoom, zoom);

      ctx.fillStyle = stageInfo.color;
      ctx.fillRect(player.x - viewW / 2 - 200, player.y - viewH / 2 - 200, viewW + 400, viewH + 400);

      if (staticLayerRef.current) {
        const layerOrigin = staticLayerOriginRef.current;
        const layerSize = staticLayerSizeRef.current;
        ctx.drawImage(staticLayerRef.current, layerOrigin.x, layerOrigin.y, layerSize.w, layerSize.h);
      }

      if (isBuildMode && selectedBuilding) {
        const rocket = envFeatures.find(f => f.type === 'rocket');
        if (rocket && isInView(rocket.x, rocket.y, BUILDING_ZONE_RADIUS)) {
          const gridSize = 100;
          const radiusSq = Math.pow(BUILDING_ZONE_RADIUS, 2);
          const gridPulse = 0.15 + Math.sin(timeSec * 3) * 0.05;

          ctx.save();
          const startX = Math.floor((rocket.x - BUILDING_ZONE_RADIUS) / gridSize) * gridSize;
          const endX = Math.ceil((rocket.x + BUILDING_ZONE_RADIUS) / gridSize) * gridSize;
          const startY = Math.floor((rocket.y - BUILDING_ZONE_RADIUS) / gridSize) * gridSize;
          const endY = Math.ceil((rocket.y + BUILDING_ZONE_RADIUS) / gridSize) * gridSize;

          for (let gx = startX; gx <= endX; gx += gridSize) {
            for (let gy = startY; gy <= endY; gy += gridSize) {
              const dSq = Math.pow(gx - rocket.x, 2) + Math.pow(gy - rocket.y, 2);
              if (dSq <= radiusSq) {
                const distRatio = Math.sqrt(dSq) / BUILDING_ZONE_RADIUS;
                const edgeFade = Math.max(0, 1 - distRatio);

                ctx.fillStyle = `rgba(34, 197, 94, ${gridPulse * edgeFade})`;
                ctx.strokeStyle = `rgba(34, 197, 94, ${0.1 * edgeFade})`;
                ctx.lineWidth = 1;

                ctx.fillRect(gx - gridSize / 2 + 5, gy - gridSize / 2 + 5, gridSize - 10, gridSize - 10);
                ctx.strokeRect(gx - gridSize / 2 + 2, gy - gridSize / 2 + 2, gridSize - 4, gridSize - 4);
              }
            }
          }

          ctx.beginPath();
          ctx.arc(rocket.x, rocket.y, BUILDING_ZONE_RADIUS, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.2 + Math.sin(timeSec * 2) * 0.1})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([20, 15]);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.restore();
        }
      }

      const rocket = envFeatures.find(f => f.type === 'rocket');
      envFeatures.forEach(f => {
        const fRadius = f.type === 'rocket' ? 220 : (f.size || 0) + 60;
        if (!isInView(f.x, f.y, fRadius)) return;
        const dF = (f.x - player.x) * (f.x - player.x) + (f.y - player.y) * (f.y - player.y);
        if (dF > DRAW_RADIUS_SQ && intro.phase === 'FINISHED') return;
        if (f.type !== 'rocket' && !isChunkExplored(f.x, f.y, exploredChunks)) return;
        if (f.type === 'rock') return;

        if (f.type === 'rocket' && intro.active && intro.phase === 'FALLING' && intro.progress > 0.7) {
          for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 40;
            if (dustParticlesRef.current.length < MAX_DUST_PARTICLES) {
              dustParticlesRef.current.push({
                x: f.x + Math.cos(angle) * dist,
                y: f.y + Math.sin(angle) * dist,
                vx: Math.cos(angle) * (1 + Math.random() * 2),
                vy: Math.sin(angle) * (1 + Math.random() * 2),
                life: 1.0,
                size: 15 + Math.random() * 20,
                color: 'rgba(100, 80, 60, 0.3)'
              });
            }
          }
        }

        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rotation);

        if (f.type === 'rocket') {
          let rocketScale = 0.7;
          let shadowScale = 1;
          let shadowAlpha = 1;

          if (intro.active) {
            if (intro.phase === 'FALLING') {
              rocketScale = 0.7 * (1 + (1 - intro.progress) * 2);
              shadowScale = 0.2 + intro.progress * 0.8;
              shadowAlpha = intro.progress;
            }
          }

          ctx.scale(rocketScale, rocketScale);
          const distToPlayer = Math.sqrt(Math.pow(f.x - player.x, 2) + Math.pow(f.y - player.y, 2));
          const angleToPlayer = Math.atan2(player.y - f.y, player.x - f.x);
          let diff = angleToPlayer - f.rotation;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;

          const isPlayerApproachingRamp = (distToPlayer < 300 && Math.abs(diff) < 0.8);

          ctx.beginPath();
          const groundPulse = 1.0 + Math.sin(timeSec) * 0.05;
          ctx.ellipse(0, 0, 160 * groundPulse * shadowScale, 160 * groundPulse * shadowScale, 0, 0, Math.PI * 2);
          const scorchGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 160);
          scorchGrad.addColorStop(0, `rgba(0,0,0,${0.6 * shadowAlpha})`);
          scorchGrad.addColorStop(0.7, `rgba(0,0,0,${0.3 * shadowAlpha})`);
          scorchGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = scorchGrad;
          ctx.fill();

          if (intro.phase === 'FALLING') {
            ctx.save();
            const thrustSize = 80 + Math.random() * 20;
            const thrustGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, thrustSize);
            thrustGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            thrustGrad.addColorStop(0.3, 'rgba(251, 191, 36, 0.8)');
            thrustGrad.addColorStop(0.6, 'rgba(239, 68, 68, 0.4)');
            thrustGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            for (let t = 0; t < 4; t++) {
              ctx.save();
              ctx.rotate(t * Math.PI / 2 + Math.PI / 4);
              ctx.translate(60, 0);
              ctx.fillStyle = thrustGrad;
              ctx.beginPath();
              ctx.arc(0, 0, thrustSize * (0.8 + Math.random() * 0.2), 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
            ctx.restore();
          }

          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 10;
          for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(100, 0);
            ctx.stroke();
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.roundRect(90, -18, 30, 36, 6);
            ctx.fill();
            ctx.restore();
          }

          let rampFactor = 1.0;
          if (intro.active) {
            if (intro.phase === 'FALLING' || intro.phase === 'LANDED') rampFactor = 0;
            else if (intro.phase === 'RAMP_EXTENDING') rampFactor = intro.progress;
            else rampFactor = 1;
          }

          if (rampFactor > 0.01) {
            ctx.save();
            ctx.fillStyle = isPlayerApproachingRamp ? '#334155' : '#2a3544';
            ctx.strokeStyle = isPlayerApproachingRamp ? '#64748b' : '#475569';
            ctx.lineWidth = 4;
            const rampLength = 120 * rampFactor;
            ctx.beginPath();
            ctx.roundRect(40, -45, rampLength, 90, 8);
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 2;
            for (let r = 50; r < 40 + rampLength; r += 15) {
              ctx.beginPath(); ctx.moveTo(r, -40); ctx.lineTo(r, 40); ctx.stroke();
            }

            if (isPlayerApproachingRamp && intro.phase === 'FINISHED') {
              const scannerPos = 45 + ((timeSec * 80) % 110);
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
              ctx.lineWidth = 3;
              ctx.shadowBlur = 10;
              ctx.shadowColor = '#38bdf8';
              ctx.beginPath();
              ctx.moveTo(scannerPos, -42);
              ctx.lineTo(scannerPos, 42);
              ctx.stroke();
              ctx.shadowBlur = 0;

              ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
              const arrowPhase = (timeSec * 3) % 1;
              for (let i = 0; i < 3; i++) {
                const arrowX = 140 - (i * 30) - (arrowPhase * 30);
                if (arrowX > 45 && arrowX < 155) {
                  ctx.beginPath();
                  ctx.moveTo(arrowX, -10); ctx.lineTo(arrowX - 10, 0); ctx.lineTo(arrowX, 10);
                  ctx.stroke();
                }
              }
            }
            ctx.restore();
          }
        } else if (f.type === 'crater') {
          drawCraterDynamic(ctx, f, timeSec);
        }
        ctx.restore();
      });

      tireTracksRef.current.forEach(t => {
        if (!isInView(t.x, t.y, 20)) return;
        const dT = (t.x - player.x) * (t.x - player.x) + (t.y - player.y) * (t.y - player.y);
        if (dT > DRAW_RADIUS_SQ) return;
        if (!isChunkExplored(t.x, t.y, exploredChunks)) return;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rotation);
        ctx.scale(0.85, 0.85);
        ctx.fillStyle = `rgba(0, 0, 0, ${t.life * 0.2})`;
        ctx.beginPath();
        ctx.roundRect(-7, -5, 14, 10, 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${t.life * 0.05})`;
        ctx.lineWidth = 1;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath(); ctx.moveTo(k * 3, -5); ctx.lineTo(k * 3, 5); ctx.stroke();
        }
        ctx.restore();
      });

      heatParticlesRef.current.forEach(p => {
        if (!isInView(p.x, p.y, 15)) return;
        const dP = (p.x - player.x) * (p.x - player.x) + (p.y - player.y) * (p.y - player.y);
        if (dP > DRAW_RADIUS_SQ) return;
        if (!isChunkExplored(p.x, p.y, exploredChunks)) return;
        ctx.fillStyle = p.color || `rgba(249, 115, 22, ${p.life * 0.6})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });
      dustParticlesRef.current.forEach(p => {
        if (!isInView(p.x, p.y, 15)) return;
        const dP = (p.x - player.x) * (p.x - player.x) + (p.y - player.y) * (p.y - player.y);
        if (dP > DRAW_RADIUS_SQ) return;
        if (!isChunkExplored(p.x, p.y, exploredChunks)) return;
        ctx.fillStyle = p.color || `rgba(100, 100, 100, ${p.life * 0.4})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });

      discoveredResources.forEach(res => {
        if (!isInView(res.x, res.y, 20)) return;
        const dR = (res.x - player.x) * (res.x - player.x) + (res.y - player.y) * (res.y - player.y);
        if (dR > DRAW_RADIUS_SQ) return;
        if (!isChunkExplored(res.x, res.y, exploredChunks)) return;

        ctx.save(); ctx.translate(res.x, res.y);
        let color = '#fff';
        if (res.type === ResourceType.IRON) color = '#94a3b8';
        else if (res.type === ResourceType.SILICON) color = '#38bdf8';
        else if (res.type === ResourceType.MAGNESIUM) color = '#fbbf24';
        else if (res.type === ResourceType.TITANIUM) color = '#f1f5f9';
        if (dR > LOD_NEAR_SQ) {
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          return;
        }
        const pulse = 0.8 + Math.sin(timeSec * 4 + res.x) * 0.2;
        ctx.fillStyle = color + '22'; ctx.beginPath(); ctx.arc(0, 0, 16 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath();
        if (res.type === ResourceType.IRON) { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6); } }
        else if (res.type === ResourceType.SILICON) { ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); }
        else if (res.type === ResourceType.MAGNESIUM) { ctx.arc(-3, -2, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(3, -2, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, 3, 3.5, 0, Math.PI * 2); }
        else if (res.type === ResourceType.TITANIUM) { ctx.moveTo(0, -8); ctx.lineTo(5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5, 0); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      });

      buildings.forEach(b => {
        const bRadius = (b.type === BuildingType.REFINERY || b.type === BuildingType.WATER_PUMP || b.type === BuildingType.SYNTHESIZER) ? 120 : 90;
        if (!isInView(b.x, b.y, bRadius)) return;
        const dB = (b.x - player.x) * (b.x - player.x) + (b.y - player.y) * (b.y - player.y);
        if (dB > DRAW_RADIUS_SQ) return;
        if (!isChunkExplored(b.x, b.y, exploredChunks)) return;

        const isActive = b.progress >= 1 && b.health > 0.1;
        const isPowered = isActive && (hasPower || b.type === BuildingType.SOLAR_PANEL);
        ctx.save();
        ctx.translate(b.x, b.y);

        if (dB > LOD_NEAR_SQ) {
          const isLarge = b.type === BuildingType.REFINERY || b.type === BuildingType.WATER_PUMP || b.type === BuildingType.SYNTHESIZER;
          const size = isLarge ? 26 : 18;
          ctx.globalAlpha = isActive ? 0.8 : 0.4;
          ctx.fillStyle = isPowered ? '#60a5fa' : '#64748b';
          ctx.fillRect(-size / 2, -size / 2, size, size);
          ctx.restore();
          return;
        }

        if (b.id === selectedBuildingId) {
          ctx.save();
          const pulse = 1.0 + Math.sin(timeSec * 4) * 0.05;
          ctx.beginPath();
          const sides = 6;
          const radius = (b.type === BuildingType.REFINERY || b.type === BuildingType.WATER_PUMP || b.type === BuildingType.SYNTHESIZER) ? 85 * pulse : 65 * pulse;
          for (let i = 0; i <= sides; i++) {
            const a = (i / sides) * Math.PI * 2;
            ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
          }
          ctx.closePath();
          const isProcessingBuilding = b.type === BuildingType.SYNTHESIZER;
          ctx.strokeStyle = isProcessingBuilding ? 'rgba(56, 189, 248, 0.6)' : 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.lineDashOffset = -timeSec * 15;
          ctx.stroke();
          ctx.restore();
        }

        let buildScale = 0.7;
        if (b.type === BuildingType.REFINERY || b.type === BuildingType.WATER_PUMP || b.type === BuildingType.SYNTHESIZER) {
          buildScale = 1.3;
        }
        ctx.scale(buildScale, buildScale);

        ctx.globalAlpha = b.progress < 0.2 ? 0.3 : (0.5 + b.progress * 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(0, 15, 45, 22, 0, 0, Math.PI * 2); ctx.fill();

        if (b.type === BuildingType.SOLAR_PANEL) {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22 + 5);
          }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.stroke();
          const mastGrad = ctx.createLinearGradient(-5, -20, 5, 20);
          mastGrad.addColorStop(0, '#475569'); mastGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = mastGrad;
          ctx.beginPath(); ctx.roundRect(-5, -22, 10, 40, 2); ctx.fill();
          ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, -5, 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.stroke();
          const trackingRot = Math.sin(timeSec * 0.5) * 0.15;
          ctx.save();
          ctx.translate(0, -5);
          ctx.rotate(trackingRot);
          ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.roundRect(-24, -3, 48, 6, 2); ctx.fill();
          const drawDetailedWing = (x: number, y: number, isRight: boolean) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.roundRect(isRight ? 0 : -32, -24, 32, 48, 4); ctx.fill();
            ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#020617';
            ctx.beginPath(); ctx.roundRect(isRight ? 2 : -30, -22, 28, 44, 2); ctx.fill();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)'; ctx.lineWidth = 0.5;
            const startX = isRight ? 2 : -30;
            for (let i = 1; i < 4; i++) {
              ctx.beginPath(); ctx.moveTo(startX + i * 7, -22); ctx.lineTo(startX + i * 7, 22); ctx.stroke();
            }
            for (let j = 1; j < 6; j++) {
              ctx.beginPath(); ctx.moveTo(startX, -22 + j * 7.3); ctx.lineTo(startX + 28, -22 + j * 7.3); ctx.stroke();
            }
            ctx.restore();
          };
          drawDetailedWing(-24, 0, false);
          drawDetailedWing(24, 0, true);
          
          if (b.level === 2) {
            ctx.save();
            ctx.rotate(Math.PI / 2);
            drawDetailedWing(-24, 0, false);
            drawDetailedWing(24, 0, true);
            ctx.restore();
          }
          
          ctx.restore();
          if (isActive) {
            const ledPulse = 0.6 + Math.sin(timeSec * 4) * 0.4;
            ctx.fillStyle = `rgba(34, 197, 94, ${ledPulse})`;
            ctx.beginPath(); ctx.arc(0, -16, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 8; ctx.shadowColor = '#22c55e';
            ctx.beginPath(); ctx.arc(0, -16, 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
          }

        } else if (b.type === BuildingType.HEATER) {
          const sides = 6;
          const radius = 40;
          ctx.beginPath();
          for (let i = 0; i <= sides; i++) {
            const a = (i / sides) * Math.PI * 2 - Math.PI / 6;
            ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
          }
          ctx.closePath();
          const chassisGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
          chassisGrad.addColorStop(0, '#475569'); chassisGrad.addColorStop(0.5, '#1e293b'); chassisGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = chassisGrad; ctx.fill();
          ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-radius - 4, -10, 8, 20);
          ctx.fillRect(radius - 4, -10, 8, 20);
          ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#020617'; ctx.strokeStyle = '#92400e'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.roundRect(-12, -28, 24, 56, 6); ctx.fill(); ctx.stroke();
          const corePulse = isPowered ? (0.75 + Math.sin(timeSec * 10) * 0.25) : 0.2;
          const coreAlpha = isPowered ? (0.6 + Math.sin(timeSec * 5) * 0.4) : 0.1;
          if (isPowered) {
            ctx.save();
            ctx.shadowBlur = 15; ctx.shadowColor = '#f97316';
            ctx.fillStyle = `rgba(249, 115, 22, ${coreAlpha})`;
            ctx.beginPath(); ctx.roundRect(-8, -24 * corePulse, 16, 48 * corePulse, 4); ctx.fill();
            ctx.restore();
            for (let i = 0; i < 3; i++) {
              const waveY = -35 - ((timeSec * 40 + i * 25) % 60);
              const waveAlpha = 1 - (Math.abs(waveY + 35) / 60);
              ctx.strokeStyle = `rgba(251, 191, 36, ${waveAlpha * 0.4})`;
              ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(-18, waveY); ctx.quadraticCurveTo(0, waveY - 10, 18, waveY); ctx.stroke();
            }
          } else {
            ctx.fillStyle = '#451a03';
            ctx.beginPath(); ctx.roundRect(-8, -10, 16, 20, 2); ctx.fill();
          }
          ctx.strokeStyle = isPowered ? 'rgba(251, 191, 36, 0.4)' : 'rgba(146, 64, 14, 0.2)';
          ctx.lineWidth = 1;
          for (let j = -2; j <= 2; j++) {
            ctx.beginPath(); ctx.moveTo(-10, j * 10); ctx.lineTo(10, j * 10); ctx.stroke();
          }
          ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.roundRect(-16, 22, 32, 10, 2); ctx.fill();
          const blink = Math.sin(timeSec * 4) > 0;
          ctx.fillStyle = blink ? '#ef4444' : '#451a03'; ctx.beginPath(); ctx.arc(-10, 27, 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(0, 27, 1.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = isPowered ? '#38bdf8' : '#0369a1'; ctx.beginPath(); ctx.arc(10, 27, 1.5, 0, Math.PI * 2); ctx.fill();

        } else if (b.type === BuildingType.DRILL) {
          const vibration = isPowered ? Math.sin(timeSec * 60) * 1.5 : 0;
          ctx.translate(vibration, 0);
          const baseWidth = 80; const baseHeight = 40;
          const foundationGrad = ctx.createLinearGradient(-baseWidth / 2, 0, baseWidth / 2, baseHeight);
          foundationGrad.addColorStop(0, '#475569'); foundationGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = foundationGrad; ctx.beginPath(); ctx.roundRect(-baseWidth / 2, 0, baseWidth, baseHeight, 4); ctx.fill();
          ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.stroke();
          ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3; ctx.globalAlpha = 0.4;
          for (let i = -30; i < 40; i += 15) { ctx.beginPath(); ctx.moveTo(i, 2); ctx.lineTo(i + 8, 12); ctx.stroke(); }
          ctx.globalAlpha = 1;
          const pistonExt = isPowered ? (Math.sin(timeSec * 5) * 5 + 5) : 2;
          const drawPiston = (xPos: number) => {
            ctx.fillStyle = '#1e293b'; ctx.fillRect(xPos - 5, -10, 10, 25);
            ctx.fillStyle = '#94a3b8'; ctx.fillRect(xPos - 2, -10 - pistonExt, 4, 15);
            ctx.strokeStyle = '#0f172a'; ctx.strokeRect(xPos - 5, -10, 10, 25);
          };
          drawPiston(-25); drawPiston(25);
          ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.roundRect(-18, -45, 36, 45, 2); ctx.fill();
          ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#020617'; ctx.fillRect(-12, -40, 24, 10);
          if (isPowered) {
            const ledPulse = 0.5 + Math.sin(timeSec * 4) * 0.5;
            ctx.fillStyle = `rgba(56, 189, 248, ${ledPulse})`;
            ctx.fillRect(-10, -38, 20 * (0.4 + Math.sin(timeSec) * 0.2), 6);
          }
          ctx.save();
          ctx.rotate(Math.sin(timeSec * 80) * 0.02);
          const coneH = 35; const coneW = 28;
          ctx.beginPath(); ctx.moveTo(-coneW / 2, 0); ctx.lineTo(coneW / 2, 0); ctx.lineTo(0, coneH); ctx.closePath();
          const drillGrad = ctx.createLinearGradient(-coneW / 2, 0, coneW / 2, 0);
          drillGrad.addColorStop(0, '#94a3b8'); drillGrad.addColorStop(0.5, '#cbd5e1'); drillGrad.addColorStop(1, '#475569');
          ctx.fillStyle = drillGrad; ctx.fill();
          if (isPowered) {
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2;
            const threadOffset = (timeSec * 60) % 15;
            for (let t = 0; t < coneH; t += 8) {
              const y = t + (threadOffset % 8);
              if (y < coneH) {
                const wAtY = coneW * (1 - y / coneH);
                ctx.beginPath(); ctx.moveTo(-wAtY / 2, y); ctx.lineTo(wAtY / 2, y); ctx.stroke();
              }
            }
          }
          ctx.restore();
          ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(18, -25); ctx.quadraticCurveTo(35, -25, 35, 10); ctx.stroke();

        } else if (b.type === BuildingType.VEGETUBE) {
          ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.roundRect(-55, 12, 110, 18, 5); ctx.fill();
          const glassGrad = ctx.createLinearGradient(0, -28, 0, 17);
          glassGrad.addColorStop(0, 'rgba(200, 230, 255, 0.15)'); glassGrad.addColorStop(1, 'rgba(200, 230, 255, 0.35)');
          ctx.fillStyle = glassGrad; ctx.beginPath(); ctx.roundRect(-50, -28, 100, 45, 22); ctx.fill();
          ctx.fillStyle = '#422006'; ctx.beginPath(); ctx.roundRect(-42, 8, 84, 8, 4); ctx.fill();
          const cycleDuration = 10; const growthFactor = (timeSec % cycleDuration) / cycleDuration;
          if (isActive && b.progress > 0.1) {
            let idNum = 0; for (let k = 0; k < b.id.length; k++) idNum += b.id.charCodeAt(k);
            for (let i = 0; i < 5; i++) {
              const px = -32 + i * 16; const py = 10; const sway = Math.sin(timeSec * 2 + i) * 2;
              const stableRand = (((idNum + i * 137) % 100) / 100) * 0.5;
              const individualGrowth = Math.max(0, Math.min(1, (growthFactor - stableRand) / 0.45));
              const h = 20 * individualGrowth;
              if (h > 1.5) {
                ctx.strokeStyle = '#059669'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + sway, py - h / 2, px, py - h); ctx.stroke();
                if (individualGrowth > 0.25) { ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(px + 4, py - h / 2, 4 * individualGrowth, 0, Math.PI * 2); ctx.fill(); }
                if (individualGrowth > 0.85) { ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(px, py - h, 3, 0, Math.PI * 2); ctx.fill(); }
              }
            }
          }

        } else if (b.type === BuildingType.LASER_TOWER) {
          // --- UPDATED HOLOGRAPHIC SNIPER MODEL (CENTERED, DUAL RAILS, CYAN RECTOR) ---
          const rot = b.rotation || 0;
          const lastFire = b.lastFireTime || 0;
          const timeSinceFire = time - lastFire;
          const recoil = timeSinceFire < 0.1 ? (1 - timeSinceFire / 0.1) * 15 : 0;

          // 1. BASE: White Ceramic Circular Pedestal
          ctx.beginPath();
          ctx.arc(0, 0, 42, 0, Math.PI * 2);
          const baseGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 42);
          baseGrad.addColorStop(0, '#f8fafc');
          baseGrad.addColorStop(0.5, '#f1f5f9');
          baseGrad.addColorStop(1, '#e2e8f0');
          ctx.fillStyle = baseGrad;
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#eab308';
          for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * 36, Math.sin(angle) * 36, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }

          // --- NEW LASER TOWER DESIGN ---
          const isPowered = hasPower;

          // 1. Heavy Base Plate (Solid foundation)
          ctx.fillStyle = '#1e293b'; // Slate-800
          ctx.beginPath();
          // Octagonal base
          const baseR = 28;
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
            const bx = Math.cos(angle) * baseR;
            const by = Math.sin(angle) * baseR;
            if (i === 0) ctx.moveTo(bx, by);
            else ctx.lineTo(bx, by);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.stroke();

          // Base details (rivets)
          ctx.fillStyle = '#64748b';
          for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const bx = Math.cos(angle) * 22;
            const by = Math.sin(angle) * 22;
            ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fill();
          }

          // Turret Heading Transform
          ctx.save(); // Save for rotation
          ctx.rotate(rot);
          ctx.save();
          ctx.translate(-recoil, 0); // Recoil applied to the whole upper turret

          // 2. Turret Main Body (Housing)
          // Spherical Rear
          const rearGrad = ctx.createRadialGradient(-10, -5, 2, -10, 0, 20);
          rearGrad.addColorStop(0, '#94a3b8');
          rearGrad.addColorStop(1, '#475569');
          ctx.fillStyle = rearGrad;
          ctx.beginPath(); ctx.arc(-12, 0, 16, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.stroke();

          // Sensor Dome on Sphere (Top/Back)
          ctx.fillStyle = isPowered ? '#38bdf8' : '#334155'; // Cyan glow if powered
          if (isPowered) {
            ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 10;
          }
          ctx.beginPath(); ctx.arc(-18, 0, 6, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

          // Front Block (Housing for barrels)
          ctx.fillStyle = '#475569';
          ctx.beginPath();
          ctx.moveTo(-12, -18);
          ctx.lineTo(10, -14); // Sloped front
          ctx.lineTo(10, 14);
          ctx.lineTo(-12, 18);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // 3. Exposed Cables (connecting base to barrels)
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          // Top cable
          ctx.beginPath(); ctx.moveTo(5, -10); ctx.quadraticCurveTo(5, 0, 15, -6); ctx.stroke();
          // Bottom cable
          ctx.beginPath(); ctx.moveTo(5, 10); ctx.quadraticCurveTo(5, 0, 15, 6); ctx.stroke();

          // Ribbed texture on cables
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(8 + i * 2, -8 + i); ctx.lineTo(8 + i * 2, -4 + i); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(8 + i * 2, 8 - i); ctx.lineTo(8 + i * 2, 4 - i); ctx.stroke();
          }

          // 4. Dual Cannons
          const barrelL = 45;
          const barrelW = 8;
          const barrelGap = 5; // Distance from center

          const drawCannon = (yOffset: number) => {
            ctx.fillStyle = '#334155'; // Dark barrel
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5;

            // Main Barrel Cylinder
            ctx.beginPath(); ctx.roundRect(5, yOffset - barrelW / 2, barrelL, barrelW, 2);
            ctx.fill(); ctx.stroke();

            // Angled Tip (Muzzle Brake)
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.moveTo(5 + barrelL, yOffset - barrelW / 2);
            ctx.lineTo(5 + barrelL + 8, yOffset - barrelW / 2 - 2); // Flared top
            ctx.lineTo(5 + barrelL + 5, yOffset + barrelW / 2 + 2); // Angled back bottom
            ctx.lineTo(5 + barrelL, yOffset + barrelW / 2);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // Cooling Vents/Ribs on barrel
            ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
            for (let k = 1; k < 4; k++) {
              const x = 5 + k * 8;
              ctx.beginPath(); ctx.moveTo(x, yOffset - barrelW / 2 + 1); ctx.lineTo(x, yOffset + barrelW / 2 - 1); ctx.stroke();
            }
          };

          drawCannon(-8); // Left/Top Cannon
          drawCannon(8);  // Right/Bottom Cannon

          // 5. Electrical Arcs (Firing effect)
          if (timeSinceFire < 0.15 && isPowered) {
            ctx.save();
            ctx.strokeStyle = '#38bdf8'; // Electric Blue for Laser
            ctx.lineWidth = 2;
            ctx.shadowBlur = 8; ctx.shadowColor = '#38bdf8';
            ctx.globalAlpha = 1 - (timeSinceFire / 0.15); // Fade out

            // Arc between barrels
            ctx.beginPath();
            ctx.moveTo(25, -8);
            ctx.lineTo(30 + Math.random() * 5, -2);
            ctx.lineTo(28 + Math.random() * 5, 2);
            ctx.lineTo(25, 8);
            ctx.stroke();
            ctx.restore();
          }

          // 6. Muzzle Flash (Plasma discharge)
          if (timeSinceFire < 0.08) {
            ctx.save();
            ctx.translate(55, 0); // At tip
            ctx.shadowBlur = 30; ctx.shadowColor = '#38bdf8';
            ctx.fillStyle = '#fff';
            // Dual flash cores
            ctx.beginPath(); ctx.ellipse(0, -8, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(0, 8, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }

          ctx.restore(); // Recoil restore
          ctx.restore(); // Rotate restore

        } else if (b.type === BuildingType.REFINERY) {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath(); ctx.roundRect(-40, -30, 80, 60, 4); ctx.fill();
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.stroke();
          const drawTank = (tx: number, ty: number) => {
            const tankGrad = ctx.createLinearGradient(tx - 15, ty, tx + 15, ty);
            tankGrad.addColorStop(0, '#475569');
            tankGrad.addColorStop(0.5, '#64748b');
            tankGrad.addColorStop(1, '#334155');
            ctx.fillStyle = tankGrad;
            ctx.beginPath(); ctx.arc(tx, ty, 18, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(tx - 18, ty - 2, 36, 4);
          };
          drawTank(-20, -15);
          drawTank(20, -15);
          ctx.fillStyle = '#0f172a'; ctx.fillRect(-15, 10, 30, 20);
          ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-15, 25); ctx.lineTo(15, 25); ctx.stroke();
          const working = isActive && hasPower;
          ctx.fillStyle = working ? '#22c55e' : '#ef4444';
          ctx.beginPath(); ctx.arc(-25, 20, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(25, 20, 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-20, -15); ctx.quadraticCurveTo(0, -35, 20, -15); ctx.stroke();
        }
        else if (b.type === BuildingType.WATER_PUMP) {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath(); ctx.roundRect(-50, -30, 60, 60, 4); ctx.fill();
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-45, 10, 50, 20);
          ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-45, 25); ctx.lineTo(5, 25); ctx.stroke();
          const tankX = 30; const tankY = 0; const tankR = 25;
          ctx.fillStyle = '#0f172a';
          ctx.beginPath(); ctx.arc(tankX, tankY, tankR + 2, 0, Math.PI * 2); ctx.fill();
          const tankGrad = ctx.createLinearGradient(tankX - tankR, tankY - tankR, tankX + tankR, tankY + tankR);
          tankGrad.addColorStop(0, '#cbd5e1');
          tankGrad.addColorStop(0.5, '#94a3b8');
          tankGrad.addColorStop(1, '#475569');
          ctx.fillStyle = tankGrad;
          ctx.beginPath(); ctx.arc(tankX, tankY, tankR, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(tankX - 8, tankY - 18, 16, 36);
          const capacity = b.waterCapacity || 1000;
          const stored = b.storedWater || 0;
          const fillRatio = Math.min(1, stored / capacity);
          const barHeight = 32 * fillRatio;
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(tankX - 6, tankY + 16 - barHeight, 12, barHeight);
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(tankX - 6, tankY - 16, 6, 32);
          ctx.strokeStyle = '#64748b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(tankX, -10); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(tankX, 10); ctx.stroke();
          const working = isActive && hasPower;
          ctx.fillStyle = working ? '#22c55e' : '#ef4444';
          ctx.beginPath(); ctx.arc(-35, -20, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        else if (b.type === BuildingType.SYNTHESIZER) {
          ctx.save();
          const baseSides = 3; const baseRad = 55;
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * baseRad, Math.sin(a) * baseRad);
          }
          ctx.closePath();
          ctx.fillStyle = '#0f172a'; ctx.fill();
          ctx.strokeStyle = '#475569'; ctx.lineWidth = 3; ctx.stroke();
          const drawChamber = (angle: number, color: string) => {
            ctx.save();
            ctx.rotate(angle);
            ctx.translate(35, 0);
            ctx.fillStyle = '#1e293b';
            ctx.beginPath(); ctx.roundRect(-10, -10, 20, 20, 4); ctx.fill();
            ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.4;
            const pulse = 0.4 + Math.sin(timeSec * 3 + angle) * 0.2;
            ctx.beginPath(); ctx.arc(0, 0, 6 * pulse, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          };
          drawChamber(-Math.PI / 2, '#38bdf8');
          drawChamber(Math.PI / 6, '#fbbf24');
          drawChamber(5 * Math.PI / 6, '#f1f5f9');
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 4;
          for (let i = 0; i < 3; i++) {
            ctx.save();
            ctx.rotate((i / 3) * Math.PI * 2 - Math.PI / 2);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(35, 0); ctx.stroke();
            ctx.restore();
          }
          const isProcessing = b.isProcessing;
          const corePulse = isProcessing ? (0.8 + Math.sin(timeSec * 20) * 0.2) : (0.9 + Math.sin(timeSec * 2) * 0.1);
          ctx.fillStyle = '#0f172a';
          ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
          if (isProcessing) {
            ctx.save();
            ctx.shadowBlur = 20; ctx.shadowColor = '#fff';
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, 12 * corePulse, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * Math.PI * 2;
              ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 25, Math.sin(a) * 25); ctx.stroke();
            }
            ctx.restore();
          } else {
            ctx.fillStyle = '#1e293b';
            ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.stroke();
          }
          if (isProcessing) {
            const p = 1 - (b.processingTimer || 0) / SYNTHESIZER_TIME;
            ctx.beginPath();
            ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p));
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 4;
            ctx.stroke();
          }
          ctx.restore();
        }

        ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-25, 35, 50, 8);
        if (b.progress < 1) { ctx.fillStyle = '#3b82f6'; ctx.fillRect(-25, 35, 50 * b.progress, 4); }
        const hpColor = b.health < 0.3 ? '#ef4444' : (b.health < 0.7 ? '#f59e0b' : '#10b981');
        ctx.fillStyle = hpColor; ctx.fillRect(-25, 39, 50 * b.health, 4);
        ctx.restore();
      });

      harvesters?.forEach(h => {
        if (!isInView(h.x, h.y, 70)) return;
        const dH = (h.x - player.x) * (h.x - player.x) + (h.y - player.y) * (h.y - player.y);
        if (dH > DRAW_RADIUS_SQ) return;
        if (!isChunkExplored(h.x, h.y, exploredChunks)) return;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.rotation);
        ctx.scale(0.85, 0.85);

        if (dH > LOD_NEAR_SQ) {
          ctx.fillStyle = h.type === 'MINER' ? '#94a3b8' : '#38bdf8';
          ctx.fillRect(-8, -4, 16, 8);
          ctx.restore();
          return;
        }

        if (h.type === 'MINER') {
          const bodyW = 46; const bodyH = 41;

          // Large visible wheels (6 total - 3 on each side)
          const wheelXPositions = [-14, 0, 14];
          const wheelRadius = 8;

          // Draw wheels first (under body)
          wheelXPositions.forEach(xPos => {
            // Left wheels (Top side)
            ctx.fillStyle = '#1e293b';
            ctx.beginPath(); ctx.arc(xPos, -bodyH / 2 + 2, wheelRadius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.stroke();

            // Right wheels (Bottom side)
            ctx.fillStyle = '#1e293b';
            ctx.beginPath(); ctx.arc(xPos, bodyH / 2 - 2, wheelRadius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.stroke();

            // Wheel animation marks
            if (h.state === 'MOVING_TO_RESOURCE' || h.state === 'RETURNING' || h.state === 'ALIGNING_TO_DOCK') {
              const treadAngle = (timeSec * 10) % (Math.PI * 2);
              ctx.save(); ctx.translate(xPos, -bodyH / 2 + 2); ctx.rotate(treadAngle);
              ctx.fillStyle = '#475569'; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4); ctx.restore();
              ctx.save(); ctx.translate(xPos, bodyH / 2 - 2); ctx.rotate(treadAngle);
              ctx.fillStyle = '#475569'; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4); ctx.restore();
            }
          });

          // Main Body - Rounded "Beetle" shape
          // Dark gray industrial base
          ctx.fillStyle = '#475569';
          ctx.beginPath(); ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 12); ctx.fill();
          ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3; ctx.stroke();

          // --- Industrial Details ---

          // 1. Reinforced plating seams
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-10, -bodyH / 2); ctx.lineTo(-10, bodyH / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(10, -bodyH / 2); ctx.lineTo(10, bodyH / 2); ctx.stroke();

          // 2. Cooling Vents (Rear)
          ctx.fillStyle = '#1e293b';
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(-bodyW / 2 + 4, -6 + i * 5, 6, 3);
          }

          // 3. Rivets/Bolts
          ctx.fillStyle = '#94a3b8';
          [-bodyW / 2 + 3, bodyW / 2 - 3].forEach(x => {
            [-bodyH / 2 + 6, bodyH / 2 - 6].forEach(y => {
              ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
            });
          });

          // Orange Reinforced Top Panel
          ctx.fillStyle = '#ea580c';
          ctx.beginPath(); ctx.roundRect(-4, -bodyH / 2 + 4, bodyW / 2, bodyH - 8, 4); ctx.fill();

          // Caution Stripes on Orange Panel
          ctx.fillStyle = '#c2410c';
          ctx.beginPath();
          ctx.moveTo(0, -bodyH / 2 + 4); ctx.lineTo(4, -bodyH / 2 + 4); ctx.lineTo(-4, bodyH / 2 - 4); ctx.lineTo(-8, bodyH / 2 - 4);
          ctx.fill();

          // Cockpit / Sensor Unit
          ctx.fillStyle = '#334155';
          ctx.beginPath(); ctx.roundRect(8, -8, 12, 16, 3); ctx.fill();
          ctx.fillStyle = '#0ea5e9'; // Glass
          ctx.beginPath(); ctx.roundRect(10, -5, 6, 10, 1); ctx.fill();

          // Headlights
          ctx.fillStyle = '#fef08a';
          ctx.shadowColor = '#fef08a'; ctx.shadowBlur = 5;
          ctx.beginPath(); ctx.arc(bodyW / 2 - 2, -10, 2, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(bodyW / 2 - 2, 10, 2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;

          // Front Grinder Mechanism (The "Cylinder")
          ctx.save();
          // Position at the front
          ctx.translate(bodyW / 2 + 4, 0);

          // Grinder Arms holding the cylinder
          ctx.fillStyle = '#64748b';
          ctx.fillRect(-6, -bodyH / 2 + 4, 10, 4); // Top arm
          ctx.fillRect(-6, bodyH / 2 - 8, 10, 4);  // Bottom arm

          // The Cylinder itself
          const cylinderH = bodyH + 4;
          const cylinderW = 14;

          // Cylinder gradient for roundness
          const cylGrad = ctx.createLinearGradient(0, -cylinderH / 2, 0, cylinderH / 2);
          cylGrad.addColorStop(0, '#334155');
          cylGrad.addColorStop(0.2, '#64748b');
          cylGrad.addColorStop(0.5, '#94a3b8'); // Shiny middle
          cylGrad.addColorStop(0.8, '#64748b');
          cylGrad.addColorStop(1, '#334155');

          ctx.fillStyle = cylGrad;
          ctx.beginPath();
          ctx.roundRect(-4, -cylinderH / 2, cylinderW, cylinderH, 4);
          ctx.fill();
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Grinder Blades / Texture Animation
          if (h.state === 'MINING') {
            const offset = (timeSec * 40) % 8;
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = -cylinderH / 2; i < cylinderH / 2; i += 8) {
              const y = i + offset;
              if (y < cylinderH / 2 && y > -cylinderH / 2) {
                ctx.moveTo(-4, y);
                ctx.lineTo(cylinderW - 4, y + 4);
              }
            }
            ctx.stroke();

            // Sparks/Dust effect
            ctx.fillStyle = '#fbbf24';
            for (let i = 0; i < 3; i++) {
              if (Math.random() > 0.5) {
                ctx.beginPath();
                ctx.arc(cylinderW, (Math.random() - 0.5) * cylinderH, 2, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          } else {
            // Static blades
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = -cylinderH / 2; i < cylinderH / 2; i += 8) {
              ctx.moveTo(-4, i);
              ctx.lineTo(cylinderW - 4, i + 4);
            }
            ctx.stroke();
          }
          ctx.restore();

          // Cargo Indicator (Center)
          if (h.inventory) {
            const cargoSize = 10;
            let color = '#fff';
            if (h.inventory.type === ResourceType.IRON) color = '#94a3b8';
            else if (h.inventory.type === ResourceType.SILICON) color = '#38bdf8';
            else if (h.inventory.type === ResourceType.MAGNESIUM) color = '#fbbf24';
            else if (h.inventory.type === ResourceType.TITANIUM) color = '#f1f5f9';

            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(-2, 0, cargoSize / 2, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
          }

          // Status Light (Rear)
          const statusColor = (h.state === 'MINING' || h.state === 'DEPOSITING') ? '#ef4444' : '#22c55e';
          ctx.fillStyle = statusColor; ctx.shadowColor = statusColor; ctx.shadowBlur = 5;
          ctx.beginPath(); ctx.arc(-bodyW / 2 + 6, 0, 3, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;

        } else if (h.type === 'TANKER') {
          const bodyW = 48; const bodyH = 40;

          // Wheels (Same style)
          const wheelXPositions = [-14, 0, 14];
          const wheelRadius = 8;

          wheelXPositions.forEach(xPos => {
            // Left
            ctx.fillStyle = '#1e293b';
            ctx.beginPath(); ctx.arc(xPos, -bodyH / 2 + 2, wheelRadius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.stroke();
            // Right
            ctx.fillStyle = '#1e293b';
            ctx.beginPath(); ctx.arc(xPos, bodyH / 2 - 2, wheelRadius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.stroke();

            if (h.state === 'MOVING_TO_CRATER' || h.state === 'RETURNING' || h.state === 'ALIGNING_TO_DOCK' || h.state === 'REVERSING_TO_DOCK') {
              const treadAngle = (timeSec * 10) % (Math.PI * 2);
              ctx.save(); ctx.translate(xPos, -bodyH / 2 + 2); ctx.rotate(treadAngle);
              ctx.fillStyle = '#475569'; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4); ctx.restore();
              ctx.save(); ctx.translate(xPos, bodyH / 2 - 2); ctx.rotate(-treadAngle);
              ctx.fillStyle = '#475569'; ctx.fillRect(-2, -6, 4, 12); ctx.fillRect(-6, -2, 12, 4); ctx.restore();
            }          });

          // Main Body - Rounded
          ctx.fillStyle = '#475569';
          ctx.beginPath(); ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 12); ctx.fill();
          ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3; ctx.stroke();

          // --- Industrial Details ---
          // Rear Vents
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(-bodyW / 2 + 4, -4, 4, 8);
          ctx.strokeStyle = '#334155';
          ctx.beginPath(); ctx.moveTo(-bodyW / 2 + 8, -4); ctx.lineTo(-bodyW / 2 + 8, 4); ctx.stroke();

          // Orange Warning Stripes (Rear Bumper)
          ctx.fillStyle = '#ea580c';
          ctx.beginPath(); ctx.roundRect(-bodyW / 2, -bodyH / 2 + 10, 6, bodyH - 20, 2); ctx.fill();

          // Water Tank (Large, Rounded, Glass)
          const tankW = 26; const tankH = bodyH - 12;
          const tankX = 6;

          ctx.save();
          // Glass background
          ctx.fillStyle = 'rgba(200, 230, 255, 0.2)';
          ctx.beginPath(); ctx.roundRect(tankX - tankW / 2, -tankH / 2, tankW, tankH, 8); ctx.fill();
          ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.stroke();

          // Liquid Level
          if (h.inventory?.amount || h.state === 'PUMPING_IN') {
            const fillPct = h.state === 'PUMPING_IN' ? (0.5 + Math.sin(timeSec * 5) * 0.4) : (h.inventory?.amount || 0) / TANKER_CAPACITY;
            
            // Draw liquid
            if (fillPct > 0.01) {
              const liquidH = tankH * fillPct;
              const liquidY = tankH / 2 - liquidH;

              ctx.save();
              // Clip to the tank shape
              ctx.beginPath(); ctx.roundRect(tankX - tankW / 2, -tankH / 2, tankW, tankH, 8); ctx.clip();
              
              // Draw the water body with a slight gradient
              const waterGrad = ctx.createLinearGradient(tankX - tankW / 2, -tankH / 2, tankX + tankW / 2, tankH / 2);
              waterGrad.addColorStop(0, '#2563eb'); // Deeper blue
              waterGrad.addColorStop(1, '#3b82f6'); // Royal blue
              
              ctx.fillStyle = waterGrad;
              ctx.fillRect(tankX - tankW / 2, liquidY, tankW, liquidH + 2); // Small +2 to cover seams

              // Subtle wave highlight at the top of the liquid
              if (fillPct < 1.0) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(tankX - tankW / 2, liquidY);
                ctx.lineTo(tankX + tankW / 2, liquidY);
                ctx.stroke();
              }
              ctx.restore();
            }

            // Bubbles animation
            if (h.state === 'PUMPING_IN' || h.state === 'PUMPING_OUT') {
              ctx.fillStyle = 'rgba(255,255,255,0.6)';
              const seed = Math.floor(timeSec * 10);
              for (let i = 0; i < 3; i++) {
                const bx = tankX + Math.sin(seed + i) * (tankW / 2 - 4);
                const by = Math.cos(seed * 0.5 + i) * (tankH / 2 - 4);
                ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI * 2); ctx.fill();
              }
            }
          }
          ctx.restore();

          // Pump Nozzle (Front)
          ctx.fillStyle = '#334155';
          ctx.beginPath(); ctx.moveTo(bodyW / 2, -6); ctx.lineTo(bodyW / 2 + 10, -3); ctx.lineTo(bodyW / 2 + 10, 3); ctx.lineTo(bodyW / 2, 6); ctx.fill();

          // Hose Connector Details
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath(); ctx.arc(bodyW / 2, 0, 3, 0, Math.PI * 2); ctx.fill();

          if (h.state === 'PUMPING_IN' || h.state === 'PUMPING_OUT') {
            ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(bodyW / 2 + 10, 0); ctx.lineTo(bodyW / 2 + 18, 0); ctx.stroke();
          }
        }

        ctx.restore();

        if ((h.state === 'PUMPING_IN' || h.state === 'PUMPING_OUT') && h.type === 'TANKER') {
          // Calculate start position at the back of the tanker
          const startX = h.x - Math.cos(h.rotation) * 24;
          const startY = h.y - Math.sin(h.rotation) * 24;
          let endX = startX; 
          let endY = startY;
          
          if (h.targetPos) {
            endX = h.targetPos.x;
            endY = h.targetPos.y;
          }

          // 1. Draw the water stream (Animated Bezier Curve)
          ctx.save();
          const dist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          
          // Subtle "sagging" of the water stream due to gravity
          const cpX = midX;
          const cpY = midY + Math.min(20, dist * 0.2); 

          // Base layer (Dark water)
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
          ctx.strokeStyle = '#1e3a8a'; 
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.stroke();

          // Middle layer (Bright blue)
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 3;
          ctx.stroke();

          // Shimmering highlights (Moving white dashes)
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([8, 12]);
          // Direction of dashes: 
          // PUMPING_OUT: Tanker -> Building (Start to End)
          // PUMPING_IN: Crater -> Tanker (End to Start)
          ctx.lineDashOffset = (h.state === 'PUMPING_OUT' ? 1 : -1) * (timeSec * 60);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // 2. Splashing particles at the end point
          if (dist > 5) {
            for (let i = 0; i < 2; i++) {
              if (Math.random() > 0.3 && dustParticlesRef.current.length < MAX_DUST_PARTICLES) {
                dustParticlesRef.current.push({
                  x: endX + (Math.random() - 0.5) * 6,
                  y: endY + (Math.random() - 0.5) * 6,
                  life: 0.4,
                  size: 1 + Math.random() * 2,
                  vx: (Math.random() - 0.5) * 2,
                  vy: -1 - Math.random() * 2,
                  color: '#60a5fa'
                });
              }
            }
          }
        }
      });

      projectiles.forEach(p => {
        if (!isInView(p.x, p.y, 40)) return;
        const dP = (p.x - player.x) * (p.x - player.x) + (p.y - player.y) * (p.y - player.y);
        if (dP > DRAW_RADIUS_SQ) return;
        if (dP > LOD_NEAR_SQ) return;
        ctx.save(); ctx.translate(p.x, p.y);
        const pRot = Math.atan2(p.vy, p.vx);
        ctx.rotate(pRot);
        ctx.save();
        ctx.shadowBlur = 15; ctx.shadowColor = '#38bdf8';
        const grad = ctx.createLinearGradient(-15, 0, 15, 0);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        grad.addColorStop(0.5, 'rgba(56, 189, 248, 1)');
        grad.addColorStop(1, '#fff');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.roundRect(-20, -2, 40, 4, 2); ctx.fill();
        ctx.restore();
        ctx.restore();
      });

      creatures.forEach(c => {
        const cRadius = c.type === 'heavy' ? 320 : 120;
        if (!isInView(c.x, c.y, cRadius)) return;
        const dC = (c.x - player.x) * (c.x - player.x) + (c.y - player.y) * (c.y - player.y);
        if (dC > DRAW_RADIUS_SQ) return;
        if (!isChunkExplored(c.x, c.y, exploredChunks)) return;
        if (dC > LOD_NEAR_SQ) {
          ctx.save(); ctx.translate(c.x, c.y);
          const color = c.type === 'heavy' ? '#ef4444' : (c.state === 'attacking' ? '#f43f5e' : '#8b5cf6');
          const r = c.type === 'heavy' ? 10 : 6;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          return;
        }
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rotation);
        const isAttacking = c.state === 'attacking';
        const breathing = 1.0 + Math.sin(timeSec * 3) * 0.03;
        ctx.scale(breathing, breathing);
        if (c.type === 'heavy') {
          // --- REFINOVANÝ TMAVO SIVO-ZELENÝ HEAVY ALIEN (Extra krátke nohy) ---
          ctx.save();
          
          // Mierka
          ctx.scale(1.25, 1.25);

          const isAttackingHeavy = c.state === 'attacking';
          const greyGreenDark = isAttackingHeavy ? '#1f2926' : '#141c1a'; 
          const greyGreenMid = isAttackingHeavy ? '#2f3e3a' : '#1f2926';
          const greenGlow = isAttackingHeavy ? '#34d399' : '#10b981';

          // 1. ASYMETRICKÝ TIEŇ (Zaoblený a zmenšený o ďalších 20%)
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; 
          ctx.beginPath();
          // Predná časť (Hlava/Hruď) - zaoblená elipsa
          ctx.ellipse(8, 0, 9.6, 11.2, 0, -Math.PI/2, Math.PI/2);
          // Horná hrana bruška
          ctx.quadraticCurveTo(-12, 9.6, -28, 4.8);
          // Zaoblený koniec (chvost)
          ctx.quadraticCurveTo(-34, 0, -28, -4.8);
          // Dolná hrana bruška
          ctx.quadraticCurveTo(-12, -9.6, 8, -11.2);
          ctx.fill();

          // 2. KĹBOVÉ NOHY (Extra skrátené o ďalších 50%)
          const walkCycle = timeSec * 16;
          ctx.strokeStyle = greyGreenDark; 
          ctx.lineWidth = 2.8; // Ešte hrubšie, aby pri tejto dĺžke pôsobili masívne
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          const drawJointedLeg = (side: number, index: number) => {
            const phase = walkCycle + (index * 0.9) + (side === 1 ? Math.PI : 0);
            const lift = Math.max(0, Math.sin(phase)) * 3; // Lift znížený o ďalších 50%
            const reach = Math.cos(phase) * 2; // Reach znížený o ďalších 50%
            
            const rootX = -12 + index * 6;
            const rootY = side * 4;

            // Kĺb 1: Bedro
            const k1X = rootX + reach * 0.5;
            const k1Y = side * 4; // Zmenšené z 8
            
            // Kĺb 2: Koleno
            const k2X = k1X - 2 + reach;
            const k2Y = side * (7 + lift); // Zmenšené z 14
            
            // Kĺb 3: Chodidlo
            const k3X = k2X - 1.5;
            const k3Y = k2Y + side * 2.5; // Zmenšené z 5

            ctx.beginPath();
            ctx.moveTo(rootX, rootY);
            ctx.lineTo(k1X, k1Y);
            ctx.lineTo(k2X, k2Y);
            ctx.lineTo(k3X, k3Y);
            ctx.stroke();
            
            // Malý pazúr na konci
            ctx.strokeStyle = greyGreenMid; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(k3X, k3Y); ctx.lineTo(k3X - 1.5, k3Y + side * 1.5); ctx.stroke();
            ctx.strokeStyle = greyGreenDark; ctx.lineWidth = 2.8;
          };

          for (let i = 0; i < 5; i++) {
            drawJointedLeg(1, i);
            drawJointedLeg(-1, i);
          }

          // 3. SEGMENTOVANÉ TELO
          for (let i = 0; i < 6; i++) {
            const segmentPos = -i * 6 + 5; 
            const segmentSize = 10 - i * 1.2; 
            const segmentOffset = Math.sin(timeSec * 7 + (i * 0.7)) * 2.2;
            
            ctx.fillStyle = (i % 2 === 0) ? greyGreenDark : greyGreenMid;
            ctx.beginPath(); ctx.ellipse(segmentPos, segmentOffset, segmentSize, segmentSize * 0.85, 0, 0, Math.PI * 2); ctx.fill();
            
            // Bioluminiscencia
            if (i > 0) {
              const glowPulse = 0.3 + Math.sin(timeSec * 5 + i) * 0.4;
              ctx.fillStyle = `rgba(52, 211, 153, ${glowPulse})`;
              ctx.beginPath(); ctx.arc(segmentPos, segmentOffset - segmentSize * 0.4, 1.1, 0, Math.PI * 2); ctx.fill();
            }
          }

          // 4. HLAVA
          ctx.save();
          ctx.translate(12, 0);
          ctx.fillStyle = greyGreenDark; 
          ctx.beginPath(); ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
          
          // KRATŠIE A SILNEJŠIE KUSADLÁ
          const jawCycle = Math.sin(timeSec * 12) * 0.3; 
          ctx.strokeStyle = greenGlow; 
          ctx.lineWidth = 2.5;
          // Horné
          ctx.save(); ctx.rotate(-jawCycle);
          ctx.beginPath(); ctx.moveTo(4, -3); ctx.quadraticCurveTo(10, -8, 12, -4); ctx.stroke(); ctx.restore();
          // Dolné
          ctx.save(); ctx.rotate(jawCycle);
          ctx.beginPath(); ctx.moveTo(4, 3); ctx.quadraticCurveTo(10, 8, 12, 4); ctx.stroke(); ctx.restore();

          // MNOHO OČÍ
          ctx.fillStyle = '#fff';
          [[2,-3,1.5], [2,3,1.5], [5,-2,1.2], [5,2,1.2], [7,0,1]].forEach(([ex, ey, er]) => {
            ctx.beginPath(); ctx.arc(ex, ey, er as number, 0, Math.PI * 2); ctx.fill();
          });

          ctx.restore();
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 8, 18, 10, 0, 0, Math.PI * 2); ctx.fill();
          const alienBodyColor = isAttacking ? '#4c1d95' : '#1e1b4b'; const alienSecondary = isAttacking ? '#7c3aed' : '#2e1065';
          for (let i = 0; i < 4; i++) {
            const segmentPos = -i * 7; const segmentSize = 9 - i * 1.5; const segmentWiggle = Math.sin(timeSec * 10 + (i * 0.5)) * 2;
            ctx.fillStyle = i === 0 ? alienBodyColor : alienSecondary;
            ctx.beginPath(); ctx.ellipse(segmentPos, segmentWiggle, segmentSize, segmentSize * 0.8, 0, 0, Math.PI * 2); ctx.fill();
            if (i > 0) {
              const glowPulse = 0.4 + Math.sin(timeSec * 5) * 0.3;
              ctx.fillStyle = isAttacking ? `rgba(244, 63, 94, ${glowPulse})` : `rgba(139, 92, 246, ${glowPulse})`;
              ctx.beginPath(); ctx.arc(segmentPos, segmentWiggle - segmentSize * 0.4, 1.5, 0, Math.PI * 2); ctx.fill();
            }
          }
          ctx.fillStyle = alienBodyColor; ctx.beginPath(); ctx.ellipse(8, 0, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = alienSecondary; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(14, -8); ctx.lineTo(18, -4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(6, 2); ctx.lineTo(14, 8); ctx.lineTo(18, 4); ctx.stroke();
          const legWiggle = Math.sin(timeSec * 20) * 8; ctx.strokeStyle = alienBodyColor; ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const lx = -4 + i * 6; ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx - 4 + legWiggle, 14); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx - 4 - legWiggle, -14); ctx.stroke();
          }
          const eyeColor = isAttacking ? '#f43f5e' : '#a855f7';
          ctx.fillStyle = eyeColor; ctx.beginPath(); ctx.arc(12, -3, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(12, 3, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      });

      if (!intro.active || intro.phase === 'ROVER_EXITING' || intro.phase === 'FINISHED') {
        ctx.save();
        ctx.translate(player.x, player.y); ctx.rotate(player.rotation); ctx.scale(0.85, 0.85);
        const isMoving = distMoved > 0.01;
        const bounce = isMoving ? Math.sin(timeSec * 30) * 0.8 : 0; const wheelBounce = isMoving ? Math.sin(timeSec * 35) : 0;
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 3;
        [-16, 0, 16].forEach((wx, i) => {
          [-18, 18].forEach((wy, j) => {
            const sideFactor = wy > 0 ? 1 : -1;
            const currentWheelBounce = wheelBounce * (i % 2 === 0 ? 1 : -1) * sideFactor;
            const actualWy = wy + currentWheelBounce;
            ctx.beginPath(); ctx.moveTo(wx, 0); ctx.lineTo(wx, actualWy); ctx.stroke();
            ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(wx, actualWy * 0.5, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.save(); ctx.translate(wx, actualWy);
            ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.roundRect(-7, -5, 14, 10, 3); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
            for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 3, -5); ctx.lineTo(k * 3, 5); ctx.stroke(); }
            ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          });
        });
        ctx.translate(0, bounce);
        const bodyX = -24, bodyY = -18, bodyW = 48, bodyH = 36;
        ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.roundRect(bodyX, bodyY, bodyW, bodyH, 4); ctx.fill();
        const bodyGrad = ctx.createLinearGradient(-22, -15, 22, 15);
        bodyGrad.addColorStop(0, '#94a3b8'); bodyGrad.addColorStop(1, '#475569');
        ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.roundRect(-22, -16, 44, 32, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-10, -16); ctx.lineTo(-10, 16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, -16); ctx.lineTo(8, 16); ctx.stroke();
        [[-18, -12], [18, -12], [-18, 12], [18, 12], [0, -14], [0, 14]].forEach(([rx, ry]) => {
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(rx, ry, 1, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = '#0f172a'; ctx.fillRect(-16, -12, 6, 8);
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.1)';
        for (let v = 1; v < 4; v++) { ctx.beginPath(); ctx.moveTo(-16, -12 + v * 2); ctx.lineTo(-10, -12 + v * 2); ctx.stroke(); }
        const glassGradSmall = ctx.createLinearGradient(0, -10, 15, 10);
        glassGradSmall.addColorStop(0, '#38bdf8'); glassGradSmall.addColorStop(1, '#0284c7');
        ctx.fillStyle = glassGradSmall; ctx.beginPath(); ctx.roundRect(4, -10, 16, 20, 5); ctx.fill();
        const playerGlowPulse = 0.4 + Math.sin(timeSec * 5) * 0.2;
        ctx.fillStyle = `rgba(255, 255, 255, ${playerGlowPulse})`;
        ctx.beginPath(); ctx.arc(8, -2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(8, 2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.save(); ctx.translate(-8, 8);
        ctx.rotate(timeSec * 3);
        ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, -Math.PI / 4, Math.PI / 4); ctx.stroke();
        ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (!rocket || ((rocket.x - player.x) * (rocket.x - player.x) + (rocket.y - player.y) * (rocket.y - player.y)) > 1600 || intro.phase === 'ROVER_EXITING') {
          const beamL = 80; const beamW = 28;
          if (Math.random() > 0.01) {
            const beamGrad = ctx.createRadialGradient(22, 0, 0, 22, 0, beamL);
            beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)'); beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = beamGrad; ctx.beginPath(); ctx.moveTo(22, -6); ctx.lineTo(22 + beamL, -beamW); ctx.lineTo(22 + beamL, beamW); ctx.lineTo(22, 6); ctx.fill();
          }
        }
        ctx.restore();
      }

      envFeatures.forEach(f => {
        if (f.type !== 'rocket') return;
        if (!isInView(f.x, f.y, 220)) return;
        const dR = (f.x - player.x) * (f.x - player.x) + (f.y - player.y) * (f.y - player.y);
        if (dR > DRAW_RADIUS_SQ && intro.phase === 'FINISHED') return;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rotation);
        let rocketScale = 0.7;
        if (intro.active && intro.phase === 'FALLING') rocketScale = 0.7 * (1 + (1 - intro.progress) * 2);
        ctx.scale(rocketScale, rocketScale);
        const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 95);
        bodyGrad.addColorStop(0, '#cbd5e1'); bodyGrad.addColorStop(0.75, '#94a3b8'); bodyGrad.addColorStop(1, '#475569');
        ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.arc(0, 0, 95, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = '#020617'; ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) { ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); }
        ctx.stroke();
        const redBlink = Math.sin(timeSec * 2) > 0.5;
        ctx.fillStyle = redBlink ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.1)';
        ctx.beginPath(); ctx.arc(-20, -10, 5, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ctx.lineTo(Math.cos(a) * 25, Math.sin(a) * 25); }
        ctx.closePath(); ctx.fillStyle = '#1e293b'; ctx.fill(); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore(); ctx.save(); ctx.font = 'bold 12px Orbitron'; ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const drawCurvedText = (txt: string, isTop: boolean) => {
          const radius = 80; const letterSpacingAngle = 0.18; const totalAngle = (txt.length - 1) * letterSpacingAngle;
          const startAngle = isTop ? -totalAngle / 2 : totalAngle / 2;
          for (let i = 0; i < txt.length; i++) {
            ctx.save(); const theta = startAngle + i * (isTop ? letterSpacingAngle : -letterSpacingAngle);
            ctx.rotate(theta); ctx.translate(0, isTop ? -radius : radius); if (!isTop) ctx.rotate(Math.PI);
            ctx.fillText(txt[i], 0, 0); ctx.restore();
          }
        };
        drawCurvedText("ARES PROTOCOL", true); drawCurvedText("ISA-MARS-01", false);
        ctx.restore(); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60, -60); ctx.lineTo(105, -105); ctx.stroke();
        ctx.fillStyle = '#ef4444'; if (Math.sin(timeSec * 5) > 0) { ctx.beginPath(); ctx.arc(105, -105, 4, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      });

      const startCol = Math.floor((player.x - viewW / 2) / FOG_GRID_SIZE) - 1;
      const endCol = Math.floor((player.x + viewW / 2) / FOG_GRID_SIZE) + 1;
      const startRow = Math.floor((player.y - viewH / 2) / FOG_GRID_SIZE) - 1;
      const endRow = Math.floor((player.y + viewH / 2) / FOG_GRID_SIZE) + 1;
      ctx.fillStyle = '#000000'; ctx.beginPath();
      for (let gx = startCol; gx <= endCol; gx++) {
        for (let gy = startRow; gy <= endRow; gy++) {
          if (!exploredChunks[`${gx}_${gy}`]) {
            ctx.rect(gx * FOG_GRID_SIZE - 0.5, gy * FOG_GRID_SIZE - 0.5, FOG_GRID_SIZE + 1, FOG_GRID_SIZE + 1);
          }
        }
      }
      ctx.fill(); ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [stateRef, renderStaticLayer, DRAW_RADIUS_SQ, LOD_NEAR_SQ]);

  return (<canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="block bg-[#0f172a]" />);
};

export default GameCanvas;
