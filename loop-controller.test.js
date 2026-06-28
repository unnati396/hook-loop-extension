const test = require("node:test");
const assert = require("node:assert/strict");

const { LoopController } = require("./loop-controller");

test("LoopController stores loop start and end percentages", () => {
  const loop = new LoopController({
    getPositionPercent: async () => 0,
    seekToPercent: async () => {},
  });

  const state = loop.setLoop(0.2, 0.8);

  assert.equal(state.enabled, true);
  assert.equal(state.startPercent, 0.2);
  assert.equal(state.endPercent, 0.8);
});

test("LoopController does not seek before playback exceeds loop end", async () => {
  const seeks = [];
  const loop = new LoopController({
    getPositionPercent: async () => 0.5,
    seekToPercent: async (percent) => seeks.push(percent),
  });
  loop.setLoop(0.2, 0.8);

  const result = await loop.pollOnce();

  assert.equal(result.didSeek, false);
  assert.equal(result.reason, "before-loop-end");
  assert.deepEqual(seeks, []);
});

test("LoopController seeks back to loop start when playback exceeds loop end", async () => {
  const seeks = [];
  const loop = new LoopController({
    getPositionPercent: async () => 0.85,
    seekToPercent: async (percent) => seeks.push(percent),
  });
  loop.setLoop(0.25, 0.75);

  const result = await loop.pollOnce();

  assert.equal(result.didSeek, true);
  assert.equal(result.reason, "looped");
  assert.deepEqual(seeks, [0.25]);
});

test("LoopController keeps timing configurable and honors seek cooldown", async () => {
  let now = 1000;
  const seeks = [];
  const loop = new LoopController({
    getPositionPercent: async () => 0.9,
    seekToPercent: async (percent) => seeks.push(percent),
    now: () => now,
    seekCooldownMs: 5000,
    pollIntervalMs: 250,
    afterSeekDelayMs: 0,
  });
  loop.setLoop(0.1, 0.8);

  assert.equal(loop.getState().timing.pollIntervalMs, 250);
  assert.equal(loop.getState().timing.seekCooldownMs, 5000);

  const first = await loop.pollOnce();
  const second = await loop.pollOnce();
  now = 7000;
  const third = await loop.pollOnce();

  assert.equal(first.didSeek, true);
  assert.equal(second.didSeek, false);
  assert.equal(second.reason, "cooldown");
  assert.equal(third.didSeek, true);
  assert.deepEqual(seeks, [0.1, 0.1]);
});

test("LoopController supports configurable polling timers", () => {
  const delays = [];
  const cleared = [];
  const loop = new LoopController({
    getPositionPercent: async () => 0,
    seekToPercent: async () => {},
    pollIntervalMs: 123,
    setTimeoutFn: (_fn, delay) => {
      delays.push(delay);
      return delays.length;
    },
    clearTimeoutFn: (timer) => cleared.push(timer),
  });

  loop.start();
  loop.stop();

  assert.deepEqual(delays, [0]);
  assert.deepEqual(cleared, [1]);
});
