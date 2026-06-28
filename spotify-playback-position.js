// spotify-playback-position.js
// Playback position detection for Spotify Web Player. Avoids OCR.

class SpotifyPlaybackPositionProvider {
  constructor(sendCommand) {
    if (typeof sendCommand !== "function") {
      throw new Error("SpotifyPlaybackPositionProvider requires a sendCommand function");
    }
    this.sendCommand = sendCommand;
  }

  async getPosition() {
    const sources = [
      () => this.getFromMediaSession(),
      () => this.getFromSpotifyInternalState(),
      () => this.getFromVisibleTimerText(),
    ];

    for (const source of sources) {
      const result = await source();
      if (this.isUsablePosition(result)) {
        return this.withPercent(result);
      }
    }

    return {
      source: "unavailable",
      positionSeconds: null,
      durationSeconds: null,
      percent: null,
    };
  }

  async getFromMediaSession() {
    const value = await this.evaluateInPage(`
      (() => {
        const snapshot = window.__hookLoopMediaSessionPositionState || null;
        if (snapshot && Number.isFinite(snapshot.position)) {
          return {
            source: "mediaSession",
            positionSeconds: snapshot.position,
            durationSeconds: Number.isFinite(snapshot.duration) ? snapshot.duration : null,
            playbackRate: Number.isFinite(snapshot.playbackRate) ? snapshot.playbackRate : null,
            note: "read from instrumented MediaSession.setPositionState snapshot"
          };
        }

        return {
          source: "mediaSession",
          positionSeconds: null,
          durationSeconds: null,
          playbackState: navigator.mediaSession ? navigator.mediaSession.playbackState : null,
          note: "MediaSession exposes metadata/playbackState, but not a readable current position getter"
        };
      })()
    `);
    return this.normalizePosition(value, "mediaSession");
  }

  async getFromSpotifyInternalState() {
    const value = await this.evaluateInPage(`
      (() => {
        const POSITION_KEYS = /(^|_|-)(position|positionms|position_ms|currenttime|current_time|playbackposition|playback_position|progress|progressms|progress_ms)($|_|-)/i;
        const DURATION_KEYS = /(^|_|-)(duration|durationms|duration_ms)($|_|-)/i;
        const MAX_DEPTH = 7;
        const seen = new Set();

        function numberFromValue(value) {
          if (typeof value === "number" && Number.isFinite(value)) return value;
          if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
            return Number(value);
          }
          return null;
        }

        function normalizeSeconds(value) {
          const number = numberFromValue(value);
          if (number == null) return null;
          return number > 10000 ? number / 1000 : number;
        }

        function findPair(value, depth, path) {
          if (!value || typeof value !== "object" || depth > MAX_DEPTH || seen.has(value)) return null;
          seen.add(value);

          let positionSeconds = null;
          let durationSeconds = null;
          let positionPath = null;
          let durationPath = null;

          for (const [key, child] of Object.entries(value)) {
            if (POSITION_KEYS.test(key)) {
              const normalized = normalizeSeconds(child);
              if (normalized != null) {
                positionSeconds = normalized;
                positionPath = path.concat(key).join(".");
              }
            }
            if (DURATION_KEYS.test(key)) {
              const normalized = normalizeSeconds(child);
              if (normalized != null) {
                durationSeconds = normalized;
                durationPath = path.concat(key).join(".");
              }
            }
          }

          if (
            positionSeconds != null &&
            durationSeconds != null &&
            durationSeconds > 0 &&
            positionSeconds >= 0 &&
            positionSeconds <= durationSeconds + 5
          ) {
            return { positionSeconds, durationSeconds, positionPath, durationPath };
          }

          for (const [key, child] of Object.entries(value)) {
            const found = findPair(child, depth + 1, path.concat(key));
            if (found) return found;
          }

          return null;
        }

        function safeJson(value) {
          if (typeof value !== "string" || value.length > 250000) return null;
          try {
            return JSON.parse(value);
          } catch (e) {
            return null;
          }
        }

        const roots = [];
        for (const key of Object.keys(window)) {
          if (/spotify|player|playback|connect|redux|state/i.test(key)) {
            try {
              roots.push({ name: "window." + key, value: window[key] });
            } catch (e) {}
          }
        }

        for (const storage of [localStorage, sessionStorage]) {
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (!/spotify|player|playback|connect|state/i.test(key || "")) continue;
            const parsed = safeJson(storage.getItem(key));
            if (parsed) roots.push({ name: storage === localStorage ? "localStorage." + key : "sessionStorage." + key, value: parsed });
          }
        }

        for (const root of roots) {
          const found = findPair(root.value, 0, [root.name]);
          if (found) {
            return { source: "spotifyInternalState", root: root.name, ...found };
          }
        }

        return {
          source: "spotifyInternalState",
          positionSeconds: null,
          durationSeconds: null,
          note: "No readable Spotify state object with position/duration was found"
        };
      })()
    `);
    return this.normalizePosition(value, "spotifyInternalState");
  }

