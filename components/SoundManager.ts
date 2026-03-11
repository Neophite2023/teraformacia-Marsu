
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private isMuted: boolean = false;
  private musicStarted: boolean = false;

  constructor() {}

  private initContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = this.isMuted ? 0 : 0.7;
    
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.musicGain.gain.value = 0.55; // Mierne zvýšená hlasitosť hudby

    this.startAmbience();
    this.startMusic();
  }

  setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx!.currentTime, 0.1);
    }
  }

  playLaser() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.2);
    g.gain.setValueAtTime(0.5, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playCollect() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.4, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playPlace() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.3, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playDamage() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    source.buffer = buffer;
    g.gain.setValueAtTime(0.5, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    source.connect(g);
    g.connect(this.masterGain);
    source.start();
  }

  updateEngine(isMoving: boolean) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    
    if (isMoving && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 60;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200;
      
      this.engineGain.gain.value = 0;
      this.engineGain.gain.setTargetAtTime(0.4, this.ctx.currentTime, 0.2);
      
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);
      this.engineOsc.start();
    } else if (!isMoving && this.engineOsc) {
      this.engineGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const tempOsc = this.engineOsc;
      setTimeout(() => {
        tempOsc.stop();
        if (this.engineOsc === tempOsc) this.engineOsc = null;
      }, 200);
    }
  }

  private startAmbience() {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.1;
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    
    const ambienceGain = this.ctx.createGain();
    ambienceGain.gain.value = 0.15;
    
    source.connect(filter);
    filter.connect(ambienceGain);
    ambienceGain.connect(this.masterGain);
    source.start();
  }

  private startMusic() {
    if (this.musicStarted || !this.ctx || !this.musicGain) return;
    this.musicStarted = true;

    const playNote = (freq: number, startTime: number, duration: number, vol: number = 1, type: 'pad' | 'lead' = 'pad') => {
      if (!this.ctx || !this.musicGain) return;
      
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = type === 'lead' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      filter.type = 'lowpass';
      // Lead tóny majú dynamický filter pre "vesmírny" efekt
      const startFreq = type === 'lead' ? 3000 : 800;
      const endFreq = type === 'lead' ? 400 : 150;
      filter.frequency.setValueAtTime(startFreq, startTime);
      filter.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

      const attack = type === 'lead' ? (duration * 0.3) : 3.0;
      const release = duration * 0.4;
      
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.35 * vol, startTime + attack);
      g.gain.linearRampToValueAtTime(0, startTime + duration);

      osc.connect(filter);
      filter.connect(g);
      g.connect(this.musicGain);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const notes = [146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00]; // D3 až G4 Pentatonika
    let nextNoteTime = this.ctx.currentTime + 1;

    const schedule = () => {
      while (nextNoteTime < this.ctx!.currentTime + 6) {
        const rootNote = notes[Math.floor(Math.random() * 4)]; // Hlbšie tóny pre pozadie
        
        // PAD: Rozľahlé hlboké tóny (natiahnuté na 12 sekúnd)
        playNote(rootNote / 2, nextNoteTime, 12, 0.8, 'pad');
        
        // KOMPLEXNÁ MELÓDIA: Fráza 6-10 tónov
        const phraseLength = 6 + Math.floor(Math.random() * 5);
        let melodyPointer = nextNoteTime + 2.0;
        
        for (let i = 0; i < phraseLength; i++) {
           const melNote = notes[Math.floor(Math.random() * notes.length)];
           // Niektoré tóny sú krátke, iné dlhé a natiahnuté
           const isStretched = Math.random() > 0.7;
           const noteDuration = isStretched ? 4.5 : 1.2;
           const noteVol = isStretched ? 0.4 : 0.35;
           
           playNote(melNote * 2, melodyPointer, noteDuration, noteVol, 'lead');
           
           // Rozostupy medzi tónmi v melódii
           melodyPointer += isStretched ? 2.5 : 0.9;
        }

        // Čas do ďalšej veľkej hudobnej frázy
        nextNoteTime += 12 + Math.random() * 6;
      }
      setTimeout(schedule, 2000);
    };

    schedule();
  }

  resume() {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

export const sounds = new SoundManager();
