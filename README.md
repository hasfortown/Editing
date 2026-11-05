# Cutroom

A fast, clean multi-track video editor for Windows. It has a modern dark interface and the core editing tools of a professional editor. FFmpeg is bundled inside, so imports and exports work without installing anything else.

## Install (Windows 10/11)

1. Download **`Cutroom-Setup-<version>.exe`** from the latest GitHub release and run it.
2. Windows SmartScreen may say *"Windows protected your PC"* because the app isn't code-signed. Click **More info → Run anyway**.
3. Follow the setup wizard. It installs only for your user, so no admin rights are needed, and it adds Start Menu and desktop shortcuts.
4. To uninstall, go to **Settings → Apps → Cutroom → Uninstall**.

## What's new in 1.8

- **🌍 Collaborate from anywhere, not just the same Wi-Fi.**
  - Start a session and you get a 16-character join code (like `4X5X-J1WT-6032-DEBB`). Your friend enters it on any internet connection — a different house, a phone hotspot, another country — and you're editing together.
  - Video and thumbnails both work, along with live cursors, media sharing (files stream directly between your computers), and everything else.
- **How it connects:**
  - The two apps find each other through a free public connection service (PeerJS, used by many WebRTC apps), then connect **directly**, computer to computer, over an encrypted connection.
  - The connection details are themselves **end-to-end encrypted with a secret inside your join code**, so the service can't read them and nobody without the exact code can join. A wrong code is rejected right away.
- **Same Wi-Fi still works:**
  - If you're on the same network, the old shorter local code still works (under "On the same Wi-Fi?" in the session panel) and is the fastest option.
  - If the internet service can't be reached, sessions fall back to local-only and tell you why.
- Big files are sent in small pieces with flow control, so large videos transfer without running out of memory.

## What's new in 1.7

- **🤝 Collaboration on thumbnails and images:**
  - The **photo editor is now live and shared**, so two (or more) people can work on the same thumbnail, poster, or image at the same time.
  - Every layer syncs on its own: pixels, masks, text, styles, opacity, and position, plus adding, deleting, and reordering layers.
  - **Live cursors** with names show where each person is pointing, and a coloured badge shows which layer each person is on.
  - When someone joins, they get the host's open image automatically. Anyone can share a new image with **Share “…”** in the session panel, or just by opening it.
  - If two people change the same thing at the same moment, everyone ends up with the same result (the later change wins), and nobody's new layers or deletions get lost.
- **Collaboration polish:**
  - A **LIVE** indicator in the top bar.
  - Everyone's avatar shows which editor they're in (🎬 Video, 🖼️ Photo, ✏️ Animate).
  - The people list updates live.
  - Collaboration now works from the photo editor too.
  - Fixed "End session" showing the wrong message for the host.
- **UI tweaks:** a tidier Animate timeline toolbar (compact add-layer buttons that fit on smaller screens) and cleaner top-bar spacing.

