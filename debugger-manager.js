// debugger-manager.js
// Standalone Chrome Debugger API wrapper. Not integrated yet.

class DebuggerManager {
  constructor() {
    this.protocolVersion = "1.3";
    this.debuggee = null;

    if (typeof chrome !== "undefined" && chrome.debugger && chrome.debugger.onDetach) {
      chrome.debugger.onDetach.addListener((source) => {
        if (this.debuggee && source && source.tabId === this.debuggee.tabId) {
          this.debuggee = null;
        }
      });
    }
  }

  async attach(tabId) {
    const resolvedTabId = tabId == null ? await this.getActiveSpotifyTabId() : tabId;
    const debuggee = { tabId: resolvedTabId };

    if (this.debuggee && this.debuggee.tabId === resolvedTabId) {
      if (await this.isAttached(resolvedTabId)) return;
      this.debuggee = null;
    }

    if (this.debuggee && this.debuggee.tabId !== resolvedTabId) {
      await this.detach(this.debuggee.tabId);
    }

    if (await this.isAttached(resolvedTabId)) {
      this.debuggee = debuggee;
      return;
    }

    await this.callChromeDebugger("attach", debuggee, this.protocolVersion);
    this.debuggee = debuggee;
  }

  async detach(tabId) {
    const resolvedTabId = tabId == null ? this.debuggee && this.debuggee.tabId : tabId;
    if (resolvedTabId == null) return;

    try {
      await this.callChromeDebugger("detach", { tabId: resolvedTabId });
    } finally {
      if (this.debuggee && this.debuggee.tabId === resolvedTabId) {
        this.debuggee = null;
      }
    }
  }

  async sendCommand(method, params = {}) {
    if (!this.debuggee) {
      await this.attach();
    }
    try {
      return await this.callChromeDebugger("sendCommand", this.debuggee, method, params);
    } catch (error) {
      if (!this.isDetachedError(error)) throw error;

      const tabId = this.debuggee && this.debuggee.tabId;
      this.debuggee = null;
      await this.attach(tabId);
      return this.callChromeDebugger("sendCommand", this.debuggee, method, params);
    }
  }

  async getActiveSpotifyTabId() {
    const tabs = await this.callChromeTabs("query", {
      active: true,
      currentWindow: true,
      url: "https://open.spotify.com/*",
    });

    if (!tabs || tabs.length === 0 || tabs[0].id == null) {
      throw new Error("No active Spotify tab found");
    }

    return tabs[0].id;
  }

  async isAttached(tabId) {
    const targets = await this.callChromeDebugger("getTargets");
    return targets.some((target) => target.tabId === tabId && target.attached);
  }

  callChromeDebugger(method, ...args) {
    return new Promise((resolve, reject) => {
      chrome.debugger[method](...args, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result);
      });
    });
  }

  callChromeTabs(method, ...args) {
    return new Promise((resolve, reject) => {
      chrome.tabs[method](...args, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result);
      });
    });
  }

  isDetachedError(error) {
    const message = error && error.message ? error.message : String(error);
    return /not attached|debuggee detached|target closed|no tab with given id/i.test(message);
  }
}

globalThis.DebuggerManager = DebuggerManager;

if (typeof module !== "undefined") {
  module.exports = { DebuggerManager };
}
