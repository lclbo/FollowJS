#!/usr/bin/env node
"use strict";

/**
 * @file Build app icons: SVG → PNG (resvg), then .icns / .ico for electron-builder.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const root = path.join(__dirname, "..");
const build = path.join(root, "build");
const svgPath = path.join(build, "icon.svg");
const pngPath = path.join(build, "icon.png");
const icnsPath = path.join(build, "icon.icns");
const icoPath = path.join(build, "icon.ico");

fs.mkdirSync(build, { recursive: true });

const svg = fs.readFileSync(svgPath, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1024 },
  background: "#121820"
});
const pngData = resvg.render();
fs.writeFileSync(pngPath, pngData.asPng());

execFileSync("magick", [
  pngPath,
  "-define", "icon:auto-resize=256,128,64,48,32,16",
  icnsPath
]);
execFileSync("magick", [
  pngPath,
  "-define", "icon:auto-resize=256,128,64,48,32,16",
  icoPath
]);

console.log(`Generated ${pngPath}, ${icnsPath}, and ${icoPath}`);
