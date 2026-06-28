importScripts(
  "coordinate-utils.js",
  "debugger-manager.js",
  "mouse-controller.js",
  "loop-controller.js",
  "spotify-playback-position.js"
);

const SPOTIFY_STORAGE_KEY = "hookLoopState_spotify";
const TIMELINE_SELECTORS = [
  '[data-testid="playback-progressbar"]',
  '[role="slider"]',
  '[role="progressbar"]',
  '[aria-label*="seek" i]',
  '[aria-label*="progress" i]',
  '[aria-label*="position" i]',
  '[aria-label*="playback" i]',
  '[aria-label*="scrubber" i]',
  '[aria-label*="timeline" i]',
];
const LOOP_TIMING = {
  pollIntervalMs: 500,
  seekCooldownMs: 1200,
  afterSeekDelayMs: 500,
};
const SEEK_TIMING = {
  durationMs: 450,
};

const debuggerManager = new DebuggerManager();
const mouseController = new MouseController(debuggerManager.sendCommand.bind(debuggerManager));
const positionProvider = new SpotifyPlaybackPositionProvider(debuggerManager.sendCommand.bind(debuggerManager));
const spotifyControllers = new Map();
const spotifyTabStates = new Map();

function clampPercent(value) {
  const number = Number(value);
  if (!isFinite(number)) return 0;
  return Math.min(Math.max(number, 0), 1);
}

function secondsToPercent(seconds, durationSeconds) {
  if (!durationSeconds || !isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return clampPercent(seconds / durationSeconds);
}

function percentToSeconds(percent, durationSeconds) {
  if (!durationSeconds || !isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return clampPercent(percent) * durationSeconds;
}

function getSeekDragStartPercent(targetPercent, playbackPercent) {
  return playbackPercent == null || !isFinite(playbackPercent)
    ? clampPercent(targetPercent)
    : clampPercent(playbackPercent);
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => resolve(res && res[key]));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, resolve);
  });
}

async function clearSpotifyLoopState(tabId, duration = 0) {
  const controller = await getController(tabId);
  controller.clearLoop();
  controller.stop();
  const clearedState = { enabled: false, start: 0, end: 0, duration };
  await storageSet({ [SPOTIFY_STORAGE_KEY]: clearedState });
  await detachSpotify(tabId);
  return clearedState;
}

async function handleSpotifyTitleChange(tabId, title, duration = 0) {
  const tabState = spotifyTabStates.get(tabId) || {};
  if (title && tabState.lastTitle && title !== tabState.lastTitle) {
    const clearedState = await clearSpotifyLoopState(tabId, duration);
    spotifyTabStates.set(tabId, { ...tabState, lastTitle: title });
    return { changed: true, clearedState };
  }

  spotifyTabStates.set(tabId, { ...tabState, lastTitle: title || tabState.lastTitle });
  return { changed: false, clearedState: null };
}

async function attachSpotify(tabId) {
  await debuggerManager.attach(tabId);
}

async function detachSpotify(tabId) {
  await debuggerManager.detach(tabId).catch(() => {});
}

function isSpotifyLoopActive(tabId) {
  const controller = spotifyControllers.get(tabId);
  if (!controller) return false;
  const state = controller.getState();
  return !!state.enabled && !!state.running;
}

async function detachSpotifyIfIdle(tabId) {
  if (!isSpotifyLoopActive(tabId)) {
    await detachSpotify(tabId);
  }
}

