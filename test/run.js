// Regenerates "test combined.gcode" from the real sample files, in the
// fixed order pocket -> rough -> final, using the same logic the browser
// app runs. Run this after every change to src/gcode-tool-change.js:
//
//   node test/run.js

const fs = require("fs");
const path = require("path");
const { generateCombinedGcode } = require("../src/gcode-tool-change.js");

const GCODE_DIR = "/Volumes/maladon/gcode";

const ORDERED_FILENAMES = [
  "test pocket.nc",
  "test rough outline.nc",
  "test final cut.nc",
];

const files = ORDERED_FILENAMES.map((name) => ({
  name,
  content: fs.readFileSync(path.join(GCODE_DIR, name), "utf8"),
}));

const combined = generateCombinedGcode(files);

const outPath = path.join(GCODE_DIR, "test combined.gcode");
fs.writeFileSync(outPath, combined);

console.log(`Wrote ${outPath}`);
console.log(combined);
