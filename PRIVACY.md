# Hook Loop Privacy Policy

Effective date: June 28, 2026

Hook Loop is a Chrome extension that lets users loop a selected section of a
song on YouTube Music and Spotify Web Player.

## Data Collection

Hook Loop does not collect, sell, share, or transmit personal information.

The extension does not use analytics, tracking pixels, advertising SDKs, or
remote servers. Hook Loop does not send your listening activity, song titles,
loop times, browsing history, or account information to the developer or to any
third party.

## Data Stored Locally

Hook Loop stores extension settings locally in Chrome storage on your device.
This may include:

- loop start and end times
- whether looping is currently enabled
- saved loop times for songs you have configured
- basic track identifiers or titles used only to match saved loop times to the
  same song later

This data remains in your browser's local extension storage. It is not uploaded
or synced by Hook Loop.

## Website Access

Hook Loop works only on supported music sites:

- YouTube Music (`https://music.youtube.com/*`)
- Spotify Web Player (`https://open.spotify.com/*`)

On YouTube Music, the extension reads playback information from the page and
controls playback timing locally in the tab.

On Spotify Web Player, the extension uses the Chrome Debugger API to read
playback position and perform trusted mouse-based seeking on Spotify's playback
timeline. This access is used only for Hook Loop's Spotify looping feature.

## Chrome Permissions

Hook Loop requests the following Chrome permissions:

- `storage`: saves loop settings and saved loops locally.
- `tabs`: detects whether the active tab is a supported music site.
- `debugger`: enables Spotify Web Player seeking through Chrome's debugging
  protocol.
- `https://open.spotify.com/*`: allows Spotify Web Player support.

These permissions are used only to provide the extension's looping features.

## Third Parties

Hook Loop does not share data with third parties. YouTube Music and Spotify Web
Player remain governed by their own privacy policies when you use those
services.

## Data Removal

You can remove locally stored Hook Loop data by uninstalling the extension or by
clearing the extension's site and storage data from Chrome.

## Changes

This privacy policy may be updated if Hook Loop's features or data handling
change. Any future changes should continue to describe what data is stored, how
it is used, and whether any data leaves your device.

## Contact

If you have questions about this privacy policy, please open an issue on the
[GitHub repository](https://github.com/unnati396/hook-loop-extension/issues).