async function evaluateInSpotify(expression) {
  const response = await debuggerManager.sendCommand("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  return response && response.result ? response.result.value : null;
}

async function getSpotifyTitle() {
  return (
    (await evaluateInSpotify(`
      (() => {
        const selectors = [
          '[data-testid="context-item-info-title"]',
          '[data-testid="now-playing-widget"] a[href^="/track"]',
          '[data-testid="now-playing-widget"]'
        ];
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim()) return el.textContent.trim();
        }
        return document.title;
      })()
    `)) || ""
  );
}

async function findTimelineCoordinates() {
  const documentResult = await debuggerManager.sendCommand("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  const rootNode = documentResult.root;

  for (const selector of TIMELINE_SELECTORS) {
    const queryResult = await debuggerManager.sendCommand("DOM.querySelector", {
      nodeId: rootNode.nodeId,
      selector,
    });
    if (!queryResult.nodeId) continue;

    try {
      const boxModel = await debuggerManager.sendCommand("DOM.getBoxModel", {
        nodeId: queryResult.nodeId,
      });
      const coordinates = computeBoxModelCoordinates(boxModel);
      if (coordinates.width > 20 && coordinates.height > 0) {
        return { nodeId: queryResult.nodeId, selector, coordinates };
      }
    } catch (e) {}
  }

  throw new Error("Spotify playback timeline was not found");
}

async function seekSpotifyToPercent(percent) {
  const [timeline, playback] = await Promise.all([
    findTimelineCoordinates(),
    getSpotifyPlayback(),
  ]);
  const startPercent = getSeekDragStartPercent(percent, playback.percent);
  return mouseController.seekToPercent(percent, timeline.coordinates, {
    ...SEEK_TIMING,
    startPercent,
  });
}

async function getSpotifyPlayback() {
  return positionProvider.getPosition();
}

async function getController(tabId) {
  let controller = spotifyControllers.get(tabId);
  if (controller) return controller;

  controller = new LoopController({
    ...LOOP_TIMING,
    getPositionPercent: async () => {
      await attachSpotify(tabId);
      const [playback, title] = await Promise.all([getSpotifyPlayback(), getSpotifyTitle()]);
      const duration = playback.durationSeconds || 0;
      const titleChange = await handleSpotifyTitleChange(tabId, title, duration);
      if (titleChange.changed) return null;
      return playback.percent;
    },
    seekToPercent: async (percent) => {
      await attachSpotify(tabId);
      await seekSpotifyToPercent(percent);
    },
  });
  spotifyControllers.set(tabId, controller);
  return controller;
}

async function getSpotifyStatus(tabId) {
  await attachSpotify(tabId);
  try {
    let [savedState, playback, title] = await Promise.all([
      storageGet(SPOTIFY_STORAGE_KEY),
      getSpotifyPlayback(),
      getSpotifyTitle(),
    ]);
    const controller = await getController(tabId);
    const duration = playback.durationSeconds || savedState?.duration || 0;
    const titleChange = await handleSpotifyTitleChange(tabId, title, duration);
    if (titleChange.changed) savedState = titleChange.clearedState;
    const state = controller.getState();

    return {
      ok: true,
      site: "spotify",
      enabled: state.enabled,
      start: savedState ? Number(savedState.start) || 0 : percentToSeconds(state.startPercent, duration),
      end: savedState ? Number(savedState.end) || 0 : percentToSeconds(state.endPercent, duration),
      currentTime: playback.positionSeconds || 0,
      duration,
      title,
      hasMedia: playback.positionSeconds != null,
      positionSource: playback.source,
    };
  } finally {
    await detachSpotifyIfIdle(tabId);
  }
}

async function setSpotifyLoop(tabId, msg) {
  await attachSpotify(tabId);
  try {
    const [playback, title] = await Promise.all([getSpotifyPlayback(), getSpotifyTitle()]);
    const duration = playback.durationSeconds || Number(msg.end) || 0;
    const controller = await getController(tabId);
    const loopState = {
      enabled: !!msg.enabled,
      start: Number(msg.start) || 0,
      end: Number(msg.end) || 0,
      duration,
    };

    await storageSet({ [SPOTIFY_STORAGE_KEY]: loopState });
    const tabState = spotifyTabStates.get(tabId) || {};
    spotifyTabStates.set(tabId, { ...tabState, lastTitle: title || tabState.lastTitle });

    if (loopState.enabled) {
      controller.setLoop(
        secondsToPercent(loopState.start, duration),
        secondsToPercent(loopState.end, duration)
      );
      controller.start();
      await seekSpotifyToPercent(secondsToPercent(loopState.start, duration));
    } else {
      controller.clearLoop();
      controller.stop();
    }

    return { ok: true, hasMedia: playback.positionSeconds != null };
  } finally {
    await detachSpotifyIfIdle(tabId);
  }
}

async function getSpotifyCurrentTime(tabId) {
  await attachSpotify(tabId);
  try {
    const playback = await getSpotifyPlayback();
    return { ok: true, currentTime: playback.positionSeconds || 0 };
  } finally {
    await detachSpotifyIfIdle(tabId);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.site !== "spotify") return false;

  (async () => {
    const tabId = msg.tabId || (sender.tab && sender.tab.id);
    if (tabId == null) throw new Error("No Spotify tab id provided");

    switch (msg.action) {
      case "getStatus":
        return getSpotifyStatus(tabId);
      case "setLoop":
        return setSpotifyLoop(tabId, msg);
      case "getCurrentTime":
        return getSpotifyCurrentTime(tabId);
      default:
        return { ok: false, error: "unknown action" };
    }
  })()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
    });

  return true;
});
