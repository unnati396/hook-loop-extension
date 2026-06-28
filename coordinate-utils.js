// coordinate-utils.js

function computeBoxModelCoordinates(boxModel) {
  const border = boxModel && boxModel.model && boxModel.model.border;
  if (!border || border.length < 8) {
    throw new Error("DOM.getBoxModel response is missing border coordinates");
  }

  const xs = [border[0], border[2], border[4], border[6]];
  const ys = [border[1], border[3], border[5], border[7]];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const width = right - left;
  const height = bottom - top;

  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    centerY: top + height / 2,
  };
}

globalThis.computeBoxModelCoordinates = computeBoxModelCoordinates;

if (typeof module !== "undefined") {
  module.exports = { computeBoxModelCoordinates };
}
