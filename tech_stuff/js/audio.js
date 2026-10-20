export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.currentTheme = 'CHIPTUNE'; // 'CHIPTUNE' | 'BOSS' | 'GLIDER' | 'CINEMATIC'
    this.stepIndex = 0;
    this.musicTimer = 0;

    // Preload authentic sliced SFX clips from the YouTube Short!
    this.clips = {
      frogger8bit: this.createClip('./audio/frogger_8bit.mp3', 0.65),
      roll1: this.createClip('./audio/roll_hup1.mp3', 0.9),
      roll2: this.createClip('./audio/roll_hup2.mp3', 0.9),
      kickCar: this.createClip('./audio/kick_oryaa.mp3', 0.95),
      flipHup: this.createClip('./audio/flip_hup.mp3', 0.9),
      gliderOpen: this.createClip('./audio/glider_open.mp3', 0.95),
      logKick1: this.createClip('./audio/log_kick1.mp3', 0.95),
      logKick2: this.createClip('./audio/log_kick2.mp3', 0.95),
      shoreFlip: this.createClip('./audio/shore_flip.mp3', 0.9),
      fullVideo: this.createClip('./audio/full_video_audio.mp3', 0.85)
    };
    this.rollToggle = false;
    this.logKickToggle = false;
  }

  createClip(src, volume = 0.85) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = volume;
    return audio;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playClip(name) {
    if (this.muted) return;
    this.ensureContext();
    const clip = this.clips[name];
    if (clip) {
      try {
        clip.currentTime = 0;
        clip.play().catch(() => {});
      } catch (_) {}
    }
  }

  stopAllClips() {
    Object.values(this.clips).forEach((clip) => {
      try {
        clip.pause();
        clip.currentTime = 0;
      } catch (_) {}
    });
  }

  playHop() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.11);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playDodgeRoll() {
    this.rollToggle = !this.rollToggle;
    this.playClip(this.rollToggle ? 'roll1' : 'roll2');
    this.synthWhoosh(180, 90, 0.22);
  }

  playSpinKick(hitCar = false, onLog = false) {
    if (hitCar) {
      this.playClip('kickCar');
      this.synthImpactExplosion();
    } else if (onLog) {
      this.logKickToggle = !this.logKickToggle;
      this.playClip(this.logKickToggle ? 'logKick1' : 'logKick2');
    } else {
      this.playClip('logKick1');
      this.synthWhoosh(420, 140, 0.25);
    }
  }

  playAcroFlip(nearShore = false) {
    this.playClip(nearShore ? 'shoreFlip' : 'flipHup');
    this.synthWhoosh(320, 640, 0.28);
  }

  playGliderDeploy() {
    this.playClip('gliderOpen');
    this.synthWhoosh(250, 520, 0.35);
  }

  synthWhoosh(startFreq, endFreq, duration) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  synthImpactExplosion() {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.42);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  updateMusic(dt, theme) {
    if (this.muted || !this.ctx || theme === 'CINEMATIC') return;
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
      this.stepIndex = 0;
    }

    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;

    const now = this.ctx.currentTime;

    if (theme === 'CHIPTUNE') {
      // Classic 8-bit Frogger bouncy melody
      const notes = [523.25, 659.25, 523.25, 659.25, 783.99, 880.0, 783.99, 659.25];
      const freq = notes[this.stepIndex % notes.length];
      this.playNote(freq, 'square', 0.14, 0.045, now);
      this.musicTimer = 0.18;
      this.stepIndex++;
    } else if (theme === 'BOSS') {
      // Epic Dark Souls / Action Highway Ostinato (D minor dramatic choir/strings)
      const ostinato = [146.83, 220.0, 293.66, 349.23, 329.63, 293.66, 261.63, 220.0];
      const freq = ostinato[this.stepIndex % ostinato.length];
      this.playNote(freq, 'sawtooth', 0.24, 0.04, now);
      if (this.stepIndex % 2 === 0) {
        this.playNote(freq * 0.5, 'triangle', 0.32, 0.06, now);
      }
      this.musicTimer = 0.21;
      this.stepIndex++;
    } else if (theme === 'GLIDER') {
      // Serene BOTW High Piano & Strings Glider Theme
      const piano = [587.33, 880.0, 1174.66, 1318.51, 1046.5, 880.0, 783.99, 659.25];
      const freq = piano[this.stepIndex % piano.length];
      this.playNote(freq, 'sine', 0.48, 0.045, now);
      this.musicTimer = 0.34;
      this.stepIndex++;
    }
  }

  playNote(freq, type, duration, peakGain, now) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }
}
