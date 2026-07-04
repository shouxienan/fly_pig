# 🐷 Piggy Can Fly!

A gentle, musical flying game for a 2‑year‑old. A determined little pig tries very
hard to fly and — never giving up — eventually soars up to touch the clouds. ☁️✨

Runs as a **web app** you add to your iPhone home screen: no App Store, no Xcode, no
expiry. Tap once to install, then it launches full‑screen like a real app and works
offline.

## How to play
- **Tap anywhere** → piggy flaps up and plays a musical note.
- **Or press and hold** → piggy floats up gently (easiest for little fingers).
- Fly through **hearts, stars, notes, rainbows and balloons** to collect them.
- Reach the clouds at the top → 🎉 confetti + a happy fanfare → **Play Again**.
- **Impossible to lose.** If you stop, piggy floats down, bounces softly, and keeps
  trying — there is no "game over."
- Every run is a **new adventure**: different pastel sky, decorations, treasures,
  a surprise at the top (rainbow / castle / sunshine / big star), and a fresh
  musical key.

The notes come from a pentatonic scale, so *any* pattern of taps still sounds pretty.

## Put it on your iPhone (recommended: GitHub Pages)
1. Create a GitHub repo and push this folder:
   ```sh
   git init && git add -A && git commit -m "Piggy Can Fly!"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch →
   `main` / `/ (root)`**, then Save. Wait ~1 minute for the URL.
3. On the iPhone, open that URL in **Safari** → tap **Share** → **Add to Home
   Screen**. Launch it from the home screen for full‑screen, offline play.

### Just want a quick look on your Mac?
```sh
open index.html
```
(Everything works from a file except the offline "install" — that needs the hosted
URL above.)

## 🔊 Sound note (important on iPhone)
iOS mutes web audio when the **silent/ring switch** is off. Flip the ringer **on**
and turn the volume up so piggy's music plays.

## Developer notes
- **Regenerate the app icons:** `python3 gen_icons.py`
- **Run the headless smoke test:** `node test/smoke.mjs`

## Files
| File | Purpose |
| --- | --- |
| `index.html` | Page shell, start/win overlays, PWA meta tags |
| `style.css` | Layout and the big kid‑friendly buttons |
| `game.js` | Game loop, physics, randomized adventures, all the artwork |
| `audio.js` | Synthesized pentatonic music & sound effects (no audio files) |
| `manifest.webmanifest`, `sw.js` | Add‑to‑Home‑Screen + offline support |
| `gen_icons.py` | Draws the piggy home‑screen icons with Pillow |
| `test/smoke.mjs` | Headless run of the real game code |
