// loop-controller.js
// Reusable percentage-based Hook Loop controller.

class LoopController {
  constructor(options = {}) {
    if (typeof options.getPositionPercent !== "function") {
      throw new Error("LoopController requires getPositionPercent");
    }
    if (typeof options.seekToPercent !== "function") {
      throw new Error("LoopController requires seekToPercent");
    }

    this.getPositionPercent = options.getPositionPercent;
    this.seekToPercent = options.seekToPercent;
    this.timing = {
      pollIntervalMs: options.pollIntervalMs == null ? 500 : options.pollIntervalMs,
      seekCooldownMs: options.seekCooldownMs == null ? 1000 : options.seekCooldownMs,
      afterSeekDelayMs: options.afterSeekDelayMs == null ? 0 : options.afterSeekDelayMs,
    };
    this.setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout.bind(globalThis);
    this.clearTimeoutFn = options.clearTimeoutFn || globalThis.clearTimeout.bind(globalThis);
    this.now = options.now || Date.now;

    this.loopStartPercent = 0;
    this.loopEndPercent = 0;
    this.enabled = false;
    this.running = false;
    this.seeking = false;
    this.nextSeekAllowedAt = 0;
    this.timer = null;

    if (options.startPercent != null || options.endPercent != null) {
      this.setLoop(options.startPercent || 0, options.endPercent || 0);
    }
    if (options.enabled != null) {
      this.enabled = !!options.enabled;
    }
  }

  setLoop(startPercent, endPercent) {
    const start = this.clampPercent(startPercent);
    const end = this.clampPercent(endPercent);
    if (end <= start) {
      throw new Error("Loop end percent must be greater than loop start percent");
    }

    this.loopStartPercent = start;
    this.loopEndPercent = end;
    this.enabled = true;
    return this.getState();
  }

  clearLoop() {
    this.enabled = false;
    return this.getState();
  }

  updateTiming(timing = {}) {
    ["pollIntervalMs", "seekCooldownMs", "afterSeekDelayMs"].forEach((key) => {
      if (timing[key] != null) {
        if (!isFinite(timing[key]) || timing[key] < 0) {
          throw new Error(`${key} must be a non-negative number`);
        }
        this.timing[key] = timing[key];
      }
    });
    return this.getState();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.scheduleNextPoll(0);
  }

  stop() {
    this.running = false;
    if (this.timer != null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
  }

  async pollOnce() {
    if (!this.enabled || this.seeking || this.loopEndPercent <= this.loopStartPercent) {
      return { positionPercent: null, didSeek: false, reason: "inactive" };
    }

    const positionPercent = await this.getPositionPercent();
    if (!isFinite(positionPercent)) {
      return { positionPercent: null, didSeek: false, reason: "missing-position" };
    }

    const clampedPosition = this.clampPercent(positionPercent);
    if (clampedPosition < this.loopEndPercent) {
      return { positionPercent: clampedPosition, didSeek: false, reason: "before-loop-end" };
    }

    const currentTime = this.now();
    if (currentTime < this.nextSeekAllowedAt) {
      return { positionPercent: clampedPosition, didSeek: false, reason: "cooldown" };
    }

    this.seeking = true;
    try {
      await this.seekToPercent(this.loopStartPercent);
      this.nextSeekAllowedAt = this.now() + this.timing.seekCooldownMs;
      if (this.timing.afterSeekDelayMs > 0) {
        await this.sleep(this.timing.afterSeekDelayMs);
      }
      return { positionPercent: clampedPosition, didSeek: true, reason: "looped" };
    } finally {
      this.seeking = false;
    }
  }

  getState() {
    return {
      enabled: this.enabled,
      running: this.running,
      seeking: this.seeking,
      startPercent: this.loopStartPercent,
      endPercent: this.loopEndPercent,
      timing: { ...this.timing },
    };
  }

  scheduleNextPoll(delayMs) {
    if (!this.running) return;
    this.timer = this.setTimeoutFn(async () => {
      try {
        await this.pollOnce();
      } finally {
        this.scheduleNextPoll(this.timing.pollIntervalMs);
      }
    }, delayMs);
  }

  clampPercent(value) {
    const number = Number(value);
    if (!isFinite(number)) return 0;
    return Math.min(Math.max(number, 0), 1);
  }

  sleep(ms) {
    return new Promise((resolve) => this.setTimeoutFn(resolve, ms));
  }
}

globalThis.LoopController = LoopController;

if (typeof module !== "undefined") {
  module.exports = { LoopController };
}
