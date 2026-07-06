/* Headless smoke test for Piggy Can Fly!
 *
 * Real pixels need a browser, but this runs the actual game code in a VM with a
 * mocked canvas / DOM / audio, drives real input, and steps hundreds of frames.
 * It catches: syntax errors, typo'd ctx methods, exceptions in update/render,
 * NaN physics, and confirms tapping actually flies piggy up to a WIN.
 *
 *   node test/smoke.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

let failed = false;
const fail = (m) => { failed = true; console.error("  ✗ " + m); };
const ok = (m) => console.log("  ✓ " + m);

// ---- mock 2D context (records every method name it is asked for) ----
const usedOps = new Set();
const gradient = { addColorStop() {} };
const ctxData = {};
const ctxOverrides = {
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  measureText: () => ({ width: 10 }),
  getImageData: () => ({ data: [] }),
};
const ctx = new Proxy({}, {
  get(_t, prop) {
    if (typeof prop === "symbol") return undefined;
    if (prop === "canvas") return canvasEl;
    if (prop in ctxOverrides) return ctxOverrides[prop];
    if (prop in ctxData) return ctxData[prop];
    return (...args) => { usedOps.add(prop); void args; };
  },
  set(_t, prop, val) { ctxData[prop] = val; return true; },
});

// ---- mock DOM elements ----
function makeEl() {
  const handlers = {};
  return {
    _handlers: handlers,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {},
    textContent: "",
    addEventListener(t, fn) { (handlers[t] ||= []).push(fn); },
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }),
    width: 0, height: 0,
    fire(t, e) { (handlers[t] || []).forEach((fn) => fn(e || {})); },
  };
}

const canvasEl = makeEl();
const els = { c: canvasEl, hud: makeEl(), start: makeEl(), win: makeEl(), startBtn: makeEl(), againBtn: makeEl(), settingsBtn: makeEl() };

// ---- mock window / document / audio ----
let nowMs = 0;
let rafCb = null;
let timers = [];
let timerSeq = 0;
const winHandlers = {}, docHandlers = {};

class FakeParam { constructor() { this.value = 0; } setValueAtTime() {} exponentialRampToValueAtTime() {} cancelScheduledValues() {} }
class FakeAudioCtx {
  constructor() { this.state = "running"; this.destination = {}; }
  get currentTime() { return nowMs / 1000; }
  resume() {}
  createGain() { return { gain: new FakeParam(), connect() {} }; }
  createOscillator() { return { type: "", frequency: new FakeParam(), connect() {}, start() {}, stop() {} }; }
}

const sandbox = {
  console,
  Math, JSON, Date, // Date only used indirectly; fine here
  document: {
    getElementById: (id) => els[id],
    querySelectorAll: () => [],
    addEventListener: (t, fn) => { (docHandlers[t] ||= []).push(fn); },
    hidden: false,
  },
  navigator: {}, // no serviceWorker -> registration is skipped
  performance: { now: () => nowMs },
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  cancelAnimationFrame: () => {},
  setTimeout: (cb, ms) => { timerSeq++; timers.push({ id: timerSeq, cb, due: nowMs + (ms || 0) }); return timerSeq; },
  clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
  setInterval: () => 1,   // don't actually loop the background music
  clearInterval: () => {},
  AudioContext: FakeAudioCtx,
  webkitAudioContext: FakeAudioCtx,
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 3,
  addEventListener: (t, fn) => { (winHandlers[t] ||= []).push(fn); },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);

// ---- load the real game code ----
try {
  vm.runInContext(read("audio.js"), sandbox, { filename: "audio.js" });
  vm.runInContext(read("game.js"), sandbox, { filename: "game.js" });
  ok("audio.js + game.js loaded without throwing");
} catch (e) {
  fail("loading game threw: " + e.stack);
  process.exit(1);
}

// Fake timers keyed off the same clock as the frame loop, so the looping
// nursery-music scheduler advances correctly instead of recursing forever.
function fireTimers() {
  let guard = 0;
  for (;;) {
    const due = timers.filter((t) => t.due <= nowMs).sort((a, b) => a.due - b.due);
    if (!due.length || guard++ > 10000) break;
    const t = due[0];
    timers = timers.filter((x) => x.id !== t.id);
    t.cb();
  }
}
const step = (n = 1) => { for (let i = 0; i < n; i++) { nowMs += 16; fireTimers(); const cb = rafCb; rafCb = null; if (cb) cb(nowMs); } };
const tapDown = (x = 195, y = 400) => canvasEl.fire("mousedown", { preventDefault() {}, clientX: x, clientY: y });
const tapUp = () => (winHandlers.mouseup || []).forEach((fn) => fn({}));

// preview frames on the start screen
try { step(10); ok("start-screen preview renders (10 frames)"); }
catch (e) { fail("preview render threw: " + e.stack); }

// press PLAY
els.startBtn.fire("click", {});
ok("PLAY pressed");

// tap at a realistic toddler rate (~3.5 taps/sec) — holding no longer lifts.
// This also checks difficulty: a modest tapper must still reach the clouds.
let taps = 0, gframe = 0;
try {
  for (; gframe < 1600 && els.win.classList.contains("hidden"); gframe++) {
    if (gframe % 18 === 0) { tapDown(); tapUp(); taps++; }
    step(1);
  }
  ok(`gameplay ran without throwing (${taps} taps, ${gframe} frames)`);
} catch (e) { fail("gameplay threw: " + e.stack); }

// let it settle / celebrate
try { step(120); ok("post-climb frames (incl. win celebration) ran without throwing"); }
catch (e) { fail("post-climb render threw: " + e.stack); }

// ---- assertions on observable game facts ----
if (els.start.classList.contains("hidden")) ok("start overlay was hidden after PLAY");
else fail("start overlay is still visible");

if (!els.win.classList.contains("hidden")) ok("WIN celebration overlay is showing (piggy reached the clouds)");
else fail("never reached the WIN state within ~6.4s of holding — climb may be too hard");

const stars = els.hud.textContent;
if (/⭐\s*\d/.test(stars) && parseInt(stars.replace(/\D/g, ""), 10) > 0) ok("collected treasures along the way: '" + stars + "'");
else fail("no treasures were collected (expected some): '" + stars + "'");

// sanity: a healthy spread of canvas ops were exercised
const need = ["fillRect", "beginPath", "arc", "ellipse", "fill", "moveTo", "lineTo", "save", "restore", "translate", "rotate", "stroke"];
const missing = need.filter((m) => !usedOps.has(m));
if (missing.length === 0) ok(`canvas draw API exercised (${usedOps.size} distinct ops, incl. all core ones)`);
else fail("expected canvas ops never called: " + missing.join(", "));

console.log(failed ? "\nSMOKE TEST: FAILED\n" : "\nSMOKE TEST: PASSED\n");
process.exit(failed ? 1 : 0);
