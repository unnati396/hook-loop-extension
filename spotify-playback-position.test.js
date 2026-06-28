const test = require("node:test");
const assert = require("node:assert/strict");

const { SpotifyPlaybackPositionProvider } = require("./spotify-playback-position");

test("SpotifyPlaybackPositionProvider prefers MediaSession when it has an instrumented position", async () => {
  const provider = new SpotifyPlaybackPositionProvider(async () => ({
    result: {
      value: {
        source: "mediaSession",
        positionSeconds: 30,
        durationSeconds: 120,
      },
    },
  }));

  const result = await provider.getPosition();

  assert.equal(result.source, "mediaSession");
  assert.equal(result.positionSeconds, 30);
  assert.equal(result.durationSeconds, 120);
  assert.equal(result.percent, 0.25);
});

test("SpotifyPlaybackPositionProvider falls through to Spotify internal state", async () => {
  const responses = [
    { source: "mediaSession", positionSeconds: null, durationSeconds: null },
    { source: "spotifyInternalState", positionSeconds: 45, durationSeconds: 180 },
  ];
  const provider = new SpotifyPlaybackPositionProvider(async () => ({
    result: { value: responses.shift() },
  }));

  const result = await provider.getPosition();

  assert.equal(result.source, "spotifyInternalState");
  assert.equal(result.positionSeconds, 45);
  assert.equal(result.percent, 0.25);
});

test("SpotifyPlaybackPositionProvider falls back to visible timer text", async () => {
  const responses = [
    { source: "mediaSession", positionSeconds: null, durationSeconds: null },
    { source: "spotifyInternalState", positionSeconds: null, durationSeconds: null },
    { source: "visibleTimerText", positionSeconds: 75, durationSeconds: 300 },
  ];
  const provider = new SpotifyPlaybackPositionProvider(async () => ({
    result: { value: responses.shift() },
  }));

  const result = await provider.getPosition();

  assert.equal(result.source, "visibleTimerText");
  assert.equal(result.positionSeconds, 75);
  assert.equal(result.percent, 0.25);
});

test("SpotifyPlaybackPositionProvider reports unavailable when no source has a position", async () => {
  const provider = new SpotifyPlaybackPositionProvider(async () => ({
    result: { value: { positionSeconds: null, durationSeconds: null } },
  }));

  const result = await provider.getPosition();

  assert.deepEqual(result, {
    source: "unavailable",
    positionSeconds: null,
    durationSeconds: null,
    percent: null,
  });
});