  async getFromVisibleTimerText() {
    const value = await this.evaluateInPage(`
      (() => {
        const TIME_TEXT_RE = /^\\d{1,2}(:\\d{2}){1,2}$/;

        function parseTimeText(str) {
          if (!str) return null;
          const trimmed = str.trim();
          if (!TIME_TEXT_RE.test(trimmed)) return null;
          return trimmed.split(":").map(Number).reduce((seconds, part) => seconds * 60 + part, 0);
        }

        function bySelector() {
          const positionEl = document.querySelector('[data-testid="playback-position"]');
          const durationEl = document.querySelector('[data-testid="playback-duration"]');
          const positionSeconds = positionEl ? parseTimeText(positionEl.textContent) : null;
          const durationSeconds = durationEl ? parseTimeText(durationEl.textContent) : null;
          if (positionSeconds != null || durationSeconds != null) {
            return { positionSeconds, durationSeconds, method: "data-testid" };
          }
          return null;
        }

        function byFooterText() {
          const nowPlaying = document.querySelector('[data-testid="now-playing-widget"]');
          const scope = (nowPlaying && nowPlaying.closest("footer")) || document.querySelector("footer") || document.body;
          const times = Array.from(scope.querySelectorAll("div, span"))
            .filter((el) => el.children.length === 0)
            .map((el) => parseTimeText(el.textContent))
            .filter((time) => time != null);

          if (times.length >= 2) {
            return { positionSeconds: times[0], durationSeconds: times[times.length - 1], method: "footer-text-scan" };
          }
          if (times.length === 1) {
            return { positionSeconds: times[0], durationSeconds: null, method: "footer-text-scan" };
          }
          return null;
        }

        const found = bySelector() || byFooterText();
        return {
          source: "visibleTimerText",
          positionSeconds: found ? found.positionSeconds : null,
          durationSeconds: found ? found.durationSeconds : null,
          method: found ? found.method : null
        };
      })()
    `);
    return this.normalizePosition(value, "visibleTimerText");
  }

  async evaluateInPage(expression) {
    const response = await this.sendCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });
    return response && response.result ? response.result.value : null;
  }

  normalizePosition(value, fallbackSource) {
    if (!value || typeof value !== "object") {
      return {
        source: fallbackSource,
        positionSeconds: null,
        durationSeconds: null,
      };
    }

    return {
      ...value,
      source: value.source || fallbackSource,
      positionSeconds: this.normalizeSeconds(value.positionSeconds),
      durationSeconds: this.normalizeSeconds(value.durationSeconds),
    };
  }

  normalizeSeconds(value) {
    if (typeof value !== "number" || !isFinite(value) || value < 0) return null;
    return value;
  }

  isUsablePosition(result) {
    return !!result && typeof result.positionSeconds === "number" && isFinite(result.positionSeconds);
  }

  withPercent(result) {
    const percent =
      typeof result.durationSeconds === "number" && result.durationSeconds > 0
        ? Math.min(Math.max(result.positionSeconds / result.durationSeconds, 0), 1)
        : null;
    return { ...result, percent };
  }
}

globalThis.SpotifyPlaybackPositionProvider = SpotifyPlaybackPositionProvider;

if (typeof module !== "undefined") {
  module.exports = { SpotifyPlaybackPositionProvider };
}
