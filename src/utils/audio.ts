// Web Audio API Synthesizer for tracker beeps and notification sounds

class SoundEffects {
  private ctx: AudioContext | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenTimer: number | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // High-pitched double beep: Tracker locator ("트래커 찾기")
  playTrackerBeep() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // First beep
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(2400, now);
    osc1.frequency.exponentialRampToValueAtTime(2800, now + 0.12);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Second beep
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2600, now + 0.16);
    osc2.frequency.exponentialRampToValueAtTime(3200, now + 0.3);
    gain2.gain.setValueAtTime(0.35, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.16);
    osc2.stop(now + 0.3);
  }

  // Gentle chime for Geofence enter / exit
  playGeofenceAlert() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.1); // A5
    osc.frequency.setValueAtTime(1174.66, now + 0.2); // D6

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  // Emergency SOS Alarm sound
  playEmergencySiren() {
    this.startSiren();
    window.setTimeout(() => this.stopSiren(), 1600);
  }

  startSiren() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    this.stopSiren();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, ctx.currentTime);
    gain.gain.setValueAtTime(0.55, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    this.sirenOsc = osc;
    this.sirenGain = gain;
    let high = false;
    this.sirenTimer = window.setInterval(() => {
      const time = ctx.currentTime;
      high = !high;
      osc.frequency.cancelScheduledValues(time);
      osc.frequency.setValueAtTime(high ? 620 : 1380, time);
      osc.frequency.linearRampToValueAtTime(high ? 1380 : 620, time + 0.42);
    }, 420);
  }

  stopSiren() {
    if (this.sirenTimer != null) {
      window.clearInterval(this.sirenTimer);
      this.sirenTimer = null;
    }
    try {
      this.sirenOsc?.stop();
    } catch {
      /* 이미 멈춘 발진기 */
    }
    this.sirenOsc?.disconnect();
    this.sirenGain?.disconnect();
    this.sirenOsc = null;
    this.sirenGain = null;
  }
}

export const sounds = new SoundEffects();
