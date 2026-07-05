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

  // Build a tiny silent WAV data URI at runtime (no asset file). Playing this
  // in a loop on the first tap moves iOS to a *media* audio session, so game
  // sound plays even when the ring/silent switch is off and the volume buttons
  // control it.
  function silentWavUri() {
    const rate = 8000, n = Math.floor(rate * 0.25);
    const buf = new Uint8Array(44 + n);
    const dv = new DataView(buf.buffer);
    const str = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    str(0, "RIFF"); dv.setUint32(4, 36 + n, true); str(8, "WAVE");
    str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    str(36, "data"); dv.setUint32(40, n, true);
    for (let i = 0; i < n; i++) buf[44 + i] = 128; // 8-bit PCM silence
    let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return "data:audio/wav;base64," + btoa(bin);
  }

  // --- nursery melodies -----------------------------------------------------
  const NOTE_SEMI = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  function noteToFreq(name) {
    const m = /^([A-G]#?)(\d)$/.exec(name);
    if (!m) return 440;
    return midiToFreq(12 * (parseInt(m[2], 10) + 1) + NOTE_SEMI[m[1]]);
  }
  // "C4 C4 G4:2 R" -> [{n:'C4',b:1}, ...]; ":x" sets beats (default 1), R = rest.
  function song(name, bpm, notes) {
    return {
      name, bpm,
      notes: notes.trim().split(/\s+/).map((tok) => {
        const p = tok.split(":");
        return { n: p[0], b: p[1] ? parseFloat(p[1]) : 1 };
      }),
    };
  }
  const SONGS = [
    song("Twinkle Twinkle Little Star", 112,
      "C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2"),
    song("Mary Had a Little Lamb", 120,
      "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:2"),
    song("Row Row Row Your Boat", 104,
      "C4 C4 C4 D4 E4:2 E4 D4 E4 F4 G4:2 C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 G4 F4 E4 D4 C4:2"),
    song("Happy Birthday", 108,
      "G4:0.5 G4:0.5 A4 G4 C5 B4:2 G4:0.5 G4:0.5 A4 G4 D5 C5:2 G4:0.5 G4:0.5 G5 E5 C5 B4 A4:2 F5:0.5 F5:0.5 E5 C5 D5 C5:2"),
    song("Old MacDonald Had a Farm", 116,
      "G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:2 D4 G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:2"),
    song("Baa Baa Black Sheep", 112,
      "C4 C4 G4 G4 A4 B4 C5 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2"),
  ];



  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.keyRoot = 60;        // MIDI root note (C4); randomized per adventure
      this.flapStep = 0;        // climbs with each flap -> ascending melody
      this.song = null;         // current nursery melody
      this._musicTimer = null;
      this._musicOn = false;
      this._noteIndex = 0;
      this.enabled = true;
    }

    // Must be called from inside a user gesture (first tap) on iOS.
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.enabled = false; return; }
        this.ctx = new AC();

        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.55;
        this.sfxGain.connect(this.master);

        // Prime Web Audio with a 1-sample silent buffer (some browsers stay
        // muted until a sound is started inside the first gesture).
        try {
          const b = this.ctx.createBuffer(1, 1, 22050);
          const s = this.ctx.createBufferSource();
          s.buffer = b; s.connect(this.ctx.destination); s.start(0);
        } catch (e) {}
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.unlockMediaSession();
    }

    // iOS: keep a looping silent element playing so audio uses the media
    // session (audible on silent mode; follows the media volume slider).
    unlockMediaSession() {
      if (this._silent) { const p = this._silent.play(); if (p && p.catch) p.catch(() => {}); return; }
      try {
        const a = new Audio(silentWavUri());
        a.loop = true;
        a.setAttribute("playsinline", "");
        a.playsInline = true;
        a.volume = 0.02;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
        this._silent = a;
      } catch (e) {}
    }

    resume() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      this.unlockMediaSession();
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

    // Play the current nursery melody with a soft music-box tone, looping gently.
    startMusic() {
      if (!this.ctx || this._musicOn) return;
      if (!this.song) this.song = SONGS[0];
      this._musicOn = true;
      this._noteIndex = 0;
      this._scheduleNext();
    }

    _scheduleNext() {
      if (!this._musicOn || !this.ctx) return;
      const s = this.song;
      const beat = 60 / (s.bpm || 100);
      if (this._noteIndex >= s.notes.length) {
        this._noteIndex = 0;
        this._musicTimer = setTimeout(() => this._scheduleNext(), 1000); // breathe, then loop
        return;
      }
      const note = s.notes[this._noteIndex++];
      const dur = note.b * beat;
      if (note.n && note.n !== "R") this._melodyNote(noteToFreq(note.n), this.ctx.currentTime + 0.03, dur * 0.95);
      this._musicTimer = setTimeout(() => this._scheduleNext(), dur * 1000);
    }

    _melodyNote(freq, t, dur) {
      const c = this.ctx;
      const atk = 0.015, rel = Math.min(0.3, dur * 0.5), hold = Math.max(atk, dur - rel);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + atk);
      g.gain.setValueAtTime(0.6, t + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(t); osc.stop(t + dur + 0.05);
      // gentle shimmer an octave up
      const osc2 = c.createOscillator();
      const g2 = c.createGain();
      osc2.type = "sine";
      osc2.frequency.value = freq * 2;
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.12, t + atk);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
      osc2.connect(g2); g2.connect(this.musicGain);
      osc2.start(t); osc2.stop(t + dur + 0.05);
    }

    stopMusic() {
      this._musicOn = false;
      if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
    }

    // Pick a fresh key + nursery song so every adventure sounds new.
    randomizeKey() {
      const roots = [57, 60, 62, 64, 65, 67]; // A3, C4, D4, E4, F4, G4
      this.keyRoot = roots[Math.floor(Math.random() * roots.length)];
      this.flapStep = 0;
      this.song = SONGS[Math.floor(Math.random() * SONGS.length)];
    }
  }

  window.AudioEngine = AudioEngine;
})();
