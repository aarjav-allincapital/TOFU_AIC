/**
 * Bypass next/server-only so CLI scripts can import jev/evaluate.
 * Loaded via: node --require ./scripts/stub-server-only.cjs --import tsx ...
 */
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return origLoad.apply(this, arguments);
};
