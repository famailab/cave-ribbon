# CAVE RIBBON — Retro Calculator Arcade

A tribute to **SFCave** (Sunflat, Palm OS 1998): the one-button "guide the ribbon
through the cave" classic, rebuilt inside the same retro CaLBoY calculator shell
as DROP 7 MAGIC.

## The 4 modes

| Mode | Control | Goal |
|------|---------|------|
| **CAVE** | Hold anywhere / Space to rise, release to fall | Thread the endless procedurally-generated cave |
| **FLAPPY** | Tap to flap | Slip through the pipes |
| **HELI** | Hold for thrust, release to drop | Dodge ceiling, floor and floating blocks |
| **SHIP** | Drag to steer (arrows/WASD work too) | Cannons auto-fire — blast every asteroid |

Score = distance / pipes / kills. Best score per mode is saved locally.

## Highlights

- **Touch hardening** — the page can never scroll, drag, zoom or rubber-band
  mid-game (`touch-action:none`, `overscroll-behavior:none`, non-passive
  `preventDefault`, no double-tap zoom, no long-press callout, fixed body).
- **Immersive mode (⛶)** — pure-black OLED stage: the calculator melts away and
  the game renders white-on-black so black pixels stay off. Works even where the
  Fullscreen API is unavailable (the CSS alone delivers the black stage).
- Same retro DNA as DROP 7 MAGIC: CaLBoY shell, LCD + scanlines, DSEG7 score
  readout, Chakra Petch brand, DotGothic16 accents, 5 color themes, WebAudio
  8-bit SFX (no assets), pause / mute / help, custom brand name.

## Files

- `index.html` — calculator shell + screens
- `css/style.css` — theme + immersive styles
- `js/game.js` — engine + 4 modes + input
- `js/audio.js` — retro SFX synth
- `fonts/` — DSEG7 Classic, DotGothic16, Chakra Petch (all OFL)

## Dev

Open `index.html` over any static server. `?mode=cave&auto=1` starts an
autopilot demo (used for QA screenshots).
