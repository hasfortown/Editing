## Download
Click **Cutroom-Setup-1.8.0.exe** under *Assets* below, then run it. It updates your existing install.
If Windows SmartScreen says "Windows protected your PC", click **More info → Run anyway**.
**Collaborating?** Everyone in the session needs 1.8 for internet codes.

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

**If joining over the internet fails:** some very strict networks (some school or office Wi-Fi, a few mobile carriers) block direct connections between computers. Try a different connection (e.g. a phone hotspot) for one of you, or use the same-Wi-Fi code.
