# CNC G-code Stitcher

**TL;DR:** [![Just gimme the darn app already](https://img.shields.io/badge/Just%20gimme%20the%20darn%20app%20already-2ea44f?style=for-the-badge)](https://maladon.github.io/cnc-gcode-stitcher/)

A small, dependency-free browser tool for combining multiple single-operation
G-code files (as exported by CAM software like Fusion 360) into one
continuous program, with tool-change commands inserted automatically between
them.

If you cut parts with a CAM workflow that exports one G-code file per
operation — roughing, pocketing, finishing, each with its own tool — this
tool stitches them back together into a single file your controller can run
start to finish, unattended through each tool change, instead of you having
to load and run each file by hand and manually swap tools in between.

## Why this exists

A typical CAM post-processor emits one file per toolpath/operation, each
addressed to whatever tool that operation needs (`T1`, `T2`, `T3`, ...). Each
file also carries its own full header (program name, units, plane setup) and
its own end-of-program block, because the post-processor has no idea the
file will be run alongside others.

Running these one at a time works, but it means standing at the machine to
manually load and start each file, and manually jogging in a tool change
between them, for what is conceptually a single job. This tool automates
that stitching:

- It reads the existing `T` (tool select) word already present in each file
  — it does not assign or guess tool numbers, it trusts what your
  post-processor already wrote.
- It appends `M6` to that tool-select line so the controller actually
  performs the change (rather than just registering the pending tool),
  puts an `M5` (spindle stop) on the line before it, and inserts a
  configurable block of G-code right after each tool change
  (defaulting to `G20`/`G90` — see below for why).
- It concatenates the files in whatever order you arrange them, optionally
  stripping the redundant per-file headers and descriptive comments so the
  combined file only has one header at the top and one end-of-program block
  at the bottom, instead of one per input file.
- Optionally (and experimentally), it can detect and rewrite travel moves
  that Fusion 360's Personal Use license silently downgrades from true
  rapids (`G0`) to fed moves (`G1`), restoring them to `G0` using a
  conservative, geometry-based heuristic.

## ⚠️ Safety notice

This tool has only been tested against **gsender** running on an **Altmill
4x4 MK2** with **grblHAL**. It has not been verified against other senders,
controllers, post-processors, or machines, and its output may not be correct
or safe outside that combination.

Before running any file this tool produces on real hardware:

- Read through the entire generated file yourself, paying close attention to
  every tool change, feed rate, and retract height.
- Confirm the tool numbers in the file match what is actually loaded in your
  machine's tool holders.
- If you enable "Convert to fast travel moves," manually review every move
  it reclassified as a rapid before trusting it — it's a geometric heuristic,
  not a semantic understanding of your toolpath.
- Do a dry run, air cut, or single-block step-through first, and keep a hand
  near the e-stop for the first real pass.

This tool is provided as-is, with no warranty that it produces correct or
safe G-code for your setup. Verifying every file before it touches your
machine is your responsibility. The app itself shows this same warning as a
one-time modal the first time you open it.

## How it works

1. Drag your G-code files onto the drop zone (or click it to pick files via
   a file picker). Each file should already contain the correct tool number
   for its own operation — whatever your CAM post-processor put there. This
   tool reads that tool number; it does not assign one.
2. Drag the entries in the file list to set the order they should run in.
3. Click **Process**. For each file, the existing tool-select line (e.g.
   `T2`) gets `M6` appended to it so the controller performs the change, an
   `M5` is emitted on the line before it to stop the spindle, and the
   configured "insert after tool change" commands are emitted right after
   it. The files are then stitched into a single continuous program
   with one end-of-program block at the very end, instead of one per file.
4. The result appears in the **Result** tab as editable plain text — review
   it, make any manual edits directly in the textarea if needed, then click
   **Download** to download it as a `.gcode` file.

Your file list and option settings are remembered in the browser
(`localStorage`) between visits, so you don't have to re-upload or
reconfigure every session.

## Options

### Strip duplicate headers

Post-processors write a full header at the top of every file — program
name, tool note, units/plane setup, initial retract — which is only correct
once per combined program. With this on, only the first file keeps its
header; every later file starts directly at its own operation instead of
repeating the whole setup. On by default.

### Remove extra comments

Strips descriptive, non-executable comments (tool notes, operation names,
CAM disclaimers, etc.) from each file's body, to keep the combined file
smaller and easier to read. This never removes the file-separator comments
this tool adds itself for traceability between the original source files. On
by default.

### Convert to fast travel moves (experimental)

Fusion 360's Personal Use license silently downgrades non-cutting travel
moves from a true rapid (`G0`) to a fed move (`G1`) with no new feedrate —
so retracts and repositions crawl at your last cutting feedrate instead of
moving quickly. This option tries to detect and restore those moves back to
`G0`.

It uses a conservative rule: only Z-only moves that retract upward, or X/Y
moves made immediately after such a retract, are reclassified — and only if
Z is at or above the operation's retract height. That last check keeps tab
hops (a small lift over a holding tab while still at cutting depth) as fed
moves. The retract height is detected from each operation's approach: the
first downward Z move after a `G0` is taken as the retract height, and until
one is found nothing in that operation is converted. Every plunge and every
arc is left untouched. This is a heuristic based on move geometry,
not a true understanding of your toolpath — review the converted moves
before trusting them. Off by default.

### Insert after tool change

G-code emitted immediately after every tool change, one command per line.
Defaults to:

```
G20
G90
```

(inches, absolute positioning). grblHAL always reports machine position in
millimeters during the tool-change pause, regardless of the program's
current unit mode. If that position gets fed back into a subsequent move
while the units have drifted, the resulting target can be off by a factor of
25.4 and trip a soft-limit alarm. `G20`/`G90` reasserts a known unit and
positioning mode before motion resumes. Change this if your machine uses
different units, or needs other state reasserted after a tool change.

## Running it locally

The app is a static, framework-free HTML/CSS/JS page (`src/index.html`,
`src/app.js`, `src/style.css`) plus a pure transformation module
(`src/gcode-tool-change.js`) that has no DOM dependency, so the same logic
runs both in the browser and under Node for tests.

```bash
npm start   # npx serve src — serves the app locally
npm test    # node test/run.js — runs the regression test suite
```

There's no build step; `src/` can also just be opened directly or served by
any static file server.

## Project layout

```
src/
  index.html              App shell: drop zone, file list, Result/Options/Instructions tabs
  app.js                  UI logic — drag & drop, state persistence, wiring buttons to the transform
  gcode-tool-change.js    Pure G-code transformation logic (no DOM), shared by the browser and tests
  style.css               Styling
test/
  run.js                  Regression tests for gcode-tool-change.js
test files/               Sample .nc files used for manual/regression testing
```

## License

MIT — see [`LICENSE`](LICENSE).
