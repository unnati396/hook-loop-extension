// popup.js

const SAVED_LOOPS_KEY = "hookLoopSavedLoops";

const noSiteEl = document.getElementById("no-site");
const needsRefreshEl = document.getElementById("needs-refresh");
const mainUiEl = document.getElementById("main-ui");
const siteNameEl = document.getElementById("site-name");
const trackTitleEl = document.getElementById("track-title");
const timeDisplayEl = document.getElementById("time-display");
const progressFillEl = document.getElementById("progress-fill");
const loopRangeEl = document.getElementById("loop-range");
const savedLoopStatusEl = document.getElementById("saved-loop-status");
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const startNowBtn = document.getElementById("start-now-btn");
const endNowBtn = document.getElementById("end-now-btn");
const toggleBtn = document.getElementById("toggle-btn");
const errorMsg = document.getElementById("error-msg");

let activeTabId = null;
let pollHandle = null;
let activeSite = null;
let lastTrackTitle = null;
let lastTrackKey = null;
let latestStatus = null;
let savedLoops = {};

function showOnly(el) {
  [noSiteEl, needsRefreshEl, mainUiEl].forEach((e) => e.classList.add("hidden"));
  el.classList.remove("hidden");
}

function detectSite(url) {
  if (!url) return null;
  if (url.startsWith("https://music.youtube.com/")) return "ytmusic";
  if (url.startsWith("https://open.spotify.com/")) return "spotify";
  return null;
}

function formatTime(totalSeconds) {
  if (!isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const roundedSeconds = Math.round(totalSeconds);
  const s = roundedSeconds % 60;
  const m = Math.floor(roundedSeconds / 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Accepts "1:23", "1:02:03", or plain seconds like "83"
function parseTime(str) {
  if (str == null) return NaN;
  const trimmed = String(str).trim();
  if (trimmed === "") return NaN;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || isNaN(Number(p)))) return NaN;
  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + Number(part);
  }
  return seconds;
}

function sendToContentScript(action, extra = {}) {
  return new Promise((resolve) => {
    if (activeTabId == null) return resolve(null);
    chrome.tabs.sendMessage(activeTabId, { action, ...extra }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null); // content script not present (needs refresh)
      } else {
        resolve(response);
      }
    });
  });
}

