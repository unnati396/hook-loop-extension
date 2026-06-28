const test = require("node:test");
const assert = require("node:assert/strict");

const { MouseController } = require("./mouse-controller");

test("seekToPercent computes targetX and dispatches a trusted drag sequence", async () => {
  const calls = [];
  const mouse = new MouseController((method, params) => {
    calls.push({ method, params });
    return Promise.resolve();
  });

  const drag = await mouse.seekToPercent(
    0.75,
    { left: 100, width: 400, centerY: 30 },
    { durationMs: 0, startPercent: 0.25 }
  );

  assert.deepEqual(drag, {
    startX: 200,
    targetX: 400,
    y: 30,
    percent: 0.75,
    durationMs: 0,
  });
  assert.deepEqual(calls, [
    { method: "Input.dispatchMouseEvent", params: { type: "mouseMoved", x: 200, y: 30 } },
    {
      method: "Input.dispatchMouseEvent",
      params: { type: "mousePressed", x: 200, y: 30, button: "left", buttons: 1, clickCount: 1 },
    },
    { method: "Input.dispatchMouseEvent", params: { type: "mouseMoved", x: 400, y: 30 } },
    {
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseReleased", x: 400, y: 30, button: "left", buttons: 0, clickCount: 1 },
    },
  ]);
});

test("seekToPercent clamps percent before computing targetX", async () => {
  const calls = [];
  const mouse = new MouseController((method, params) => {
    calls.push({ method, params });
    return Promise.resolve();
  });

  const drag = await mouse.seekToPercent(2, { left: 10, width: 90, top: 20, height: 20 }, { durationMs: 0 });

  assert.equal(drag.targetX, 100);
  assert.equal(drag.y, 30);
  assert.equal(calls[2].params.x, 100);
});
