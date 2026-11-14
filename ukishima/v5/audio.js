// Procedural Web Audio API sound & ambient BGM engine (no external audio files)

const SOUND_ENABLED_KEY = 'ukishima_sound_enabled';

const NIGHT_CHORDS = [
  [293.66, 349.23, 440.0, 523.25], // Dm9-ish (D F A C)
  [233.08, 293.66, 349.23, 440.0], // Bbmaj7
  [261.63, 329.63, 392.0, 587.33], // Cadd9
  [220.0, 261.63, 329.63, 392.0],  // Am7
];

const DAWN_CHORDS = [
  [349.23, 440.0, 523.25, 659.25], // Fmaj9
  [392.0, 493.88, 587.33, 659.25], // G6
  [261.63, 329.63, 392.0, 587.33], // Cmaj9
  [349.23, 440.0, 523.25, 698.46], // Fmaj7
];

const MUSICBOX_SCALE_NIGHT = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 1046.5];
const MUSICBOX_SCALE_DAWN = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1046.5, 1174.66];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.padFilter = null;
    this.enabled = this._loadEnabled();
    this.unlocked = false;
    this._chordIdx = 0;
    this._lastPadMs = 0;
    this._nextNoteMs = 0;
    this._lastShipSfxMs = 0;
    this._activePadStop = null;
  }

  _loadEnabled() {
    try {
      const v = localStorage.getItem(SOUND_ENABLED_KEY);
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  }

  _saveEnabled(val) {
    try {
      localStorage.setItem(SOUND_ENABLED_KEY, val ? '1' : '0');
    } catch {
      // ignore
    }
  }

  unlock() {
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.65 : 0;
      this.padFilter = this.ctx.createBiquadFilter();
      this.padFilter.type = 'lowpass';
      this.padFilter.frequency.value = 900;
      this.padFilter.connect(this.master);
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.unlocked = true;
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
    this._saveEnabled(this.enabled);
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.enabled ? 0.65 : 0, now, 0.08);
    }
    return this.enabled;
  }

  toggle() {
    return this.setEnabled(!this.enabled);
  }

  updateBgm(nowMs, state, nightProgress = 0) {
    if (!this.unlocked || !this.ctx || !this.enabled || this.ctx.state !== 'running') {
      return;
    }
    const shouldPlay = state === 'play' || state === 'dawn';
    if (!shouldPlay) return;

    const brightness = state === 'dawn' ? 1 : Math.max(0, Math.min(1, nightProgress));
    if (this.padFilter) {
      const targetCutoff = 760 + brightness * 950;
      this.padFilter.frequency.setTargetAtTime(targetCutoff, this.ctx.currentTime, 0.5);
    }

    // Slow ambient pad chord every ~5.4 seconds
    if (nowMs - this._lastPadMs >= 5400) {
      this._lastPadMs = nowMs;
      const chords = brightness >= 0.58 ? DAWN_CHORDS : NIGHT_CHORDS;
      const chord = chords[this._chordIdx % chords.length];
      this._chordIdx += 1;
      this._triggerPadChord(chord, 5.6, 0.036 + brightness * 0.012);
    }

    // Sparse music-box chimes every 2.1 ~ 4.0 seconds (real time)
    if (nowMs >= this._nextNoteMs) {
      this._nextNoteMs = nowMs + 2100 + Math.random() * 1900;
      const scale = brightness >= 0.58 ? MUSICBOX_SCALE_DAWN : MUSICBOX_SCALE_NIGHT;
      const freq = scale[Math.floor(Math.random() * scale.length)];
      this._triggerMusicBoxNote(freq, 0.038 + brightness * 0.008);
      if (Math.random() < 0.35) {
        const freq2 = scale[Math.floor(Math.random() * scale.length)];
        this._triggerMusicBoxNote(freq2, 0.026, 0.28);
      }
    }
  }

  _triggerPadChord(freqs, durationSec, peakGain) {
    const ctx = this.ctx;
    if (!ctx || !this.padFilter) return;
    const now = ctx.currentTime;
    const perVoiceGain = peakGain / Math.max(1, freqs.length);

    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freqs[i], now);
      osc.detune.setValueAtTime((i - 1.5) * 4, now);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(perVoiceGain, now + 1.6);
      g.gain.linearRampToValueAtTime(perVoiceGain * 0.72, now + durationSec - 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(g);
      g.connect(this.padFilter);
      osc.start(now);
      osc.stop(now + durationSec + 0.05);
    }
  }

  _triggerMusicBoxNote(freq, peakGain, delaySec = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + delaySec;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peakGain, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 1.5);

    osc.connect(g);
    g.connect(this.master);
    osc.start(start);
    osc.stop(start + 1.55);

    // Subtle soft echo tap
    const echoOsc = ctx.createOscillator();
    const echoG = ctx.createGain();
    echoOsc.type = 'sine';
    echoOsc.frequency.setValueAtTime(freq, start + 0.34);
    echoG.gain.setValueAtTime(0.0001, start + 0.34);
    echoG.gain.linearRampToValueAtTime(peakGain * 0.28, start + 0.355);
    echoG.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
    echoOsc.connect(echoG);
    echoG.connect(this.master);
    echoOsc.start(start + 0.34);
    echoOsc.stop(start + 1.45);
  }

  _playTone(freq, startOffset, duration, peakGain, type = 'sine', endFreq = null) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + duration);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peakGain, t0 + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.04);
  }

  playSfx(name) {
    if (!this.unlocked || !this.ctx || !this.enabled || this.ctx.state !== 'running') {
      return;
    }
    if (name === 'build') {
      this._playTone(523.25, 0, 0.16, 0.075, 'triangle');
      this._playTone(783.99, 0.06, 0.24, 0.07, 'sine');
    } else if (name === 'bridge') {
      this._playTone(440.0, 0, 0.18, 0.08, 'triangle');
      this._playTone(659.25, 0.055, 0.26, 0.08, 'triangle');
      this._playTone(987.77, 0.11, 0.3, 0.05, 'sine');
    } else if (name === 'ship') {
      const nowMs = performance.now();
      if (nowMs - this._lastShipSfxMs < 240) return;
      this._lastShipSfxMs = nowMs;
      this._playTone(587.33, 0, 0.2, 0.06, 'sine');
      this._playTone(880.0, 0.08, 0.32, 0.065, 'sine');
    } else if (name === 'meteor') {
      this._playTone(880.0, 0, 0.14, 0.08, 'sine', 1318.5);
      this._playTone(1174.66, 0.06, 0.22, 0.075, 'sine');
      this._playTone(1567.98, 0.13, 0.38, 0.08, 'sine');
    } else if (name === 'loop') {
      const notes = [587.33, 739.99, 880.0, 1174.66];
      for (let i = 0; i < notes.length; i++) {
        this._playTone(notes[i], i * 0.055, 0.45, 0.075, i < 2 ? 'triangle' : 'sine');
      }
    } else if (name === 'constellation') {
      const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
      for (let i = 0; i < notes.length; i++) {
        this._playTone(notes[i], i * 0.06, 0.58, 0.08, i % 2 === 0 ? 'sine' : 'triangle');
      }
    }
  }
}
