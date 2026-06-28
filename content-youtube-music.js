// content-youtube-music.js
// Runs on music.youtube.com. Finds the underlying <video> element that
// YT Music uses for playback and loops it between loopState.start and
// loopState.end whenever the loop is enabled.

(function () {
  const STORAGE_KEY = "hookLoopState_ytmusic";
  const SEEK_VERIFY_DELAY_MS = 300;
  const SEEK_EARLY_TOLERANCE_SECONDS = 0.2;
  const SEEK_CORRECTION_BIAS_SECONDS = 0.25;
  const SEEK_CORRECTION_ATTEMPTS = 3;

  /**
   * @typedef {Object} SeekController
   * @property {(percent: number) => Promise<void>} seek
   */

  let loopState = { enabled: false, start: 0, end: 0 };
  let lastTitle = null;
  let lastTrackKey = null;
  let attachedVideo = null;
  let trackStartOffset = 0;
  let isSeeking = false;

  function getVideo() {
    return document.querySelector("video");
  }

  function getTrackTitle() {
    const mediaTitle = navigator.mediaSession?.metadata?.title;
    if (mediaTitle && mediaTitle.trim()) return mediaTitle.trim();

    const el =
      document.querySelector(".title.ytmusic-player-bar") ||
      document.querySelector("yt-formatted-string.title");
    return el ? el.textContent.trim() : document.title;
  }

  function getTrackKey() {
    const params = new URL(location.href).searchParams;
    const videoId = params.get("v");
    if (videoId) return `video:${videoId}`;

    const metadata = navigator.mediaSession?.metadata;
    if (metadata?.title) {
      return `media:${metadata.title}|${metadata.artist || ""}|${metadata.album || ""}`;
    }

    return `title:${getTrackTitle()}`;
  }

  function parseTimeText(text) {
    if (!text) return null;
    const parts = String(text).trim().split(":").map((part) => Number(part));
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !isFinite(part))) {
      return null;
    }
    return parts.reduce((seconds, part) => seconds * 60 + part, 0);
  }

  function extractTimesFromText(text) {
    const matches = String(text || "").match(/\d+(?::\d{1,2}){1,2}/g);
    if (!matches || matches.length === 0) return null;
    return {
      currentTime: parseTimeText(matches[0]),
      duration: matches.length > 1 ? parseTimeText(matches[matches.length - 1]) : null,
    };
  }

  function getProgressSliderTimes() {
    const selectors = [
      "#progress-bar",
      "tp-yt-paper-slider#progress-bar",
      "ytmusic-player-bar tp-yt-paper-slider",
      'ytmusic-player-bar [role="slider"]',
      '[aria-valuetext*="of" i]',
      '[aria-label*="progress" i]',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;

      const textTimes =
        extractTimesFromText(el.getAttribute("aria-valuetext")) ||
        extractTimesFromText(el.getAttribute("aria-label")) ||
        extractTimesFromText(el.getAttribute("title"));
      if (textTimes && textTimes.currentTime != null) return textTimes;

      const now = Number(el.getAttribute("aria-valuenow") || el.value);
      const max = Number(el.getAttribute("aria-valuemax") || el.max);
      if (isFinite(now) && isFinite(max) && max > 100) {
        return { currentTime: now, duration: max };
      }
    }

    return { currentTime: null, duration: null };
  }

  function getVisiblePlaybackTimes() {
    const selectors = [
      ".time-info.ytmusic-player-bar",
      "ytmusic-player-bar .time-info",
      "#left-controls .time-info",
      "ytmusic-player-bar",
      "ytmusic-player",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const times = extractTimesFromText(el ? el.textContent : "");
      if (times && times.currentTime != null) return times;
    }

    return getProgressSliderTimes();
  }

  function syncTrackOffset(video) {
    const visible = getVisiblePlaybackTimes();
    if (video && visible.currentTime != null) {
      trackStartOffset = Math.max(0, video.currentTime - visible.currentTime);
    }
    return visible;
  }

  function getTrackCurrentTime(video) {
    const visible = syncTrackOffset(video);
    if (visible.currentTime != null) return visible.currentTime;
    if (!video) return 0;
    if (video.currentTime < trackStartOffset) trackStartOffset = 0;
    return Math.max(0, video.currentTime - trackStartOffset);
  }

  function getRawTrackCurrentTime(video) {
    if (!video) return 0;
    if (video.currentTime < trackStartOffset) trackStartOffset = 0;
    return Math.max(0, video.currentTime - trackStartOffset);
  }

  function getTrackDuration(video) {
    const visible = getVisiblePlaybackTimes();
    if (visible.duration != null) return visible.duration;
    return video && isFinite(video.duration) ? video.duration : 0;
  }

  function clearLoopForTrackChange(video) {
    const visible = getVisiblePlaybackTimes();
    trackStartOffset =
      video && visible.currentTime != null
        ? Math.max(0, video.currentTime - visible.currentTime)
        : video
          ? video.currentTime
          : 0;
    loopState = { enabled: false, start: 0, end: 0 };
    chrome.storage.local.set({ [STORAGE_KEY]: loopState });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getYouTubePlayerApi() {
    const candidates = [
      document.querySelector("ytmusic-player"),
      document.querySelector("ytmusic-app"),
      document.querySelector("ytmusic-player-bar"),
      document.querySelector("ytd-app"),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const api =
        candidate.playerApi ||
        candidate.player_ ||
        candidate.player ||
        candidate.$?.player;
      if (api) return api;
    }

    return null;
  }

  function seekWithYouTubePlayerApi(targetSeconds) {
    const api = getYouTubePlayerApi();
    if (!api) return false;

    const targetMs = Math.max(0, targetSeconds) * 1000;
    const target = Math.max(0, targetSeconds);
    const attempts = [
      () => api.seekTo(target),
      () => api.seekTo(target, true),
      () => api.seekToStreamTime(target),
      () => api.seekToStreamTime(targetMs),
      () => api.seekBy && api.seekBy(target - Number(api.getCurrentTime?.() || 0)),
    ];

    for (const attempt of attempts) {
      try {
        const result = attempt();
        if (result !== false) return true;
      } catch (e) {}
    }

    return false;
  }

  function setVideoTrackTime(video, targetSeconds) {
    video.currentTime = trackStartOffset + Math.max(0, targetSeconds);
  }

  function getSeekVerificationTime(video) {
    const visible = getVisiblePlaybackTimes();
    if (visible.currentTime != null) return visible.currentTime;
    return getRawTrackCurrentTime(video);
  }

  /**
   * @returns {SeekController}
   */
  function createSeekController(durationSeconds) {
    return {
      async seek(percent) {
        const video = getVideo();
        if (!video || !durationSeconds) return;
        syncTrackOffset(video);
        const clampedPercent = Math.min(Math.max(percent, 0), 1);
        const targetSeconds = durationSeconds * clampedPercent;
        if (!seekWithYouTubePlayerApi(targetSeconds)) {
          setVideoTrackTime(video, targetSeconds);
        }
        if (video.paused) video.play().catch(() => {});
      },
    };
  }

  async function seekTo(targetSeconds, durationSeconds) {
    if (!durationSeconds || isSeeking) return;
    const video = getVideo();
    if (!video) return;

    isSeeking = true;
    try {
      syncTrackOffset(video);
      if (!seekWithYouTubePlayerApi(targetSeconds)) {
        setVideoTrackTime(video, targetSeconds);
      }
      if (video.paused) video.play().catch(() => {});

      for (let attempt = 0; attempt < SEEK_CORRECTION_ATTEMPTS; attempt += 1) {
        await sleep(SEEK_VERIFY_DELAY_MS);

        const currentTime = getSeekVerificationTime(video);
        const earlyBySeconds = targetSeconds - currentTime;
        if (earlyBySeconds <= SEEK_EARLY_TOLERANCE_SECONDS) break;

        const correctedTarget =
          targetSeconds + earlyBySeconds + SEEK_CORRECTION_BIAS_SECONDS;
        if (!seekWithYouTubePlayerApi(correctedTarget)) {
          syncTrackOffset(video);
          setVideoTrackTime(video, correctedTarget);
        }
      }
    } finally {
      isSeeking = false;
    }
  }

  function handleTimeUpdate() {
    if (!loopState.enabled || isSeeking) return;
    const video = getVideo();
    if (!video) return;
    if (loopState.end > loopState.start && getTrackCurrentTime(video) >= loopState.end) {
      seekTo(loopState.start, getTrackDuration(video));
    }
  }

  function attachListener() {
    const video = getVideo();
    if (video && video !== attachedVideo) {
      if (attachedVideo) {
        attachedVideo.removeEventListener("timeupdate", handleTimeUpdate);
      }
      video.addEventListener("timeupdate", handleTimeUpdate);
      attachedVideo = video;
    }
  }

  // YT Music is a single-page app: the <video> tag can be replaced or the
  // track can change without a full page load. Watch for both.
  function checkTrackChange() {
    const title = getTrackTitle();
    const trackKey = getTrackKey();
    const video = getVideo();
    if (lastTitle === null && lastTrackKey === null) {
      lastTitle = title;
      lastTrackKey = trackKey;
      syncTrackOffset(video);
      return;
    }
    if ((trackKey && trackKey !== lastTrackKey) || (title && title !== lastTitle)) {
      lastTitle = title;
      lastTrackKey = trackKey;
      clearLoopForTrackChange(video);
    }
  }

  const observer = new MutationObserver(() => {
    attachListener();
    checkTrackChange();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  attachListener();
  setInterval(checkTrackChange, 1000);

  // Restore last-used state on load (only the saved start/end, never
  // auto re-enable, to avoid silently looping the wrong song).
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    if (res && res[STORAGE_KEY]) {
      loopState = { ...res[STORAGE_KEY], enabled: false };
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    checkTrackChange();
    const video = getVideo();
    switch (msg.action) {
      case "setLoop":
        loopState = {
          enabled: !!msg.enabled,
          start: Number(msg.start) || 0,
          end: Number(msg.end) || 0,
        };
        lastTitle = getTrackTitle();
        lastTrackKey = getTrackKey();
        chrome.storage.local.set({ [STORAGE_KEY]: loopState });
        if (loopState.enabled && video) {
          seekTo(loopState.start, getTrackDuration(video));
        }
        sendResponse({ ok: true });
        break;

      case "getStatus":
        sendResponse({
          ok: true,
          site: "ytmusic",
          enabled: loopState.enabled,
          start: loopState.start,
          end: loopState.end,
          currentTime: getTrackCurrentTime(video),
          duration: getTrackDuration(video),
          title: getTrackTitle(),
          trackKey: getTrackKey(),
          hasMedia: !!video,
        });
        break;

      case "getCurrentTime":
        sendResponse({ ok: true, currentTime: getTrackCurrentTime(video) });
        break;

      default:
        sendResponse({ ok: false, error: "unknown action" });
    }
    return true;
  });
})();
