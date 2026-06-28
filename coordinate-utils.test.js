const test = require("node:test");
const assert = require("node:assert/strict");

const { computeBoxModelCoordinates } = require("./coordinate-utils");

test("computeBoxModelCoordinates returns rectangle metrics from DOM.getBoxModel border points", () => {
  const coordinates = computeBoxModelCoordinates({
    model: {
      border: [10, 20, 210, 18, 214, 58, 8, 60],
    },
  });

  assert.deepEqual(coordinates, {
    left: 8,
    right: 214,
    top: 18,
    bottom: 60,
    width: 206,
    height: 42,
    centerY: 39,
  });
});

test("computeBoxModelCoordinates rejects missing border points", () => {
  assert.throws(
    () => computeBoxModelCoordinates({ model: { border: [0, 0, 10, 0] } }),
    /missing border coordinates/
  );
});
