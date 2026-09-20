// State: ordered list of { name, content }
const files = [];

const dropzone = document.getElementById("dropzone");
const fileList = document.getElementById("file-list");
const hint = document.getElementById("hint");
const processBtn = document.getElementById("process-btn");
const saveBtn = document.getElementById("save-btn");
const output = document.getElementById("output");
const tabButtons = document.querySelectorAll(".tab-btn");
const stripHeadersCheckbox = document.getElementById("opt-strip-headers");
const removeCommentsCheckbox = document.getElementById("opt-remove-comments");
const convertFastTravelCheckbox = document.getElementById("opt-convert-fast-travel");
const insertAfterToolChangeInput = document.getElementById("opt-insert-after-tool-change");
const warningModal = document.getElementById("warning-modal");
const warningAgreeCheckbox = document.getElementById("warning-agree-checkbox");
const warningContinueBtn = document.getElementById("warning-continue-btn");

let dragSrcIndex = null;

const STORAGE_KEY = "cnc-gcode-editor:state";
const WARNING_AGREED_KEY = "cnc-gcode-editor:warning-agreed";

function hasAgreedToWarning() {
  try {
    return localStorage.getItem(WARNING_AGREED_KEY) === "true";
  } catch (e) {
    return false;
  }
}

if (!hasAgreedToWarning()) {
  warningModal.hidden = false;
}

warningAgreeCheckbox.addEventListener("change", () => {
  warningContinueBtn.disabled = !warningAgreeCheckbox.checked;
});

warningContinueBtn.addEventListener("click", () => {
  if (!warningAgreeCheckbox.checked) return;
  try {
    localStorage.setItem(WARNING_AGREED_KEY, "true");
  } catch (e) {
    console.warn("Could not save warning agreement to localStorage:", e);
  }
  warningModal.hidden = true;
});

function saveState() {
  const state = {
    options: {
      stripDuplicateHeaders: stripHeadersCheckbox.checked,
      removeExtraComments: removeCommentsCheckbox.checked,
      convertToFastTravel: convertFastTravelCheckbox.checked,
      insertAfterToolChange: insertAfterToolChangeInput.value,
    },
    files,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save state to localStorage:", e);
  }
}

function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return;
  }
  if (!raw) return;

  let state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    return;
  }

  if (state.options) {
    stripHeadersCheckbox.checked = state.options.stripDuplicateHeaders !== false;
    removeCommentsCheckbox.checked = state.options.removeExtraComments !== false;
    convertFastTravelCheckbox.checked = state.options.convertToFastTravel === true;
    if (typeof state.options.insertAfterToolChange === "string") {
      insertAfterToolChangeInput.value = state.options.insertAfterToolChange;
    }
  }

  if (Array.isArray(state.files)) {
    files.push(...state.files);
  }
}

function activateTab(name) {
  tabButtons.forEach((b) => {
    const isMatch = b.dataset.tab === name;
    b.classList.toggle("active", isMatch);
    b.setAttribute("aria-selected", String(isMatch));
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${name}`;
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

function render() {
  fileList.innerHTML = "";
  hint.style.display = files.length === 0 ? "block" : "none";

  files.forEach((file, index) => {
    const li = document.createElement("li");
    li.draggable = true;
    li.dataset.index = index;

    const toolNumber = GcodeToolChange.detectToolNumber(file.content);
    li.title =
      toolNumber === null
        ? `${file.name} — no T-word found; this file's tool won't be changed to.`
        : `${file.name} — will invoke tool T${toolNumber}. Drag to reorder.`;

    const tag = document.createElement("span");
    tag.className = "tool-tag";
    tag.textContent = toolNumber === null ? "T?" : `T${toolNumber}`;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = file.name;

    li.appendChild(tag);
    li.appendChild(name);

    li.addEventListener("dragstart", (e) => {
      dragSrcIndex = index;
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    });

    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
    });

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetIndex = index;
      if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
      const [moved] = files.splice(dragSrcIndex, 1);
      files.splice(targetIndex, 0, moved);
      dragSrcIndex = null;
      render();
      saveState();
    });

    fileList.appendChild(li);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function addFiles(fileListObj) {
  for (const f of Array.from(fileListObj)) {
    const content = await readFileAsText(f);
    files.push({ name: f.name, content });
  }
  render();
  saveState();
}

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "dragend"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    if (e.target === dropzone) dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    addFiles(e.dataTransfer.files);
  }
});

processBtn.addEventListener("click", () => {
  if (files.length === 0) {
    output.value = "(No files loaded. Drag G-code files into the box above.)";
    return;
  }
  output.value = GcodeToolChange.generateCombinedGcode(files, {
    stripDuplicateHeaders: stripHeadersCheckbox.checked,
    removeExtraComments: removeCommentsCheckbox.checked,
    convertToFastTravel: convertFastTravelCheckbox.checked,
    insertAfterToolChange: insertAfterToolChangeInput.value,
  });
  activateTab("result");
});

saveBtn.addEventListener("click", () => {
  const content = output.value;
  if (!content.trim()) return;

  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "combined.gcode";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

stripHeadersCheckbox.addEventListener("change", saveState);
removeCommentsCheckbox.addEventListener("change", saveState);
convertFastTravelCheckbox.addEventListener("change", saveState);
insertAfterToolChangeInput.addEventListener("input", saveState);

loadState();
render();
