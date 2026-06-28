# Hook Loop

Hook Loop is a Chrome extension for repeating your favorite hook, chorus,
solo, practice section, or any short part of a song on YouTube Music and
Spotify Web Player.

It lets you set a start and end time, then automatically jumps back to the
start whenever playback reaches the end. Hook Loop also remembers saved loop
times per song and shows a compact progress bar in the popup.

## Supported Sites

- YouTube Music: `https://music.youtube.com/*`
- Spotify Web Player: `https://open.spotify.com/*`

## Features

- Loop any section of a song between a start and end time.
- Use the current playback position for start or end with one click.
- Type times as `1:23`, `1:02:03`, or plain seconds like `83`.
- Automatically clears active loop timers when the song changes.
- Saves loop times per song, separately for YouTube Music and Spotify.
- Shows current playback progress and the selected loop range in the popup.
- Keeps all saved data local in Chrome storage.

## Install Unpacked

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on.
3. Click **Load unpacked**.
4. Select this folder.
5. Open YouTube Music or Spotify Web Player.
6. Refresh the music tab once after installing or updating the extension.
7. Click the Hook Loop extension icon.

## Usage

1. Play the song you want to loop.
2. Open Hook Loop.
3. Click **Use current** next to **Start**, or type a start time.
4. Click **Use current** next to **End**, or type an end time.
5. Click **Start Looping**.
6. Click **Stop Looping** to let the song continue normally.

If the same song is opened again later, Hook Loop can fill in the saved loop
times for that song. It does not auto-start saved loops.

## How It Works

### YouTube Music

Hook Loop runs a content script on YouTube Music. It reads the current playback
time from the player UI and media element, then controls playback locally in the
tab. For seeking, it first tries YouTube Music's player API when available and
falls back to direct media seeking.

### Spotify Web Player

Spotify Web Player does not reliably expose a controllable audio element for
extensions. Hook Loop uses the Chrome Debugger API for Spotify support:

- reads playback position from available page/player state
- finds Spotify's playback timeline
- seeks by sending trusted Chrome DevTools Protocol mouse input

Chrome may show a debugger notification while Spotify looping or seeking is
active. Hook Loop detaches the debugger when Spotify looping is idle whenever
possible.

## Privacy

Hook Loop does not use analytics, ads, tracking, or remote servers. Loop times
and saved loops are stored locally in Chrome storage.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Chrome Web Store Description

### Short Description

Loop your favorite hook or chorus on YouTube Music and Spotify Web Player.

### Detailed Description

Hook Loop helps you replay the best part of a song without manually dragging
the timeline again and again.

Set a start time, set an end time, and Hook Loop will keep replaying that
section for you. It is useful for practicing music, learning lyrics, rehearsing
dance sections, studying solos, or just replaying the part of a track you love.

Features:

- Loop any part of a song between custom start and end times.
- Use the current playback position for start or end.
- Save loop times per song.
- View playback progress and the selected loop range in the popup.
- Works on YouTube Music and Spotify Web Player.
- Stores data locally in your browser.
- No analytics, ads, tracking, or remote servers.

Spotify note: Spotify support uses Chrome's Debugger API to perform reliable
trusted seeking on the Spotify Web Player timeline. Chrome may show a debugger
notification while Spotify looping or seeking is active.

## Permission Justifications

- `storage`: saves loop settings and saved loops locally.
- `tabs`: detects whether the active tab is YouTube Music or Spotify Web
  Player.
- `debugger`: enables reliable Spotify Web Player seeking through Chrome
  DevTools Protocol.
- `https://open.spotify.com/*`: limits Spotify-specific access to Spotify Web
  Player.

## Files

- `manifest.json`: extension config, Manifest V3
- `popup.html`, `popup.css`, `popup.js`: toolbar popup UI
- `content-youtube-music.js`: YouTube Music content script
- `background.js`: Spotify debugger-backed loop controller
- `debugger-manager.js`: Chrome Debugger API wrapper
- `mouse-controller.js`: trusted CDP mouse input helper
- `loop-controller.js`: percentage-based loop controller
- `spotify-playback-position.js`: Spotify playback position provider
- `icons/`: extension icons
- `PRIVACY.md`: privacy policy
