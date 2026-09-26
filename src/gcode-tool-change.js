// Pure G-code transformation logic, kept free of any DOM dependency so it
// can run both in the browser (src/app.js) and under Node for regression
// testing (test/run.js) without duplicating the rules in two places.
(function (root) {
  // Splits a line into its executable code and its comment (parenthetical
  // or trailing ";"), so tool-word detection never matches inside a comment
  // like "(T3 D=0.25 CR=0 - flat end mill)".
  function splitCodeAndComment(line) {
    const semiIdx = line.indexOf(";");
    const code = semiIdx === -1 ? line : line.slice(0, semiIdx);
    const trailingComment = semiIdx === -1 ? "" : line.slice(semiIdx);

    let result = "";
    let i = 0;
    while (i < code.length) {
      if (code[i] === "(") {
        const close = code.indexOf(")", i);
        if (close === -1) {
          result += code.slice(i);
          i = code.length;
        } else {
          result += code.slice(i, close + 1);
          i = close + 1;
        }
      } else {
        let next = code.indexOf("(", i);
        if (next === -1) next = code.length;
        result += code.slice(i, next).replace(
          /\bT\d+\b(?!\s*M6\b)/gi,
          (m) => `${m} M6`
        );
        i = next;
      }
    }
    return result + trailingComment;
  }

  const DEFAULT_INSERT_AFTER_TOOL_CHANGE = ["G20", "G90"];

  // grblHAL executes the change on M6 (parks at the configured tool-change
  // position and waits for a Cycle Start). T and M6 are kept on the same
  // line — senders like gsender read the tool number off the M6 line itself
  // and show "Tnull" if T is issued on a preceding line instead. The tool
  // number itself comes from whatever T-word the CAM post already put in
  // the file, not from upload order.
  //
  // insertLines is emitted right after the tool-change line — by default
  // G20/G90, since the reported machine position during the tool-change
  // pause is always in mm, and if that gets fed back into a G-code move
  // while units drifted to G21, the resulting target is off by 25.4x — the
  // exact cause of the "target exceeds machine travel" alarm seen with
  // mixed units. It's configurable since what's needed here depends on the
  // controller/sender combination.
  //
  // An explicit M5 is emitted on the line before every tool change. Each
  // source file's own M5 lives in its end-of-program block, which is
  // stripped between files, so without this the spindle would still be
  // commanded on from the previous file when the change starts.
  function appendM6ToToolCommands(content, insertLines) {
    const toInsert =
      insertLines && insertLines.length ? insertLines : DEFAULT_INSERT_AFTER_TOOL_CHANGE;
    const result = [];
    for (const line of content.split(/\r\n|\r|\n/)) {
      const transformed = splitCodeAndComment(line);
      if (transformed !== line) {
        result.push("M5");
      }
      result.push(transformed);
      if (transformed !== line) {
        toInsert.forEach((l) => result.push(l));
      }
    }
    return result.join("\n");
  }

  function codeOnly(line) {
    const semiIdx = line.indexOf(";");
    const code = semiIdx === -1 ? line : line.slice(0, semiIdx);
    return code.replace(/\([^)]*\)/g, "").trim();
  }

  // First T-word found outside of comments, used to label each file in the
  // list with the tool it will actually invoke.
  function detectToolNumber(content) {
    for (const line of content.split(/\r\n|\r|\n/)) {
      const match = codeOnly(line).match(/\bT(\d+)\b/i);
      if (match) return match[1];
    }
    return null;
  }

  // Each file's post-processor header (program name, tool description,
  // units/plane setup, the "unrestricted rapid moves" disclaimer, initial
  // retract) is only valid once, at the top of the combined program. Every
  // file after the first should start at its operation, e.g. the comment
  // "(2D Contour2)" right before the bare tool-select line — that comment's
  // text varies per operation/tool, so it's located by finding the T-word
  // line itself and walking back to whatever comment immediately precedes it.
  function findBodyStartIndex(lines) {
    const toolLineIndex = lines.findIndex((line) => /^T\d+$/i.test(codeOnly(line)));
    if (toolLineIndex === -1) return 0;

    let i = toolLineIndex - 1;
    while (i >= 0 && lines[i].trim() === "") i--;

    if (i >= 0) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
        return i;
      }
    }
    return toolLineIndex;
  }

  function stripProgramMarkers(lines) {
    return lines.filter((line) => {
      const trimmed = line.trim().toUpperCase();
      return trimmed !== "%" && trimmed !== "M30" && trimmed !== "M2";
    });
  }

  // Each source file ends with its own copy of the machine's park/end
  // routine. That's only correct once, at the very end of the combined
  // program — in between files it would just retract and stop the spindle
  // mid-job. Strip it out per-file and add it back a single time at the end.
  const END_OF_PROGRAM_BLOCK = ["G28 G91 Z0", "G90", "G28 G91 X0 Y0", "G90", "M5", "M30"];

  function normalizeLine(line) {
    return line.trim().replace(/\s+/g, " ").toUpperCase();
  }

  function stripEndOfProgramBlock(lines) {
    const normalizedBlock = END_OF_PROGRAM_BLOCK.map(normalizeLine);
    const normalizedLines = lines.map(normalizeLine);

    for (let i = 0; i <= normalizedLines.length - normalizedBlock.length; i++) {
      const matches = normalizedBlock.every(
        (expected, j) => normalizedLines[i + j] === expected
      );
      if (matches) {
        lines.splice(i, normalizedBlock.length);
        normalizedLines.splice(i, normalizedBlock.length);
      }
    }
  }

  // Strips comment text (both "(...)" and trailing ";") from a line,
  // leaving only the executable code. Lines that are pure comments collapse
  // to "" and get dropped entirely by the caller.
  function removeCommentsFromLine(line) {
    const semiIdx = line.indexOf(";");
    const code = semiIdx === -1 ? line : line.slice(0, semiIdx);
    return code.replace(/\([^)]*\)/g, "").trim();
  }

  // Rewrites the motion word ("G0"/"G1"/etc.) on a line, leaving comments
  // and every other word untouched. If the line has no explicit motion
  // word (it's relying on the modal state from an earlier line), the new
  // word is prepended so the change is unambiguous on its own line.
  function setMotionWord(line, word) {
    const semiIdx = line.indexOf(";");
    const code = semiIdx === -1 ? line : line.slice(0, semiIdx);
    const trailingComment = semiIdx === -1 ? "" : line.slice(semiIdx);

    let result = "";
    let i = 0;
    let replaced = false;
    while (i < code.length) {
      if (code[i] === "(") {
        const close = code.indexOf(")", i);
        if (close === -1) {
          result += code.slice(i);
          i = code.length;
        } else {
          result += code.slice(i, close + 1);
          i = close + 1;
        }
      } else {
        let next = code.indexOf("(", i);
        if (next === -1) next = code.length;
        let chunk = code.slice(i, next);
        if (!replaced && /\bG[0-3]\b/i.test(chunk)) {
          chunk = chunk.replace(/\bG[0-3]\b/i, word);
          replaced = true;
        }
        result += chunk;
        i = next;
      }
    }
    if (!replaced) {
      result = `${word} ${result.trim()}`;
    }
    return result + trailingComment;
  }

  // Fusion 360's Personal Use license downgrades non-cutting travel moves
  // from G0 (true rapid) to G1 with no new feedrate, so they silently
  // inherit whatever cutting feed was last active — the exact behavior its
  // own header comment warns about. Those moves are recovered here using a
  // conservative, geometry-based rule instead of trying to match a single
  // "clearance height": a straight, single-axis G1 move is only reclassified
  // as a rapid if it's a Z-only move that INCREASES Z (retracting away from
  // the material), or an X/Y-only move made immediately after such a
  // retract (repositioning while already clear). Anything else — plunges
  // (Z decreasing), combined-axis moves, and every G2/G3 arc — is always a
  // real cut and is left untouched, since misclassifying a plunge as a
  // rapid could crash the tool into the material.
  //
  // On top of that, a move is only restored to a rapid if Z is at or above
  // the operation's retract height — the Z retract target for a Z-only
  // move, the current Z for an X/Y move. Without this, a tab hop (lift a
  // few hundredths off the floor, traverse over the tab, drop back down)
  // looks exactly like a retract-then-reposition and would rapid along the
  // cut at cutting depth. The retract height isn't written anywhere in the
  // file, so it's inferred from the approach every operation starts with:
  // a true G0 (to clearance), then a descent to retract height — a real
  // G0 on unrestricted posts, a throttled G1 under Personal Use — then the
  // feed down into the cut. The first Z-only descent after any G0 is taken
  // as the retract height. If that guess is wrong it can only be too HIGH
  // (e.g. a clearance move when the machine started above clearance),
  // which just means fewer conversions. Until one is detected — and again
  // after every G0, since the next operation may use a different height —
  // nothing is converted.
  //
  // sourceMotion tracks the modal state the ORIGINAL file is actually in
  // (used to classify each move), separately from outputMotion, the modal
  // state our REWRITTEN lines leave the controller in. They diverge the
  // moment a line is converted to G0 — so if the very next line is a real
  // G1 move relying on modal inheritance (no explicit G-word, common for
  // multi-pass toolpaths that lift, reposition, then plunge back down
  // repeatedly), it would otherwise silently run as a rapid straight into
  // the material. Whenever they diverge, the line's motion word is
  // explicitly restated to match what it actually needs to be.
  function convertToFastTravelMoves(lines) {
    let sourceMotion = null;
    let outputMotion = null;
    let currentZ = null;
    let rapid = false;
    let retractHeight = null;
    let awaitingRetract = false;

    return lines.map((line) => {
      const code = codeOnly(line);
      if (code === "") return line;

      const gWords = [...code.matchAll(/\bG([0-3])\b/gi)];
      const declaredMotion = gWords.length > 0 ? gWords[gWords.length - 1][1] : null;
      if (declaredMotion !== null) sourceMotion = declaredMotion;

      const zMatch = code.match(/\bZ(-?\d*\.?\d+)/i);
      const hasX = /\bX-?\d*\.?\d+/i.test(code);
      const hasY = /\bY-?\d*\.?\d+/i.test(code);
      const newZ = zMatch ? parseFloat(zMatch[1]) : null;
      const isZOnly = zMatch && !hasX && !hasY;

      if (sourceMotion === "0") {
        retractHeight = null;
        awaitingRetract = true;
      }
      if (awaitingRetract) {
        const straight = sourceMotion === "0" || sourceMotion === "1";
        if (straight && isZOnly && currentZ !== null && newZ < currentZ) {
          retractHeight = newZ;
          awaitingRetract = false;
        } else if (sourceMotion !== "0" && (hasX || hasY)) {
          // The approach ended (a cut started) without a recognizable
          // descent to retract height, so leave this operation unconverted.
          awaitingRetract = false;
        }
      }

      let outLine = line;
      let emittedMotion = sourceMotion;

      if (sourceMotion === "1") {
        let convert = false;
        if (isZOnly) {
          convert =
            currentZ !== null &&
            newZ > currentZ &&
            retractHeight !== null &&
            newZ >= retractHeight;
          rapid = convert;
        } else if (
          !zMatch &&
          (hasX || hasY) &&
          rapid &&
          retractHeight !== null &&
          currentZ !== null &&
          currentZ >= retractHeight
        ) {
          convert = true;
        } else {
          rapid = false;
        }

        if (convert) {
          outLine = setMotionWord(line, "G0");
          emittedMotion = "0";
        } else if (outputMotion !== "1") {
          outLine = setMotionWord(line, "G1");
          emittedMotion = "1";
        }
      } else if (sourceMotion === "0") {
        rapid = true;
        emittedMotion = "0";
      } else if (sourceMotion === "2" || sourceMotion === "3") {
        rapid = false;
        emittedMotion = sourceMotion;
      }

      outputMotion = emittedMotion;
      if (newZ !== null) currentZ = newZ;
      return outLine;
    });
  }

  // files: array of { name, content }, in the order they should run.
  // options.stripDuplicateHeaders (default true): only file 1 keeps its
  // full post-processor header; later files start at their operation.
  // options.removeExtraComments (default true): strips descriptive
  // comments (tool notes, operation names, CAM disclaimers, etc.) from
  // each file's body. This never touches the section markers this
  // function itself injects for traceability.
  // options.insertAfterToolChange (default "G20\nG90"): raw textarea
  // value, one G-code line per line, emitted right after each tool change.
  // options.convertToFastTravel (default false, experimental): reclassifies
  // Fusion Personal Use's throttled travel moves back to G0. See
  // convertToFastTravelMoves for the detection rule and its limits.
  function generateCombinedGcode(files, options = {}) {
    const stripDuplicateHeaders = options.stripDuplicateHeaders !== false;
    const removeExtraComments = options.removeExtraComments !== false;
    const convertToFastTravel = options.convertToFastTravel === true;
    const insertAfterToolChange =
      typeof options.insertAfterToolChange === "string"
        ? options.insertAfterToolChange
            .split(/\r\n|\r|\n/)
            .map((line) => line.trim())
            .filter((line) => line !== "")
        : DEFAULT_INSERT_AFTER_TOOL_CHANGE;

    const sections = [
      "(Generated for grblHAL - requires a tool change mode enabled via $341)",
    ];

    files.forEach((file, index) => {
      const originalLines = file.content.split(/\r\n|\r|\n/);
      const bodyStart =
        index === 0 || !stripDuplicateHeaders ? 0 : findBodyStartIndex(originalLines);
      const body = originalLines.slice(bodyStart).join("\n");

      const withM6 = appendM6ToToolCommands(body, insertAfterToolChange);
      const lines = withM6.split("\n");
      stripEndOfProgramBlock(lines);
      let cleaned = stripProgramMarkers(lines);

      if (convertToFastTravel) {
        cleaned = convertToFastTravelMoves(cleaned);
      }

      if (removeExtraComments) {
        cleaned = cleaned.map(removeCommentsFromLine).filter((line) => line !== "");
      }

      const toolNumber = detectToolNumber(file.content);

      sections.push(
        `(===== File ${index + 1}: ${file.name} — Tool T${toolNumber ?? "?"} =====)`
      );
      sections.push(cleaned.join("\n"));
    });

    sections.push(END_OF_PROGRAM_BLOCK.join("\n"));
    return sections.join("\n") + "\n";
  }

  function stripExtension(name) {
    const idx = name.lastIndexOf(".");
    return idx > 0 ? name.slice(0, idx) : name;
  }

  // Longest common prefix of the given strings, backed off to the nearest
  // " "/"-"/"_" boundary so it never splits a shared word or number in half
  // (e.g. "test1"/"test2" or "testing"/"tester" share no whole token, so
  // they yield "" rather than the misleading "test").
  function commonPrefix(strings) {
    if (strings.length === 0) return "";
    if (strings.length === 1) return strings[0];
    let prefix = strings[0];
    for (const s of strings.slice(1)) {
      let i = 0;
      while (i < prefix.length && i < s.length && prefix[i] === s[i]) i++;
      prefix = prefix.slice(0, i);
      if (prefix === "") break;
    }
    if (/[^\s\-_]$/.test(prefix)) {
      const sepIdx = Math.max(
        prefix.lastIndexOf(" "),
        prefix.lastIndexOf("-"),
        prefix.lastIndexOf("_")
      );
      prefix = sepIdx === -1 ? "" : prefix.slice(0, sepIdx);
    }
    return prefix.replace(/[\s\-_]+$/, "");
  }

  // Default download filename: the input files' shared name prefix (if
  // any), suffixed with "combined" — e.g. "test pocket.nc" + "test rough
  // outline.nc" + "test final cut.nc" => "test combined.gcode".
  function computeCombinedFilename(files) {
    const names = (files || [])
      .map((f) => f.name)
      .filter(Boolean)
      .map(stripExtension);
    if (names.length === 0) return "combined.gcode";
    const prefix = commonPrefix(names);
    return `${prefix ? `${prefix} combined` : "combined"}.gcode`;
  }

  const api = { generateCombinedGcode, detectToolNumber, computeCombinedFilename };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.GcodeToolChange = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
