# Cutroom

A fast, clean multi-track video editor for Windows. It has a modern dark interface and the core editing tools of a professional editor. FFmpeg is bundled inside, so imports and exports work without installing anything else.

## Install (Windows 10/11)

1. Run **`Cutroom-Setup-1.0.0.exe`**.
2. Windows SmartScreen may say *"Windows protected your PC"* because the app isn't code-signed. Click **More info → Run anyway**.
3. Follow the setup wizard. It installs only for your user, so no admin rights are needed, and it adds Start Menu and desktop shortcuts.
4. To uninstall, go to **Settings → Apps → Cutroom → Uninstall**.

## What's new in 1.1

- **Effects:** about 30 base effects across blur & distort, motion, color, retro, light, stylize, overlays, and green screen.
  - Add them to any clip, or drop an **effect clip** on a track to affect everything below it.
  - Most effects can be limited to a **box or ellipse you drag on the player**. Spotlight, kaleidoscope, vignette, and zoom blur have a draggable center.
- **Keyframes:** every slider has a ◆ button, including transform, color, volume, text size, and every effect setting.
  - Choose easing per keyframe (linear, ease in/out, hold) and drag the diamonds on the timeline to retime them.
- **Effect Studio:** stack and tune effects with a live animated preview, then save them as presets.
  - Presets export and import as `.cutfx` files, so you can share looks with friends.
- **Stickers & emoji:** a searchable emoji library, emoji in any text, and an emoji particle rain effect.
- **Home screen:** an animated start screen with one-click new projects for each format, continue-editing, recent projects, and join-with-code.
- **Voice-overs:** record from any microphone with a level meter and countdown, while the timeline plays.
- **Collaborate with a code:** start a session and share the join code. Everyone enters their name first, so you can see who's who.
- **Layers & selection:**
  - 17 blend modes and grouping (Ctrl+G).
  - Shift-click range select and Alt-drag to duplicate.
  - Select everything after the playhead, label colors, and rename (F2).
  - Drag track headers to reorder tracks, with per-track heights.
- **Quality of life:**
  - Command palette (Ctrl+K) and in/out range export and looping (I/O).
  - Audio level meter, hover-scrub in the media library, and a keyboard shortcut sheet (?).

## Features

**Editing**
- Unlimited video and audio tracks. You can drag and drop, trim with edge handles, snap to clip edges, the playhead and markers, and select several clips with a marquee or Ctrl/Shift-click.
- Split at the playhead (**S**), blade tool (**B**), ripple delete (**Shift+Del**), a ripple-trim mode, duplicate, copy and paste, nudge (**Alt+←/→**), close gaps, and markers (**M**).
- Freeze frames, speed from 0.1× to 10× with pitch kept, and detaching audio from video.
- Undo and redo for every action (**Ctrl+Z / Ctrl+Y**).

**Visuals**
- 16 transitions: dissolve, dip to black or white, slides, push, wipes, circle, doors, zoom, spin, blur, and glitch.
- Fade in and out, adjustable by dragging the handles on each clip.
- Transform: scale, position, rotation, opacity, flip, and fit, fill, or stretch. You can drag, scale, and rotate directly in the player, with snap guides.
- Color: brightness, contrast, saturation, temperature, hue, blur, vignette, black and white, sepia, and invert, plus 14 filter presets.
- Text with any installed font: outline, shadow, background box, letter spacing, and 10 presets. In and out animations include pop, rise, typewriter, focus, and Ken Burns.
- Solid-color clips, and canvas sizes of 16:9, 9:16, 1:1, 4:5, 4:3, and 21:9.

**Audio**
- Live waveforms, per-clip volume up to 200%, fades, and mute or hide per track.
- Transitions crossfade the audio automatically.

**Export**
- Video: MP4 (H.264), MOV (ProRes 422), WebM (VP9), and GIF, at 480p up to 4K and 24 to 60 fps. Rendering is frame-accurate.
- Audio: the full mix or one file per track ("stems") as WAV, MP3, M4A, or FLAC.
- Save any frame as a PNG.

**Files and sharing**
- Projects save as `.cutroom` files (**Ctrl+S**), with autosave and crash recovery.
- **Share Project** bundles the project and every media file into one `.cutroompack` file. Send it any way you like, and the recipient opens it with a double-click.
- Almost any video format can be imported. Formats Windows can't play natively, such as some AVI, WMV, or MTS files, are converted automatically for editing.

**Collaborate**
- Click **Collaborate**, enter your name, and start a session. You get a join code like `K7F2-9QXA-M3TD`.
- Friends enter the code in **Collaborate** or on the home screen, along with their own name.
- Edits sync live and media transfers automatically. Everyone's playhead and selected clips show with their name and color.
- Your friends' computers must be able to reach yours, for example on the same home, school, or office network.
- The first time, Windows Firewall asks for permission. Choose **Allow**.

## Keyboard shortcuts

| Action | Keys |
|---|---|
| Play / pause | Space (also J / K / L) |
| Split | S or Ctrl+B |
| Blade / select tool | B / V |
| Delete / ripple delete | Del / Shift+Del |
| Frame step / 1-second jump | ← → / Shift+← → |
| Previous / next edit point | ↑ / ↓ |
| Zoom timeline | Ctrl+wheel, + / − , Shift+Z to fit |
| Import / Save / Open / Export | Ctrl+I / Ctrl+S / Ctrl+O / Ctrl+E |
| Command palette | Ctrl+K |
| In / out point, clear | I / O, Alt+X |
| Group / ungroup | Ctrl+G / Ctrl+Shift+G |
| Range select / duplicate-drag | Shift+click / Alt+drag |
| Record voiceover / add text | R / T |
| All shortcuts | ? |

## Build from source

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

`npm start` runs the editor in development mode. It uses `ffmpeg` from your PATH.

To build the Windows installer, put `ffmpeg.exe` from a Windows build (for example from https://github.com/BtbN/FFmpeg-Builds/releases) in `vendor/ffmpeg/win32/`, then run:

```bash
npm run dist:win
```

Run that on Windows. On Linux or macOS, use `npx electron-builder --win dir` followed by `makensis build/cutroom-standalone.nsi`.

### Project layout

- `electron/main.js`: app window, media streaming, FFmpeg export, transcoding, and waveforms.
- `electron/collab.js`: session discovery over UDP, plus the WebSocket sync hub and media transfer over HTTP.
- `electron/share.js`: `.cutroompack` packing and unpacking.
- `app/js/`: the editor UI. That covers the store, undo and diffs, compositor, playback engine, timeline, inspector, library, export, and collaboration client.
- `app/js/effects.js`, `keyframes.js`, `presets.js`: the effects engine, the keyframe system, and the Effect Studio with presets.
