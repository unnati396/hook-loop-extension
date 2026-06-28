// mouse-controller.js
// Reusable Chrome DevTools Protocol mouse input wrapper.

class MouseController {
  constructor(sendCommand) {
    if (typeof sendCommand !== "function") {
      throw new Error("MouseController requires a sendCommand function");
    }
    this.sendCommand = sendCommand;
  }

  async seekToPercent(percent, timelineCoordinates, options = {}) {
    const coordinates = this.normalizeTimelineCoordinates(timelineCoordinates);
    const clampedPercent = Math.min(Math.max(percent, 0), 1);
    const startPercent = options.startPercent == null ? 0.5 : options.startPercent;
    const clampedStartPercent = Math.min(Math.max(startPercent, 0), 1);
    const durationMs = options.durationMs == null ? 450 : options.durationMs;
    const startX = coordinates.left + coordinates.width * clampedStartPercent;
    const targetX = coordinates.left + coordinates.width * clampedPercent;
    const y = coordinates.centerY;

    await this.mouseMoved(startX, y);
    await this.mousePressed(startX, y);
    await this.sleep(durationMs);
    await this.mouseMoved(targetX, y);
    await this.mouseReleased(targetX, y);

    return {
      startX,
      targetX,
      y,
      percent: clampedPercent,
      durationMs,
    };
  }

  mouseMoved(x, y, params = {}) {
    return this.dispatchMouseEvent("mouseMoved", x, y, params);
  }

  mousePressed(x, y, params = {}) {
    return this.dispatchMouseEvent("mousePressed", x, y, {
      button: "left",
      buttons: 1,
      clickCount: 1,
      ...params,
    });
  }

  mouseReleased(x, y, params = {}) {
    return this.dispatchMouseEvent("mouseReleased", x, y, {
      button: "left",
      buttons: 0,
      clickCount: 1,
      ...params,
    });
  }

  dispatchMouseEvent(type, x, y, params = {}) {
    return this.sendCommand("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      ...params,
    });
  }

  normalizeTimelineCoordinates(coordinates) {
    if (!coordinates || !isFinite(coordinates.left) || !isFinite(coordinates.width)) {
      throw new Error("seekToPercent requires timeline coordinates with left and width");
    }

    const centerY =
      isFinite(coordinates.centerY)
        ? coordinates.centerY
        : isFinite(coordinates.top) && isFinite(coordinates.height)
          ? coordinates.top + coordinates.height / 2
          : null;

    if (!isFinite(centerY)) {
      throw new Error("seekToPercent requires timeline coordinates with centerY or top and height");
    }

    return {
      left: coordinates.left,
      width: coordinates.width,
      centerY,
    };
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

globalThis.MouseController = MouseController;

if (typeof module !== "undefined") {
  module.exports = { MouseController };
}
