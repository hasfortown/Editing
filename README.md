# Cutroom

A fast, clean multi-track video editor for Windows. It has a modern dark interface and the core editing tools of a professional editor. FFmpeg is bundled inside, so imports and exports work without installing anything else.

## Install (Windows 10/11)

1. Run **`Cutroom-Setup-1.0.0.exe`**.
2. Windows SmartScreen may say *"Windows protected your PC"* because the app isn't code-signed. Click **More info → Run anyway**.
3. Follow the setup wizard. It installs only for your user, so no admin rights are needed, and it adds Start Menu and desktop shortcuts.
4. To uninstall, go to **Settings → Apps → Cutroom → Uninstall**.

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

**Live collaboration over Wi-Fi**
- Click **Collaborate → Start session**. Anyone on the same network opens Collaborate and sees your session listed, then joins with the 6-digit PIN.
- Edits sync live. Media you import is transferred to the others automatically, and you can see each person's playhead and selected clips.
- The first time, Windows Firewall asks for permission. Choose **Private networks**.

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

Run that on Windows. On Linux or macOS, use `npx electron-builder --win dir` followed by `makensis build/installer.nsi`.

### Project layout

- `electron/main.js`: app window, media streaming, FFmpeg export, transcoding, and waveforms.
- `electron/collab.js`: LAN discovery over UDP, plus the WebSocket sync hub and media transfer over HTTP.
- `electron/share.js`: `.cutroompack` packing and unpacking.
- `app/js/`: the editor UI. That covers the store, undo and diffs, compositor, playback engine, timeline, inspector, library, export, and collaboration client.
