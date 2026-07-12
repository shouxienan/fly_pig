/* Piggy Can Fly!  — a gentle musical flying game for toddlers.
 *
 * Tap anywhere -> piggy flaps up and plays a musical note.
 * It is impossible to lose: if you stop, piggy floats down, bounces softly,
 * and keeps trying. Reach the clouds at the top to win a celebration, then
 * "Play Again" builds a brand-new randomized adventure.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- helpers
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- palettes
  // Painterly, Zelda-ish sky+land sets. Blue-sky day plus soft dawn/dusk variants.
  // `key` matches the settings chip data-value so a sky is resolved by identity
  // (not array position) — reordering PALETTES can't mismap a chosen sky.
  const PALETTES = [
    { key: "day",     name: "hyrule day",   skyTop: "#3fa4ef", skyMid: "#8fd0ff", skyHorizon: "#dcf1ff", sun: "#fff6d8", cloud: "#ffffff", cloudShade: "#c7dcee", hillNear: "#5fb552", hillFar: "#93cf7e", mountain: "#a7c3d8", flower: "#fff2a8", accent: "#ff5fae" },
    { key: "dawn",    name: "dawn blush",   skyTop: "#ff9fc4", skyMid: "#ffc9dd", skyHorizon: "#fff0e2", sun: "#fff0d2", cloud: "#fff6fb", cloudShade: "#e6bfd2", hillNear: "#6fbb5f", hillFar: "#a3d18b", mountain: "#c8b4cf", flower: "#fff2a8", accent: "#ff4fa4" },
    { key: "sunset",  name: "golden sunset",skyTop: "#ff9f66", skyMid: "#ffca86", skyHorizon: "#fff2c8", sun: "#fff2c0", cloud: "#fff3e8", cloudShade: "#e3b28c", hillNear: "#559b4b", hillFar: "#84bd6c", mountain: "#bb9c88", flower: "#fff0a0", accent: "#ff7d54" },
    { key: "dusk",    name: "lavender dusk",skyTop: "#8f7ad2", skyMid: "#c2a7e6", skyHorizon: "#f2e4f6", sun: "#ffe6d2", cloud: "#f7f0fb", cloudShade: "#c6acd6", hillNear: "#5b9a6a", hillFar: "#8dbf9d", mountain: "#a99bc6", flower: "#fff0c4", accent: "#9b6bff" },
    { key: "morning", name: "fresh morning",skyTop: "#4ec3bd", skyMid: "#a3e6d7", skyHorizon: "#ecfff7", sun: "#fff6d2", cloud: "#ffffff", cloudShade: "#c3e2d9", hillNear: "#66bd66", hillFar: "#97d091", mountain: "#a6c8c0", flower: "#fff2a8", accent: "#ff6fae" }
  ];

  const GOALS = ["rainbow", "castle", "sun", "bigstar"];

  // Selectable flyers. Each is a variation on a round head: body colours, ear
  // style ("tri" upright / "side" round / "floppy" down), nose type, extras.
  const ANIMALS = {
    pig:   { grad: ["#ffc0e0", "#ff9ecb"], wing: "#ffd0e8", outline: "#e07bae", ear: "tri",    earCol: "#ff9ecb", blush: "rgba(255,110,160,0.55)", nose: "pig",   snoutCol: "#ff86bd", nostril: "#e85fa0", smile: "#c94f86" },
    cow:   { grad: ["#f3f3f8", "#dedee8"], wing: "#eceef4", outline: "#b9bccb", ear: "side",   earCol: "#f6cfe0", blush: "rgba(255,150,180,0.45)", nose: "cow",   snoutCol: "#ffc6de", nostril: "#df8fb4", smile: "#9a7d86", spots: true, horns: true },
    dog:   { grad: ["#f2c589", "#e0a25c"], wing: "#f4cf98", outline: "#b87b3c", ear: "floppy", earCol: "#cf9048", blush: "rgba(210,130,90,0.35)",  nose: "dog",   noseCol: "#5a3b2a", smile: "#5a3b2a", tongue: true },
    cat:   { grad: ["#dcc9f2", "#c3a9e6"], wing: "#e4d6f5", outline: "#9a7fc4", ear: "tri",    earCol: "#b79ad9", blush: "rgba(255,150,180,0.45)", nose: "cat",   noseCol: "#e07da0", smile: "#6b5a86", whiskers: true },
    horse: { grad: ["#e3b98a", "#c8955a"], wing: "#eccba0", outline: "#9c6b3f", ear: "tri",    earCol: "#b87f46", blush: "rgba(200,130,80,0.35)",  nose: "horse", snoutCol: "#ecca9c", nostril: "#9c6b3f", smile: "#6b4a2a", mane: true, forelock: true },
  };
  const ANIMAL_ORDER = ["pig", "cow", "dog", "cat", "horse"];

  // ---------------------------------------------------------------- canvas
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------------- audio
  const audio = new AudioEngine();

  // ---------------------------------------------------------------- state
  const State = { START: 0, PLAY: 1, WIN: 2 };
  let state = State.START;

  let TARGET = 2600;            // how high (world px) to reach the clouds (settings)
  let GRAVITY = 440;            // soft pull so piggy floats between taps (settings)
  let FLAP = 470;              // upward velocity set per tap (settings)
  const MAX_FALL = 460;

  let pal = PALETTES[0];
  let goalType = "rainbow";
  let camTop = 0;               // world Y at top of screen
  let time = 0;

  // ---- customizable settings (remembered between visits) ----
  const DEFAULTS = { animal: "pig", song: "random", sky: "random", length: "medium", flying: "easy", sound: "on" };
  const LENGTHS = { short: 1500, medium: 2600, long: 4200 };
  const FLYING = { easy: { g: 440, f: 470 }, normal: { g: 600, f: 450 } };
  let settings = { ...DEFAULTS };
  try {
    settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("piggy-settings") || "{}") };
    // migrate the flyer choice saved by older builds under a separate key
    const oldAnimal = localStorage.getItem("piggy-animal");
    if (oldAnimal && ANIMALS[oldAnimal] && !localStorage.getItem("piggy-settings")) settings.animal = oldAnimal;
  } catch (e) {}

  let selectedAnimal = "pig";

  function saveSettings() {
    try { localStorage.setItem("piggy-settings", JSON.stringify(settings)); } catch (e) {}
  }

  // Resolve the settings sky ("random" or a palette key) to a palette object.
  function resolveSky(sel) {
    return PALETTES.find((p) => p.key === sel) || pick(PALETTES);
  }

  // Apply the current settings to every game knob (single source of truth).
  function applySettings() {
    selectedAnimal = ANIMALS[settings.animal] ? settings.animal : "pig";
    TARGET = LENGTHS[settings.length] || LENGTHS.medium;
    const fl = FLYING[settings.flying] || FLYING.easy;
    GRAVITY = fl.g; FLAP = fl.f;
    audio.setMuted(settings.sound === "off");
  }

  const pig = {
    worldY: 0, vy: 0, x: 0, targetX: 0, tilt: 0,
    wing: 0, wingV: 0, squish: 1, blink: 0, spin: 0
  };

  let holding = false;
  let bestAltitude = 0;         // never decreases -> progress meter never regresses
  let meterShown = 0;           // smoothed meter value
  let treasures = 0;
  let idleTimer = 0;            // for cute self-hops ("never gives up")

  let clouds = [];       // {y, x, s, spd} parallax background
  let decorations = [];  // {y, xf, type, s, hue}
  let items = [];        // collectibles {y, xf, type, got, bob}
  let flowers = [];      // wildflowers on the meadow {xf, dy, s, white}
  let particles = [];    // {x, y, vx, vy, life, max, kind, col, s, rot, rotV}

  const hud = document.getElementById("hud");

  // ---------------------------------------------------------------- adventure
  function newAdventure() {
    pal = resolveSky(settings.sky);
    goalType = pick(GOALS);
    audio.randomizeKey();
    audio.setSong(settings.song);

    pig.worldY = 0; pig.vy = 0; pig.x = W / 2; pig.targetX = W / 2;
    pig.tilt = 0; pig.wing = 0; pig.wingV = 0; pig.squish = 1; pig.spin = 0;
    camTop = -H * 0.55;
    bestAltitude = 0; meterShown = 0; treasures = 0; idleTimer = 0;
    particles = [];

    // Background clouds scattered through the whole climb + a bit beyond.
    clouds = [];
    for (let i = 0; i < 34; i++) {
      clouds.push({
        y: rand(-TARGET - H, H * 0.4),
        x: rand(0, W),
        s: rand(0.5, 1.5),
        spd: rand(0.1, 0.4)            // parallax factor
      });
    }

    // Mid-layer decorations (balloons, rainbows, flowers, butterflies, castles).
    decorations = [];
    const decoTypes = ["balloon", "balloon", "rainbow", "flower", "butterfly", "hotair"];
    let dy = -260;
    while (dy > -TARGET + 200) {
      decorations.push({
        y: dy, xf: rand(0.1, 0.9), type: pick(decoTypes),
        s: rand(0.8, 1.4), hue: randInt(0, 360)
      });
      dy -= rand(240, 460);
    }

    // Collectibles along the climb, in a gentle zig-zag so steering feels natural.
    items = [];
    const itemTypes = ["star", "heart", "note", "rainbowgem", "balloon"];
    let iy = -220, side = Math.random() < 0.5 ? 0.3 : 0.7;
    while (iy > -TARGET + 120) {
      items.push({ y: iy, xf: side, type: pick(itemTypes), got: false, bob: rand(0, TAU) });
      side = clamp(side + rand(-0.35, 0.35), 0.18, 0.82);
      iy -= rand(150, 240);
    }

    // Wildflowers dotted across the meadow near the ground.
    flowers = [];
    for (let i = 0; i < 20; i++) {
      flowers.push({ xf: rand(0.02, 0.98), dy: rand(14, 430), s: rand(1.1, 2.3), white: Math.random() < 0.45 });
    }

    updateHud();
  }

  function updateHud() {
    hud.textContent = treasures > 0 ? "⭐ " + treasures : "";
  }

  // ---------------------------------------------------------------- input
  function flap(px) {
    if (state !== State.PLAY) return;
    pig.vy = -FLAP;
    pig.wingV = 22;
    pig.squish = 0.82;
    if (px != null) pig.targetX = clamp(px, 40, W - 40);
    audio.noteDown();          // start the next note (held for as long as the tap)
    // little puff of sparkles under piggy
    spawnSparkles(pig.x, pig.worldY - camTop + 34, 5, pal.accent);
    idleTimer = 0;
  }

  function pointerXY(e) {
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function onDown(e) {
    e.preventDefault();
    audio.init();
    if (state === State.START || state === State.WIN) return; // buttons handle those
    holding = true;
    const p = pointerXY(e);
    flap(p.x);
  }
  function onMove(e) {
    if (!holding || state !== State.PLAY) return;
    e.preventDefault();
    const p = pointerXY(e);
    pig.targetX = clamp(p.x, 40, W - 40);
  }
  function onUp() { holding = false; audio.noteUp(); }

  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove", onMove, { passive: false });
  canvas.addEventListener("touchend", onUp);
  canvas.addEventListener("touchcancel", onUp);
  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { holding = false; audio.noteUp(); } // release any held note
    else if (state === State.PLAY) { audio.resume(); }
  });

  // ---------------------------------------------------------------- buttons
  function startGame() {
    audio.init();
    audio.resume();
    applySettings();
    newAdventure();
    state = State.PLAY;
    document.getElementById("start").classList.add("hidden");
    document.getElementById("win").classList.add("hidden");
  }
  function showSettings() {
    state = State.START;
    document.getElementById("win").classList.add("hidden");
    document.getElementById("start").classList.remove("hidden");
  }
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("againBtn").addEventListener("click", startGame);
  document.getElementById("settingsBtn").addEventListener("click", showSettings);

  // ---- settings chips: generic picker for every .chip-group ----
  function refreshChips() {
    document.querySelectorAll(".chip-group").forEach((group) => {
      const key = group.dataset.setting;
      group.querySelectorAll(".chip").forEach((chip) => {
        chip.classList.toggle("selected", String(chip.dataset.value) === String(settings[key]));
      });
    });
  }
  document.querySelectorAll(".chip-group").forEach((group) => {
    const key = group.dataset.setting;
    group.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        settings[key] = chip.dataset.value;
        saveSettings();
        refreshChips();
        applySettings();        // single source of truth (animal, length, flying, sound/mute)
        audio.init();           // a tap is a user gesture -> unlock audio
        // live feedback in the start-screen preview
        if (key === "sky") pal = resolveSky(settings.sky);
        // play a taste of the song (unless the pick just muted everything)
        if ((key === "song" || key === "sound") && settings.sound === "on") {
          audio.resume();
          audio.previewSong(settings.song);
        }
      });
    });
  });
  refreshChips();

  // ---------------------------------------------------------------- particles
  function spawnSparkles(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y, vx: rand(-60, 60), vy: rand(20, 120),
        life: 0, max: rand(0.4, 0.9), kind: "spark",
        col: col || "#fff", s: rand(3, 7), rot: rand(0, TAU), rotV: rand(-6, 6)
      });
    }
  }
  function spawnBurst(x, y, type) {
    const cols = ["#ff5fae", "#ffd54f", "#8ce0ff", "#b47bff", "#7dffb0", "#ffffff"];
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU), sp = rand(80, 260);
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0, max: rand(0.6, 1.2), kind: type,
        col: type === "heart" ? "#ff5fae" : pick(cols),
        s: rand(6, 12), rot: rand(0, TAU), rotV: rand(-8, 8)
      });
    }
  }
  function spawnConfetti() {
    const cols = ["#ff5fae", "#ffd54f", "#8ce0ff", "#b47bff", "#7dffb0", "#ff9bcd", "#ffffff"];
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: rand(0, W), y: rand(-H * 0.3, 0), vx: rand(-40, 40), vy: rand(60, 220),
        life: 0, max: rand(1.6, 3.2), kind: "confetti",
        col: pick(cols), s: rand(6, 12), rot: rand(0, TAU), rotV: rand(-9, 9)
      });
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    time += dt;
    if (state !== State.PLAY) { updateParticles(dt); return; }

    // physics
    pig.vy += GRAVITY * dt;
    pig.vy = clamp(pig.vy, -700, MAX_FALL);
    pig.worldY += pig.vy * dt;

    // floor (a fluffy meadow) — piggy bounces, never falls off, never gives up
    if (pig.worldY > 0) {
      pig.worldY = 0;
      if (pig.vy > 160) { audio.bounce(); pig.squish = 0.7; spawnSparkles(pig.x, H * 0.55 + 30, 6, pal.hillNear); }
      pig.vy = 0;
    }

    // gentle self-hop when resting (shows piggy "trying very hard")
    if (pig.worldY === 0 && !holding) {
      idleTimer += dt;
      if (idleTimer > 1.1) { pig.vy = -FLAP * 0.7; pig.wingV = 16; pig.squish = 0.85; audio.bounce(); idleTimer = 0; }
    }

    // horizontal drift toward last tap
    pig.x = lerp(pig.x, pig.targetX, clamp(dt * 6, 0, 1));

    // wings + squish spring back
    pig.wing += pig.wingV * dt;
    pig.wingV = lerp(pig.wingV, Math.sin(time * 6) * 2, clamp(dt * 4, 0, 1));
    pig.squish = lerp(pig.squish, 1, clamp(dt * 8, 0, 1));
    pig.tilt = lerp(pig.tilt, clamp(pig.vy / 900, -0.5, 0.6), clamp(dt * 6, 0, 1));
    pig.blink -= dt;
    if (pig.blink < -3) pig.blink = rand(0.1, 0.2);

    // camera follows piggy (clamped so the ground stays put at the bottom)
    const desired = pig.worldY - H * 0.55;
    camTop = Math.min(lerp(camTop, desired, clamp(dt * 8, 0, 1)), -H * 0.55);

    // altitude + meter
    const altitude = -pig.worldY;
    if (altitude > bestAltitude) bestAltitude = altitude;
    meterShown = lerp(meterShown, clamp(altitude / TARGET, 0, 1), clamp(dt * 5, 0, 1));

    // rising sparkle trail while going up
    if (pig.vy < -60 && Math.random() < 0.6) {
      spawnSparkles(pig.x + rand(-14, 14), pig.worldY - camTop + 30, 1, "#fff");
    }

    // collect items
    const pigScreenY = pig.worldY - camTop;
    for (const it of items) {
      if (it.got) continue;
      const iy = it.y - camTop;
      if (iy < -60 || iy > H + 60) continue;
      const ix = it.xf * W;
      const dx = ix - pig.x, dy2 = iy - pigScreenY;
      if (dx * dx + dy2 * dy2 < 62 * 62) {
        it.got = true;
        treasures++;
        updateHud();
        pig.vy -= 90;                      // little reward boost
        audio.collect();
        spawnBurst(ix, iy, it.type === "heart" ? "heart" : "star");
      }
    }

    // win!
    if (bestAltitude >= TARGET) {
      state = State.WIN;
      pig.spin = 0;
      audio.win();
      spawnConfetti();
      // Show the celebration overlay after a short beat.
      setTimeout(() => document.getElementById("win").classList.remove("hidden"), 900);
    }

    updateParticles(dt);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.vy += (p.kind === "confetti" ? 60 : 30) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotV * dt;
    }
    // spin piggy during the win dance
    if (state === State.WIN) pig.spin += dt * 3;
  }

  // ---------------------------------------------------------------- drawing
  // hex "#rrggbb" -> "rgba(r,g,b,a)"
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // Sky gradients depend only on the palette + viewport size, so build them once
  // and reuse across frames (rebuilt when pal or W/H changes) instead of
  // allocating two CanvasGradients + rgba strings every frame.
  let skyCache = null;
  function skyGradients() {
    if (skyCache && skyCache.pal === pal && skyCache.w === W && skyCache.h === H) return skyCache;
    const lin = ctx.createLinearGradient(0, 0, 0, H);
    lin.addColorStop(0, pal.skyTop);
    lin.addColorStop(0.55, pal.skyMid);
    lin.addColorStop(1, pal.skyHorizon);
    const sx = W * 0.76, sy = H * 0.15, R = Math.max(W, H) * 0.95;
    const rad = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
    rad.addColorStop(0, rgba(pal.sun, 0.55));
    rad.addColorStop(0.35, rgba(pal.sun, 0.14));
    rad.addColorStop(1, rgba(pal.sun, 0));
    skyCache = { pal, w: W, h: H, lin, rad };
    return skyCache;
  }

  function drawSky() {
    const sk = skyGradients();
    ctx.fillStyle = sk.lin;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = sk.rad;   // warm sun glow (ambient light, fixed on screen)
    ctx.fillRect(0, 0, W, H);
  }

  function cloudShape(x, y, s) {
    ctx.beginPath();
    ctx.arc(x - 34 * s, y, 26 * s, 0, TAU);
    ctx.arc(x - 8 * s, y - 18 * s, 30 * s, 0, TAU);
    ctx.arc(x + 26 * s, y - 10 * s, 26 * s, 0, TAU);
    ctx.arc(x + 40 * s, y + 2 * s, 22 * s, 0, TAU);
    ctx.arc(x + 6 * s, y + 8 * s, 30 * s, 0, TAU);
    ctx.closePath();
  }

  // Cel-shaded clouds: soft shadow underside, lit body, bright top highlight.
  function drawClouds() {
    for (const c of clouds) {
      const y = c.y - camTop * c.spd; // parallax
      const yy = ((y % (H + 500)) + (H + 500)) % (H + 500) - 250;
      const depth = clamp(0.45 + c.spd, 0.4, 1); // farther (slow) clouds fainter
      ctx.globalAlpha = 0.45 * depth;
      ctx.fillStyle = pal.cloudShade;
      cloudShape(c.x, yy + 9 * c.s, c.s); ctx.fill();
      ctx.globalAlpha = 0.95 * depth;
      ctx.fillStyle = pal.cloud;
      cloudShape(c.x, yy, c.s); ctx.fill();
      ctx.globalAlpha = 0.5 * depth;
      ctx.fillStyle = "#ffffff";
      cloudShape(c.x, yy - 7 * c.s, c.s * 0.82); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Wavy filled ridge from screen bottom up to a wavy crest line.
  function ridge(baseY, amp, freq, phase) {
    ctx.beginPath();
    ctx.moveTo(0, H + 2);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, baseY - Math.sin((x / W) * Math.PI * freq + phase) * amp);
    ctx.lineTo(W, baseY);
    ctx.lineTo(W, H + 2);
    ctx.closePath();
  }
  function crest(baseY, amp, freq, phase) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const yy = baseY - Math.sin((x / W) * Math.PI * freq + phase) * amp;
      ctx[x ? "lineTo" : "moveTo"](x, yy);
    }
  }

  function drawFlowers(gy) {
    for (const f of flowers) {
      const fy = gy + f.dy;
      if (fy < gy - 2 || fy > H) continue;
      const fx = f.xf * W, s = f.s;
      ctx.fillStyle = f.white ? "#ffffff" : pal.flower;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 3 * s, fy + Math.sin(a) * 3 * s, 2 * s, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = "#ffd54f";
      ctx.beginPath(); ctx.arc(fx, fy, 1.7 * s, 0, TAU); ctx.fill();
    }
  }

  // Lush Zelda-style meadow: hazy mountains, layered green hills, wildflowers.
  function drawGround() {
    const gy = 0 - camTop; // world y=0 in screen space (the horizon)
    if (gy > H + 240) return;

    // atmospheric haze band at the horizon
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pal.skyHorizon;
    ctx.fillRect(0, gy - 60, W, 84);
    ctx.globalAlpha = 1;

    // distant hazy mountains
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pal.mountain;
    for (let i = 0; i < 4; i++) {
      const mx = (i * 0.9 + 0.25) * (W / 3.2);
      const h = 72 + (i % 2) * 34;
      ctx.beginPath();
      ctx.moveTo(mx - 150, gy + 8);
      ctx.lineTo(mx, gy - h);
      ctx.lineTo(mx + 150, gy + 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // far hill layer, then near meadow
    ctx.fillStyle = pal.hillFar;
    ridge(gy + 2, 26, 2.3, 0.6); ctx.fill();
    ctx.fillStyle = pal.hillNear;
    ridge(gy + 28, 18, 3.1, 2.1); ctx.fill();

    // sunlit rim on the near crest
    ctx.strokeStyle = rgba("#ffffff", 0.28);
    ctx.lineWidth = 3; ctx.lineCap = "round";
    crest(gy + 28, 18, 3.1, 2.1); ctx.stroke();

    drawFlowers(gy);
  }

  function drawStar(x, y, r, col, points) {
    points = points || 5;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = (i / (points * 2)) * TAU - Math.PI / 2;
      ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }

  function drawHeart(x, y, r, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r / 16, r / 16);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-16, -8, -10, -20, 0, -10);
    ctx.bezierCurveTo(10, -20, 16, -8, 0, 6);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }

  function drawRainbow(x, y, s) {
    const cols = ["#ff6f91", "#ffb15f", "#ffe14f", "#7dffb0", "#8ce0ff", "#b47bff"];
    ctx.lineWidth = 9 * s;
    for (let i = 0; i < cols.length; i++) {
      ctx.strokeStyle = cols[i];
      ctx.beginPath();
      ctx.arc(x, y, (60 + i * 10) * s, Math.PI, 0);
      ctx.stroke();
    }
  }

  function drawBalloon(x, y, s, col) {
    ctx.strokeStyle = "rgba(180,120,150,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y + 26 * s); ctx.lineTo(x, y + 50 * s); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, y, 18 * s, 22 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.ellipse(x - 6 * s, y - 7 * s, 4 * s, 6 * s, -0.4, 0, TAU); ctx.fill();
  }

  function drawFlower(x, y, s, hue) {
    ctx.fillStyle = `hsl(${hue},85%,70%)`;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 14 * s, y + Math.sin(a) * 14 * s, 9 * s, 9 * s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#ffe14f";
    ctx.beginPath(); ctx.arc(x, y, 8 * s, 0, TAU); ctx.fill();
  }

  function drawButterfly(x, y, s, hue) {
    const flutter = Math.sin(time * 8 + x) * 0.4;
    ctx.fillStyle = `hsl(${hue},80%,72%)`;
    ctx.save(); ctx.translate(x, y);
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.scale(sgn, 1); ctx.rotate(flutter * sgn * 0.001);
      ctx.beginPath(); ctx.ellipse(10 * s, -6 * s, 10 * s, 8 * s, 0.4 + flutter, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9 * s, 8 * s, 8 * s, 6 * s, -0.3 - flutter, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#7a5a6a";
    ctx.beginPath(); ctx.ellipse(0, 0, 2.5 * s, 10 * s, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawHotAir(x, y, s, hue) {
    ctx.fillStyle = `hsl(${hue},80%,68%)`;
    ctx.beginPath(); ctx.arc(x, y, 26 * s, Math.PI * 0.15, Math.PI * 0.85, true); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 20 * s, y + 12 * s); ctx.lineTo(x + 20 * s, y + 12 * s);
    ctx.lineTo(x + 8 * s, y + 34 * s); ctx.lineTo(x - 8 * s, y + 34 * s); ctx.closePath();
    ctx.fillStyle = "#c98a5a"; ctx.fill();
  }

  function drawDecorations() {
    for (const d of decorations) {
      const y = d.y - camTop;
      if (y < -80 || y > H + 80) continue;
      const x = d.xf * W;
      const col = `hsl(${d.hue},80%,70%)`;
      switch (d.type) {
        case "balloon": drawBalloon(x, y + Math.sin(time + d.y) * 6, d.s, col); break;
        case "rainbow": drawRainbow(x, y, d.s); break;
        case "flower": drawFlower(x, y, d.s, d.hue); break;
        case "butterfly": drawButterfly(x + Math.sin(time * 1.5 + d.y) * 20, y, d.s, d.hue); break;
        case "hotair": drawHotAir(x, y + Math.sin(time * 0.8 + d.y) * 8, d.s, d.hue); break;
      }
    }
  }

  function drawItems() {
    for (const it of items) {
      if (it.got) continue;
      const y = it.y - camTop + Math.sin(time * 2 + it.bob) * 6;
      if (y < -60 || y > H + 60) continue;
      const x = it.xf * W;
      // soft glow
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      switch (it.type) {
        case "star": drawStar(x, y, 18, "#ffd54f"); break;
        case "heart": drawHeart(x, y, 20, "#ff5fae"); break;
        case "note":
          ctx.fillStyle = "#b47bff";
          ctx.beginPath(); ctx.ellipse(x - 6, y + 8, 8, 6, -0.4, 0, TAU); ctx.fill();
          ctx.fillRect(x + 1, y - 14, 3, 22);
          ctx.beginPath(); ctx.moveTo(x + 4, y - 14); ctx.quadraticCurveTo(x + 16, y - 12, x + 12, y - 2);
          ctx.lineTo(x + 4, y - 4); ctx.closePath(); ctx.fill();
          break;
        case "rainbowgem":
          drawStar(x, y, 16, "#8ce0ff", 6); drawStar(x, y, 9, "#ff9bcd", 6); break;
        case "balloon": drawBalloon(x, y, 1, "#ff8fc7"); break;
      }
    }
  }

  function drawGoal() {
    const y = -TARGET - camTop;
    if (y > H + 200) return;
    // big fluffy cloud bank at the very top
    ctx.fillStyle = pal.cloud;
    for (let i = 0; i < 6; i++) { cloudShape((i + 0.5) * (W / 6), y + 40, 1.6); ctx.fill(); }
    const cx = W / 2;
    switch (goalType) {
      case "rainbow": drawRainbow(cx, y + 20, 2.4); break;
      case "sun":
        ctx.fillStyle = "#ffd54f";
        ctx.beginPath(); ctx.arc(cx, y - 20, 46, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#ffd54f"; ctx.lineWidth = 6;
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 54, y - 20 + Math.sin(a) * 54); ctx.lineTo(cx + Math.cos(a) * 74, y - 20 + Math.sin(a) * 74); ctx.stroke(); }
        // smiley
        ctx.fillStyle = "#e08a2a";
        ctx.beginPath(); ctx.arc(cx - 16, y - 26, 5, 0, TAU); ctx.arc(cx + 16, y - 26, 5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, y - 16, 16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 5; ctx.strokeStyle = "#e08a2a"; ctx.stroke();
        break;
      case "castle":
        ctx.fillStyle = "#ffb3dd";
        ctx.fillRect(cx - 70, y - 40, 140, 60);
        for (const bx of [-70, -25, 20, 55]) { ctx.fillRect(cx + bx, y - 70, 20, 40); ctx.beginPath(); ctx.moveTo(cx + bx - 4, y - 70); ctx.lineTo(cx + bx + 10, y - 92); ctx.lineTo(cx + bx + 24, y - 70); ctx.closePath(); ctx.fillStyle = pal.accent; ctx.fill(); ctx.fillStyle = "#ffb3dd"; }
        break;
      case "bigstar": drawStar(cx, y - 20, 60, "#ffd54f"); drawStar(cx, y - 20, 30, "#fff2b0"); break;
    }
  }

  // The star of the show: the chosen animal, with little flapping wings.
  let bodyGradCache = null;   // cached radial body gradient, keyed by animal
  function drawCharacter() {
    const cfg = ANIMALS[selectedAnimal] || ANIMALS.pig;
    const x = pig.x;
    const y = pig.worldY - camTop;
    const wingBeat = Math.sin(pig.wing) * 0.9;

    ctx.save();
    ctx.translate(x, y);
    if (state === State.WIN) ctx.rotate(Math.sin(pig.spin) * 0.5);
    else ctx.rotate(pig.tilt * 0.5);
    ctx.scale(1, pig.squish);

    // soft grounded drop shadow
    ctx.fillStyle = "rgba(40,40,70,0.14)";
    ctx.beginPath(); ctx.ellipse(0, 10, 44, 38, 0, 0, TAU); ctx.fill();

    // wings (behind body), flapping — the CHARACTER's own colour + outline so
    // they never blend into the sky or clouds
    for (const sgn of [-1, 1]) {
      ctx.save();
      ctx.translate(sgn * 30, -6);
      ctx.rotate(sgn * (0.5 + wingBeat));
      ctx.beginPath();
      ctx.ellipse(sgn * 16, 0, 22, 12, 0, 0, TAU);
      ctx.fillStyle = cfg.wing; ctx.fill();
      ctx.strokeStyle = cfg.outline; ctx.lineWidth = 2; ctx.stroke();
      // a couple of feather lines for detail
      ctx.strokeStyle = rgba("#ffffff", 0.4); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sgn * 6, -2); ctx.lineTo(sgn * 30, -2); ctx.stroke();
      ctx.restore();
    }

    // horse mane (behind head)
    if (cfg.mane) {
      ctx.fillStyle = "#8a5a34";
      ctx.beginPath(); ctx.ellipse(0, -32, 18, 22, 0, 0, TAU); ctx.fill();
    }
    // cow horns (behind head)
    if (cfg.horns) {
      ctx.fillStyle = "#f5e6c8";
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sgn * 15, -38, 5, 8, sgn * 0.4, 0, TAU); ctx.fill(); }
    }

    drawEars(cfg);

    // body/head — cel shading: light comes from upper-left, dark outline.
    // Gradient coords are fixed in the character's local space (ctx is
    // translated), so cache it per-animal instead of rebuilding each frame.
    if (!bodyGradCache || bodyGradCache.animal !== selectedAnimal) {
      const bg = ctx.createRadialGradient(-15, -16, 6, 0, 2, 54);
      bg.addColorStop(0, cfg.grad[0]);
      bg.addColorStop(1, cfg.grad[1]);
      bodyGradCache = { animal: selectedAnimal, grad: bg };
    }
    ctx.fillStyle = bodyGradCache.grad;
    ctx.beginPath(); ctx.ellipse(0, 0, 42, 38, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = cfg.outline; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 42, 38, 0, 0, TAU); ctx.stroke();
    // soft rim light on the upper-left edge
    ctx.strokeStyle = rgba("#ffffff", 0.5); ctx.lineWidth = 3.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.ellipse(0, 0, 40, 36, 0, Math.PI * 1.15, Math.PI * 1.72); ctx.stroke();

    // cow patches
    if (cfg.spots) {
      ctx.fillStyle = "rgba(90,80,90,0.26)";
      ctx.beginPath(); ctx.ellipse(-22, -14, 12, 9, 0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(25, 12, 9, 7, -0.3, 0, TAU); ctx.fill();
    }

    // cheeks (blush)
    ctx.fillStyle = cfg.blush;
    ctx.beginPath(); ctx.arc(-23, 9, 8, 0, TAU); ctx.arc(23, 9, 8, 0, TAU); ctx.fill();

    // horse forelock (tuft of mane on the forehead)
    if (cfg.forelock) {
      ctx.fillStyle = "#8a5a34";
      ctx.beginPath(); ctx.ellipse(0, -30, 10, 13, 0, 0, TAU); ctx.fill();
    }

    // eyes (blink)
    const open = pig.blink > 0 ? 0.2 : 1;
    ctx.fillStyle = "#3a2630";
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sgn * 14, -6, 5, 6 * open, 0, 0, TAU);
      ctx.fill();
      if (open > 0.5) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sgn * 16, -8, 2, 0, TAU); ctx.fill(); ctx.fillStyle = "#3a2630"; }
    }

    drawNose(cfg);

    ctx.restore();
  }

  function drawEars(cfg) {
    ctx.fillStyle = cfg.earCol;
    ctx.strokeStyle = cfg.outline;
    ctx.lineWidth = 2;
    if (cfg.ear === "side") {
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sgn * 40, -6, 12, 9, sgn * 0.5, 0, TAU); ctx.fill(); ctx.stroke(); }
    } else if (cfg.ear === "floppy") {
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sgn * 36, 6, 12, 24, sgn * 0.3, 0, TAU); ctx.fill(); ctx.stroke(); }
    } else { // "tri" upright
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sgn * 20, -34);
        ctx.lineTo(sgn * 34, -52);
        ctx.lineTo(sgn * 38, -30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function drawNose(cfg) {
    ctx.lineCap = "round";
    if (cfg.nose === "pig") {
      ctx.fillStyle = cfg.snoutCol;
      ctx.beginPath(); ctx.ellipse(0, 12, 15, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = cfg.nostril;
      ctx.beginPath(); ctx.arc(-5, 12, 2.6, 0, TAU); ctx.arc(5, 12, 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = cfg.smile; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 22, 8, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (cfg.nose === "cow") {
      ctx.fillStyle = cfg.snoutCol;
      ctx.beginPath(); ctx.ellipse(0, 15, 20, 13, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = cfg.nostril;
      ctx.beginPath(); ctx.ellipse(-8, 15, 3, 4, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, 15, 3, 4, 0, 0, TAU); ctx.fill();
    } else if (cfg.nose === "horse") {
      ctx.fillStyle = cfg.snoutCol;
      ctx.beginPath(); ctx.ellipse(0, 19, 13, 19, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = cfg.nostril;
      ctx.beginPath(); ctx.ellipse(-5, 22, 2.4, 4, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, 22, 2.4, 4, 0, 0, TAU); ctx.fill();
    } else if (cfg.nose === "dog") {
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath(); ctx.ellipse(0, 17, 14, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = cfg.noseCol;
      ctx.beginPath(); ctx.ellipse(0, 8, 6, 4.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = cfg.smile; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, 18); ctx.stroke();
      ctx.beginPath(); ctx.arc(-6, 18, 6, 0, 0.6 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(6, 18, 6, 0.4 * Math.PI, Math.PI); ctx.stroke();
      if (cfg.tongue) { ctx.fillStyle = "#ff7a9c"; ctx.beginPath(); ctx.ellipse(0, 25, 4, 6, 0, 0, TAU); ctx.fill(); }
    } else if (cfg.nose === "cat") {
      ctx.fillStyle = cfg.noseCol;
      ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(4, 8); ctx.lineTo(0, 13); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = cfg.smile; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(0, 16); ctx.stroke();
      ctx.beginPath(); ctx.arc(-5, 16, 5, 0, 0.55 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(5, 16, 5, 0.45 * Math.PI, Math.PI); ctx.stroke();
      if (cfg.whiskers) {
        ctx.strokeStyle = "rgba(120,100,120,0.6)"; ctx.lineWidth = 1.4;
        for (const sgn of [-1, 1]) for (const dy of [-3, 1, 5]) {
          ctx.beginPath(); ctx.moveTo(sgn * 11, 9 + dy * 0.5); ctx.lineTo(sgn * 31, 7 + dy); ctx.stroke();
        }
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === "heart") drawHeart(0, 0, p.s, p.col);
      else if (p.kind === "confetti") { ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); }
      else if (p.kind === "star") drawStar(0, 0, p.s, p.col);
      else { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(0, 0, p.s * 0.5, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Cute vertical progress meter: a little pig climbing toward a cloud.
  function drawMeter() {
    const mx = W - 26, top = H * 0.14, bot = H * 0.72, h = bot - top;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 12; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(mx, bot); ctx.lineTo(mx, top); ctx.stroke();
    ctx.strokeStyle = pal.accent; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(mx, bot); ctx.lineTo(mx, bot - h * meterShown); ctx.stroke();
    // cloud at the top
    ctx.fillStyle = "#fff"; cloudShape(mx, top - 14, 0.5); ctx.fill();
    // climbing marker in the chosen animal's colour (drawn, no emoji needed)
    const cfg = ANIMALS[selectedAnimal] || ANIMALS.pig;
    const py = bot - h * meterShown;
    ctx.fillStyle = cfg.earCol;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(mx + sgn * 5, py - 6);
      ctx.lineTo(mx + sgn * 10, py - 13);
      ctx.lineTo(mx + sgn * 2, py - 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = cfg.grad[1];
    ctx.beginPath(); ctx.arc(mx, py, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = cfg.snoutCol || cfg.noseCol || "#e85fa0";
    ctx.beginPath(); ctx.ellipse(mx, py + 2, 4, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#3a2630";
    ctx.beginPath(); ctx.arc(mx - 3, py - 2, 1.4, 0, TAU); ctx.arc(mx + 3, py - 2, 1.4, 0, TAU); ctx.fill();
  }

  // ---------------------------------------------------------------- render
  function render() {
    drawSky();
    drawClouds();
    drawGoal();
    drawDecorations();
    drawGround();
    drawItems();
    drawCharacter();
    drawParticles();
    if (state === State.PLAY) drawMeter();
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;   // clamp big gaps (tab switches)
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // Draw a friendly preview behind the start screen (using saved settings).
  applySettings();
  newAdventure();
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- PWA
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