function sendToPage(action, extra = {}) {
  if (activeSite === "spotify") {
    return new Promise((resolve) => {
      if (activeTabId == null) return resolve(null);
      chrome.runtime.sendMessage({ site: "spotify", tabId: activeTabId, action, ...extra }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  return sendToContentScript(action, extra);
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

function setError(msg) {
  if (msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove("hidden");
  } else {
    errorMsg.classList.add("hidden");
  }
}

function setToggleVisual(enabled) {
  toggleBtn.textContent = enabled ? "Stop Looping" : "Start Looping";
  toggleBtn.classList.toggle("active", enabled);
}

function clearLoopInputs() {
  startInput.value = "";
  endInput.value = "";
  delete startInput.dataset.dirty;
  delete endInput.dataset.dirty;
}

function getLoopKey(status = latestStatus) {
  if (!activeSite || !status) return null;
  const trackKey = status.trackKey || status.title;
  if (!trackKey) return null;
  return `${activeSite}:${trackKey}`;
}

function getSavedLoop(status = latestStatus) {
  const key = getLoopKey(status);
  return key ? savedLoops[key] : null;
}

function setSavedLoopStatus(loop) {
  if (loop) {
    savedLoopStatusEl.textContent = "Saved loop";
    savedLoopStatusEl.classList.remove("hidden");
  } else {
    savedLoopStatusEl.classList.add("hidden");
  }
}

function applyLoopToInputs(loop) {
  if (!loop) return;
  startInput.value = formatTime(loop.start);
  endInput.value = formatTime(loop.end);
  delete startInput.dataset.dirty;
  delete endInput.dataset.dirty;
}

async function saveLoopForTrack(status, start, end) {
  const key = getLoopKey(status);
  if (!key) return;

  savedLoops = {
    ...savedLoops,
    [key]: {
      site: activeSite,
      title: status.title || "",
      trackKey: status.trackKey || status.title || "",
      start,
      end,
      savedAt: Date.now(),
    },
  };
  await storageSet({ [SAVED_LOOPS_KEY]: savedLoops });
  setSavedLoopStatus(savedLoops[key]);
}

function clampPercent(value) {
  if (!isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function getInputLoop() {
  const start = parseTime(startInput.value);
  const end = parseTime(endInput.value);
  if (isNaN(start) || isNaN(end) || end <= start) return null;
  return { start, end };
}

function updateProgress(status) {
  if (!status || !isFinite(status.duration) || status.duration <= 0) {
    progressFillEl.style.width = "0%";
    loopRangeEl.classList.add("hidden");
    return;
  }

  const currentPercent = clampPercent((Number(status.currentTime) || 0) / status.duration);
  progressFillEl.style.width = `${currentPercent * 100}%`;

  const inputLoop = getInputLoop();
  const savedLoop = getSavedLoop(status);
  const statusStart = Number(status.start) || 0;
  const statusEnd = Number(status.end) || 0;
  const loop =
    inputLoop ||
    (statusEnd > statusStart
      ? { start: statusStart, end: statusEnd }
      : savedLoop);

  if (!loop || loop.end <= loop.start) {
    loopRangeEl.classList.add("hidden");
    return;
  }

  const startPercent = clampPercent(loop.start / status.duration);
  const endPercent = clampPercent(loop.end / status.duration);
  loopRangeEl.style.left = `${startPercent * 100}%`;
  loopRangeEl.style.width = `${Math.max(0, endPercent - startPercent) * 100}%`;
  loopRangeEl.classList.remove("hidden");
}

function updateInputsFromStatus(status, trackChanged) {
  const savedLoop = getSavedLoop(status);
  setSavedLoopStatus(savedLoop);

  if (trackChanged && savedLoop) {
    applyLoopToInputs(savedLoop);
    return;
  }

  if (!trackChanged && !startInput.dataset.dirty && status.start) {
    startInput.value = formatTime(status.start);
  } else if (!startInput.dataset.dirty && !status.start && savedLoop) {
    startInput.value = formatTime(savedLoop.start);
  } else if (!startInput.dataset.dirty && !status.start) {
    startInput.value = "";
  }

  if (!trackChanged && !endInput.dataset.dirty && status.end) {
    endInput.value = formatTime(status.end);
  } else if (!endInput.dataset.dirty && !status.end && savedLoop) {
    endInput.value = formatTime(savedLoop.end);
  } else if (!endInput.dataset.dirty && !status.end) {
    endInput.value = "";
  }
}

async function refreshStatus() {
  const status = await sendToPage("getStatus");
  if (!status || !status.ok) return;
  latestStatus = status;

  const title = status.title || "—";
  const trackKey = status.trackKey || title;
  const trackChanged =
    (lastTrackKey != null && trackKey !== lastTrackKey) ||
    (lastTrackTitle != null && title !== lastTrackTitle);
  if (trackChanged) {
    clearLoopInputs();
  }
  lastTrackTitle = title;
  lastTrackKey = trackKey;

  trackTitleEl.textContent = title;
  timeDisplayEl.textContent = `${formatTime(status.currentTime)} / ${formatTime(status.duration)}`;
  setToggleVisual(status.enabled);
  updateInputsFromStatus(status, trackChanged);
  updateProgress(status);
}

async function handleToggle() {
  setError(null);
  const status = await sendToPage("getStatus");
  const currentlyEnabled = status && status.enabled;

  if (currentlyEnabled) {
    await sendToPage("setLoop", { enabled: false, start: status.start, end: status.end });
    setToggleVisual(false);
    return;
  }

  const start = parseTime(startInput.value);
  const end = parseTime(endInput.value);

  if (isNaN(start) || isNaN(end)) {
    setError("Enter valid times, e.g. 1:23");
    return;
  }
  if (end <= start) {
    setError("End time must be after start time");
    return;
  }

  const result = await sendToPage("setLoop", { enabled: true, start, end });
  if (!result || !result.ok) {
    setError(result && result.error ? result.error : "Couldn't reach the page. Try refreshing the tab.");
    return;
  }
  await saveLoopForTrack(status, start, end);
  setToggleVisual(true);
  if (latestStatus) {
    latestStatus = { ...latestStatus, enabled: true, start, end };
    updateProgress(latestStatus);
  }
}

async function useCurrentTime(targetInput) {
  const res = await sendToPage("getCurrentTime");
  if (res && res.ok) {
    targetInput.value = formatTime(res.currentTime);
    targetInput.dataset.dirty = "1";
    if (latestStatus) updateProgress(latestStatus);
  }
}

function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const site = detectSite(tab && tab.url);

    if (!site) {
      showOnly(noSiteEl);
      return;
    }

    activeTabId = tab.id;
    activeSite = site;
    savedLoops = (await storageGet(SAVED_LOOPS_KEY)) || {};
    siteNameEl.textContent = site === "ytmusic" ? "YouTube Music" : "Spotify";
    siteNameEl.closest(".site-badge").classList.remove("hidden");

    const status = await sendToPage("getStatus");
    if (!status) {
      showOnly(needsRefreshEl);
      return;
    }

    showOnly(mainUiEl);
    latestStatus = status;
    lastTrackTitle = status.title || "—";
    lastTrackKey = status.trackKey || lastTrackTitle;

    updateInputsFromStatus(status, false);
    updateProgress(status);
    setToggleVisual(status.enabled);

    pollHandle = setInterval(refreshStatus, 1000);
  });
}

[startInput, endInput].forEach((input) => {
  input.addEventListener("input", () => {
    input.dataset.dirty = "1";
    if (latestStatus) updateProgress(latestStatus);
  });
});

startNowBtn.addEventListener("click", () => useCurrentTime(startInput));
endNowBtn.addEventListener("click", () => useCurrentTime(endInput));
toggleBtn.addEventListener("click", handleToggle);

window.addEventListener("unload", () => {
  if (pollHandle) clearInterval(pollHandle);
});

init();