Video collaboration was re-tested end to end, and both copies stayed identical with two people making rapid edits at the same time. Covered: live edits, effects and keyframes, importing media (it's sent to the other person automatically), splits, undo, adding titles at the same moment, and leaving/ending sessions.

## What's new in 1.6

- **✏️ Animate, a third app** (home page, or **Animate** at the top), for making 2D animations:
  - **Drawing:** draw frame by frame with brush, pencil, eraser, fill, line, rectangle, and ellipse, with **onion skin** showing the previous frames in red and the next in green.
  - **Moving objects:** add text, emoji, shapes, and images (including from your assets), then animate them with **keyframes and easing** (overshoot, bounce, elastic…). You can see the motion path, and one-click motions include pop in, slide, bounce, spin, and wiggle.
  - **Timeline:** layers, keyframe and blank-keyframe controls, insert and delete frames, FPS, looping playback, and undo/redo.
  - **Export:** MP4, **GIF**, WebM, or PNG frames, or **send straight to the video editor**. Save and open `.cutanim` projects.
  - There's a bouncing-ball demo to learn from.
- **🧍 3D animation in Animate:**
  - Add a **3D layer** with a poseable mannequin, or **import your own rigged character**: **GLB / glTF** (including separate `.bin` and texture files), **FBX** (e.g. from Mixamo), or **OBJ**.
  - **Posing:** click a joint to pose it with rotate/move gizmos, or click the body to move, rotate, and scale the whole model. Orbit, pan, and zoom the camera.
  - **Keyframes:** everything keys the current frame automatically, so poses, model moves, and camera moves tween smoothly. Use **Key whole pose**, **Rest pose**, and **Clear keys**.
  - **Built-in animations:** play the animations that come inside imported files, with speed control.
  - **Auto-animate:** one-click **walk cycle**, **wave**, and **jump**.
  - **Lighting and output:** studio, sunset, night, neon, and soft lighting, with soft shadows on the ground. 3D layers mix with your 2D drawings and objects and export to MP4/GIF like everything else.
- **Animate polish:**
  - Drag keyframes along the timeline to retime them.
  - Copy/paste frames (Ctrl+C / Ctrl+V).
  - Move a whole drawing with the select tool.
  - Choose the onion-skin range (1–5 frames).
  - Add a **sound track** that plays in sync and is included in exports.
- **📚 Asset library ("asset saver"):**
  - Save clips, titles, stickers, images, video, and music once, and reuse them in every project.
  - Right-click a clip → *Save to assets*, or use the new **Assets** panel. In the photo editor, use *Layer → Save layer to assets* and *File → Place from assets*.
  - Your assets are kept in your own app-data folder.
- **💨 Real motion blur:**
  - Clips blur along their actual movement (keyframes, animations, shake, spins, and zooms), like a camera shutter.
  - Turn it on in the Video tab (shutter angle and quality), or use the *Motion blur* effect.
- **🏠 New home page:**
  - Three app cards with live animated previews and a 3D tilt, plus an interactive particle background that reacts to your mouse.
  - Rotating tips, plus quick-start options for each app.

## What's new in 1.5

- **63 transitions** (up from 21), in 6 groups:
  - **Basic:** flash, overexpose, noise dissolve, and more.
  - **Slide & push:** push in every direction, whip pans with motion blur, squeeze, stretch, bounce drop, and split open.
  - **Wipes & shapes:** soft, diagonal, and clock wipes; circle, iris, diamond, star, and heart reveals; blinds, checkerboard, and tiles.
  - **Zoom & spin:** punch in, pull out, spin blur, rotate zoom, and shake.
  - **3D:** cube up, page turn, and fold.
  - **Glitch & light:** RGB glitch, pixelate, ripple, ink bleed, light leak, and film burn.
- **35 new effects** (77 in total), plus 6 new preset looks:
  - **Distortions:** tilt-shift miniature, bulge/fisheye, swirl, water ripple, heat haze, radial spin blur, and split screen/tiles.
  - **Motion:** heartbeat, sway, bounce, earthquake, punch zoom, Ken Burns pan, and wobble.
  - **Color:** noir, sepia, invert, thermal camera, night vision, color pop (keep one color), teal & orange, rainbow shift, and bleach bypass.
  - **Retro:** halftone, CRT monitor, 8-bit game, datamosh, and film scratches & dust.
  - **Light:** god rays, neon edges, disco lights, blink, and shine sweep.
  - **Stylize:** pencil sketch, comic book, ASCII art, and outline.
- **Live previews, CapCut style:**
  - Every transition card shows the real transition and plays it when you hover, using your own footage when you've imported some.
  - Effect cards animate smoothly on hover.
  - **Try-on:** hovering an effect previews it live on the player, on the selected clip or the clip under the playhead, before you click to apply.
  - Transitions now have search and categories.
- **Smoother feel:** spring-in modals, menus, and toasts; press feedback on buttons and cards; animated slider thumbs; panel fade-ins; clips that pop in when added; slimmer scrollbars; and an "applied" pulse on cards. All of it respects Windows' *reduce motion* setting.

## What's new in 1.4

- **Motion tracking** (video clip → **Tracking** tab, or right-click → *Track motion…*):
  - Put a box on anything that moves and press **Track ▶** (or **◀ Track** to go backwards). Tracking runs on the real video frames with a live preview, and it tells you if it loses the target so you can re-place the box and continue.
  - **Add text** or **Add sticker** that follows the target, **attach** any other clip (images, shapes, video), **pixelate** or **blur** it (faces, number plates), or make a **mask follow** it.
  - **Stabilize** shaky footage: *Smooth* removes shake and keeps camera moves, while *Lock* pins the target in place. It zooms just enough to hide the edges.
  - **Auto-reframe:** the camera follows the target, which is great for turning landscape footage into 9:16.
  - Trackers stay lined up when you split or trim the clip, and everything they create is ordinary keyframes you can tweak.
- **Beat sync:** detects the tempo and beats of any music (Audio tab → *Detect beats*: every beat, every 2, every bar, or every 2 bars) and drops markers on them. **Cut clips on beats** then chops your video on every marker for instant music edits.
- **Photo editor:**
  - **Remove tool** (J): paint over people, objects, wires, or blemishes and they're replaced with the surrounding background.
  - **Content-aware fill** (Shift+Delete) fills any selection the same way.
  - **Remove background** (Layer menu) and **Select subject** (Select menu) work best on plain or simple backgrounds. The result is an editable layer mask.
  - **Auto tone** (Ctrl+Shift+L), **Auto contrast**, and **Auto color** (Ctrl+Shift+B).
  - **Histogram** in the Color tab, with clipped shadow and highlight readouts.

## What's new in 1.3

- **Pen tool, like Premiere Pro and Photoshop:**
  - **Video:** draw a bezier mask right on the player. Click to add points, drag for curves, and click the first point (or press Enter) to close. Drag points and handles to adjust, Alt+click a point to toggle corner or smooth, and double-click a point to delete it. Pen masks can be feathered, inverted, combined, and keyframed.
  - **Photo:** draw bezier paths and turn them into a **selection**, a **shape layer**, a **layer mask**, or a brush stroke.
- **Video masking:** pen, rectangle, ellipse, rounded rectangle, star, heart, triangle, split, and band masks. Each has feather, invert, add/subtract/intersect modes, and keyframes on every setting.
- **3D editing:**
  - Rotate clips, text, and images in X, Y, and Z, with perspective and depth.
  - New 3D transitions: cube, card flip, tumble, door, and swing.
- **Warp and wrap** for video, images, and text:
  - Arc, arch, bulge, squeeze, wave, flag, fisheye, and twist.
  - Wrap around a cylinder or a sphere.
  - Corner pin.
- **Styles on any clip:** glow, drop shadow, stroke, inner shadow, bevel, and color and gradient overlays.
- **Shapes:** 12 shapes with corner rounding, gradient fills, strokes, and styles.
- **Overlays:** rain, thunderstorm, snow, blizzard, fog, lightning, camera viewfinder (REC), security cam, phone recording, 90s camcorder, film strip, framing grid, lens flare, light leaks, and bokeh.
- **Voice effects:** deep voice, monster, chipmunk, helium, underwater, robot, alien, ghost, whisper, telephone, old radio, megaphone, room reverb, concert hall, stadium, cave, and echo. They play in the preview and are included in exports.
- **Themes:** dark, light, midnight, forest, sunset, rose, mono, and paper, plus gradient backgrounds, glass panels, any accent color, and corner styles. Open them from the ✨ button at the top.
- **Photo editor:**
  - **Selections:** quick selection brush (K), polygonal lasso, color range, expand, contract, smooth, and border, plus **quick mask mode** (Q).
  - **Retouching:** healing brush and spot healing (J), smudge (R), and **Liquify** (forward warp, bloat, pucker, twirl, reconstruct).
  - **Transforms:** perspective/distort and warp with a bendable grid.
  - **Workflow:** a Color panel with an HSV picker, swatches, and recent colors; a View menu with grid, rule of thirds, and snapping to canvas edges and center; and layer align.

## What's new in 1.2

- **Photo editor:** a Photoshop-style image editor built into the same app. Switch with **🎬 Video / 🖼️ Photo** at the top, or pick either editor from the home page.
  - Layers: pixel, text, shape, fill, and non-destructive adjustment layers, with masks, blend modes, opacity, locking, drag reordering, and merge/flatten.
  - Tools: move/transform, marquee, lasso, magic wand, crop, eyedropper, brush, eraser, clone stamp, dodge/burn/blur/sharpen/sponge, paint bucket, gradient, text, shapes, hand, and zoom.
  - **Layer styles:** drop shadow, inner shadow, outer and inner glow, bevel & emboss, stroke, and color and gradient overlay.
  - Adjustments: levels, curves, brightness/contrast, hue/saturation, color balance, vibrance, exposure, black & white, photo filter, invert, posterize, threshold, gradient map, and color looks.
  - Every video effect is also available as a photo filter. You also get history, copy/paste (including from other apps), canvas and image size, rotate and flip, and PNG/JPG/WebP export.
  - Save as `.cutphoto`. **Send to video** puts the image on your timeline, and **Edit current video frame** opens a frame in the photo editor.
- **Color correction:** a GPU-accelerated Color tab.
  - Exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, hue, and black & white.
  - **Color wheels** for shadows, midtones, and highlights, an RGB and per-channel **curves** editor, and an **HSL** tool for adjusting one color at a time.
  - Sharpen, matte fade, **.cube LUT** import, 13 looks, copy/paste grade, and a hold-to-compare button. Effect clips can carry a grade, so they act as adjustment layers.
- **Better keyframing:** a new Keyframes tab.
  - 35 **animation templates** (in, out, whole clip, loop, and audio).
  - Per-property lanes with draggable keyframes and a **value graph** where you can drag points in time and value.
  - Copy/paste keyframes, and save templates to export or import as `.cutkf`.
  - New easings: smooth, expo, overshoot, bounce, and elastic.
- **Text effects:**
  - Letter-by-letter animations (pop, rise, drop, wave, spin, flip, elastic, blur, scramble/decode, typewriter) and loops (wave, bounce, jiggle, pulse, rainbow, neon flicker, shake, glow pulse).
  - Gradient fills, glow, 3D extrusion, curved text, a second outline, and highlighter backgrounds, plus 14 animated text styles.
- **Home page:** big **Video editor** and **Photo editor** cards, each with its own quick-start sizes, and recent video and photo projects together.

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
| Pen mask: close / undo point / cancel | Enter / Backspace / Esc |
| Photo: pen, quick select, quick mask | P, K, Q |
| Photo: Remove tool, content-aware fill | J (press twice), Shift+Del |
| Photo: auto tone / auto color | Ctrl+Shift+L / Ctrl+Shift+B |
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
