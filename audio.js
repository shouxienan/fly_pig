/* Piggy Can Fly! — audio engine
 *
 * Everything is synthesized with the Web Audio API (no sound files), so the
 * game stays tiny and works fully offline. Notes are drawn from a pentatonic
 * scale, which means *any* tapping pattern a toddler makes still sounds musical.
 */
(function () {
  "use strict";

  // Major pentatonic scale (semitone offsets), spanning a couple of octaves.
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.keyRoot = 60;        // MIDI root note (C4); randomized per adventure
      this.flapStep = 0;        // climbs with each flap -> ascending melody
      this.musicTimer = null;
      this.enabled = true;
    }

    // Must be called from inside a user gesture (first tap) on iOS.
    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.10;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
    }

    resume() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }

    // A soft plucked/bell tone with a quick decay.
    tone(freq, when, dur, gain, type, dest) {
      const c = this.ctx;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || "triangle";
      osc.frequency.value = freq;
      const t = when || c.currentTime;
      const peak = gain == null ? 0.5 : gain;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.4));
      osc.connect(g);
      g.connect(dest || this.sfxGain);
      osc.start(t);
      osc.stop(t + (dur || 0.4) + 0.05);
    }

    noteFreq(step) {
      const deg = PENTA[((step % PENTA.length) + PENTA.length) % PENTA.length];
      const oct = Math.floor(step / PENTA.length) * 12;
      return midiToFreq(this.keyRoot + deg + oct);
    }

    // Each flap plays the next note up the scale -> a rising, hopeful melody.
    flap() {
      if (!this.ctx) return;
      const f = this.noteFreq(this.flapStep);
      this.flapStep = (this.flapStep + 1) % (PENTA.length * 2);
      const t = this.ctx.currentTime;
      this.tone(f, t, 0.45, 0.5, "triangle");
      this.tone(f * 2, t, 0.3, 0.14, "sine"); // shimmer octave
    }

    // Bright sparkle for collecting a treasure.
    collect() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const base = this.keyRoot + 12;
      [0, 4, 7, 12].forEach((semi, i) => {
        this.tone(midiToFreq(base + semi), t + i * 0.05, 0.35, 0.34, "sine");
      });
    }

    // Gentle soft bounce when piggy touches the ground.
    bounce() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.tone(midiToFreq(this.keyRoot - 12), t, 0.18, 0.3, "sine");
    }

    // Happy fanfare when the clouds are reached.
    win() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const r = this.keyRoot;
      const seq = [0, 4, 7, 12, 16, 19];
      seq.forEach((s, i) => {
        this.tone(midiToFreq(r + s), t + i * 0.12, 0.5, 0.5, "triangle");
        this.tone(midiToFreq(r + s + 12), t + i * 0.12, 0.4, 0.16, "sine");
      });
      // sparkle tail
      for (let i = 0; i < 10; i++) {
        this.tone(midiToFreq(r + 24 + (i % 5) * 2), t + 0.7 + i * 0.06, 0.25, 0.12, "sine");
      }
    }

    // Slow, low, gentle background arpeggio loop.
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      let step = 0;
      const chord = [0, 4, 7, 12, 7, 4]; // gently rolling tonic chord
      const beat = () => {
        if (!this.ctx) return;
        const s = chord[step % chord.length];
        const t = this.ctx.currentTime;
        this.tone(midiToFreq(this.keyRoot - 12 + s), t, 1.6, 0.5, "sine", this.musicGain);
        step++;
      };
      beat();
      this.musicTimer = setInterval(beat, 620);
    }

    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    }

    // Pick a fresh musical key so every adventure sounds new.
    randomizeKey() {
      const roots = [57, 60, 62, 64, 65, 67]; // A3, C4, D4, E4, F4, G4
      this.keyRoot = roots[Math.floor(Math.random() * roots.length)];
      this.flapStep = 0;
    }
  }

  window.AudioEngine = AudioEngine;
})();
