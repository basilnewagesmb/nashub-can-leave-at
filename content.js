// NAS HUB — Can Leave At + Employee Filter
// 1. Injects a "Can Leave At" column into the WFO table.
//    Formula: IN time + 8h work + break time.
// 2. Adds a Filter button above the table to pick which employees to show.
//    Selection is persisted via chrome.storage.local and applied on every visit.

const COL_CLASS = "cdk-column-can_leave_at";
const ROW_FLAG = "canLeaveAtRow";
const HEADER_FLAG = "canLeaveAtHeader";
const REQUIRED_WORK_MINUTES = 8 * 60;
const STORAGE_KEY = "nashub_selected_employees";

let selectedEmployees = null; // null = not loaded yet; Set<string> once loaded
let filterEnabled = true; // when true and selectedEmployees is non-empty, hide others

// ---------- Storage ----------

function loadSelection() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([STORAGE_KEY, STORAGE_KEY + "_enabled"], (res) => {
        const list = res[STORAGE_KEY];
        selectedEmployees = new Set(Array.isArray(list) ? list : []);
        filterEnabled = res[STORAGE_KEY + "_enabled"] !== false;
        resolve();
      });
    } catch {
      selectedEmployees = new Set();
      resolve();
    }
  });
}

function saveSelection() {
  try {
    chrome.storage.local.set({
      [STORAGE_KEY]: Array.from(selectedEmployees),
      [STORAGE_KEY + "_enabled"]: filterEnabled,
    });
  } catch {}
}

// ---------- Time math ----------

function parseTimeToMinutes(text) {
  const m = (text || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + mins;
}

function parseBreakToMinutes(text) {
  if (!text) return 0;
  const t = text.trim();
  const hMatch = t.match(/(\d+)\s*h/i);
  const mMatch = t.match(/(\d+)\s*m/i);
  const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
  const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
  return hours * 60 + minutes;
}

function formatMinutesAsTime(totalMinutes) {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${period}`;
}

// ---------- Column injection ----------

function ensureHeader(table) {
  if (table.dataset[HEADER_FLAG] === "1") return true;

  const headerRow = table.querySelector("thead tr");
  if (!headerRow) return false;

  if (
    !headerRow.querySelector("th.cdk-column-in") ||
    !headerRow.querySelector("th.cdk-column-out") ||
    !headerRow.querySelector("th.cdk-column-break_time")
  ) {
    return false;
  }

  const ths = headerRow.querySelectorAll("th");
  const outTh = headerRow.querySelector("th.cdk-column-out");
  const sampleTh = ths[0];

  const newTh = document.createElement("th");
  newTh.className = `${sampleTh ? sampleTh.className.replace(/cdk-column-\S+/g, "").trim() : "mat-header-cell cdk-header-cell"} ${COL_CLASS} can-leave-at-col`;
  newTh.setAttribute("role", "columnheader");
  newTh.textContent = "Can Leave At";
  outTh.insertAdjacentElement("afterend", newTh);
  table.dataset[HEADER_FLAG] = "1";
  return true;
}

function processRow(row, idxs) {
  const cells = row.querySelectorAll("td");
  if (cells.length === 0) return;
  if (cells.length <= Math.max(idxs.inIdx, idxs.outIdx, idxs.breakIdx, idxs.employeeIdx)) return;

  // Add "Can Leave At" cell if not already added.
  if (row.dataset[ROW_FLAG] !== "1") {
    const inText = cells[idxs.inIdx]?.textContent || "";
    const breakText = cells[idxs.breakIdx]?.textContent || "";
    const inMin = parseTimeToMinutes(inText);

    const sampleTd = cells[0];
    const td = document.createElement("td");
    td.className = `${sampleTd.className.replace(/cdk-column-\S+/g, "").trim()} ${COL_CLASS} can-leave-at-cell`;
    td.setAttribute("role", "cell");

    if (inMin === null) {
      td.textContent = "—";
    } else {
      const breakMin = parseBreakToMinutes(breakText);
      td.textContent = formatMinutesAsTime(inMin + REQUIRED_WORK_MINUTES + breakMin);
    }

    cells[idxs.outIdx].insertAdjacentElement("afterend", td);
    row.dataset[ROW_FLAG] = "1";
  }

  // Apply filter visibility.
  applyRowVisibility(row, cells[idxs.employeeIdx]?.textContent?.trim() || "");
}

function applyRowVisibility(row, employeeName) {
  if (!selectedEmployees) return;
  const hide =
    filterEnabled && selectedEmployees.size > 0 && !selectedEmployees.has(employeeName);
  row.style.display = hide ? "none" : "";
}

function getBodyIndexes(headerRow) {
  // Body rows do NOT include our injected column, so compute indexes against
  // the header excluding our column.
  const ths = Array.from(headerRow.querySelectorAll("th")).filter(
    (th) => !th.classList.contains("can-leave-at-col"),
  );
  let inIdx = -1, outIdx = -1, breakIdx = -1, employeeIdx = -1;
  for (let i = 0; i < ths.length; i++) {
    const c = ths[i].className;
    if (c.includes("cdk-column-in") && inIdx === -1) inIdx = i;
    if (c.includes("cdk-column-out") && outIdx === -1) outIdx = i;
    if (c.includes("cdk-column-break_time")) breakIdx = i;
    if (c.includes("cdk-column-employee")) employeeIdx = i;
  }
  return { inIdx, outIdx, breakIdx, employeeIdx };
}

function processTable(table) {
  if (!ensureHeader(table)) return;
  const headerRow = table.querySelector("thead tr");
  if (!headerRow) return;

  const idxs = getBodyIndexes(headerRow);
  if (idxs.inIdx === -1 || idxs.outIdx === -1 || idxs.breakIdx === -1 || idxs.employeeIdx === -1) return;

  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((row) => processRow(row, idxs));

  ensureFilterButton(table, idxs);
}

// ---------- Filter UI ----------

function getEmployeeNamesFromTable(table, employeeIdx) {
  const names = new Set();
  table.querySelectorAll("tbody tr").forEach((row) => {
    const cells = row.querySelectorAll("td");
    const txt = cells[employeeIdx]?.textContent?.trim();
    if (txt) names.add(txt);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function ensureFilterButton(table, idxs) {
  // Find or create a host node above the table.
  if (document.getElementById("nashub-filter-host")) {
    refreshFilterPanelIfOpen(table, idxs);
    return;
  }

  const host = document.createElement("div");
  host.id = "nashub-filter-host";
  host.className = "nashub-filter-host";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nashub-filter-btn";
  btn.textContent = "Filter Employees";
  btn.addEventListener("click", () => toggleFilterPanel(table, idxs));

  const status = document.createElement("span");
  status.className = "nashub-filter-status";
  status.id = "nashub-filter-status";
  updateStatusText(status);

  host.appendChild(btn);
  host.appendChild(status);

  // Insert above the table.
  const container = table.parentElement || table;
  container.insertBefore(host, table);
}

function updateStatusText(el) {
  if (!el) return;
  const n = selectedEmployees ? selectedEmployees.size : 0;
  if (n === 0) {
    el.textContent = "Showing: all employees";
  } else if (!filterEnabled) {
    el.textContent = `Filter off — ${n} saved`;
  } else {
    el.textContent = `Showing: ${n} selected`;
  }
}

function toggleFilterPanel(table, idxs) {
  const existing = document.getElementById("nashub-filter-panel");
  if (existing) {
    existing.remove();
    return;
  }
  openFilterPanel(table, idxs);
}

function refreshFilterPanelIfOpen(table, idxs) {
  const panel = document.getElementById("nashub-filter-panel");
  if (!panel) return;
  // Rebuild list to pick up newly loaded rows.
  const list = panel.querySelector(".nashub-filter-list");
  if (!list) return;
  const currentNames = new Set(
    Array.from(list.querySelectorAll('input[type="checkbox"]')).map((i) => i.value),
  );
  const tableNames = getEmployeeNamesFromTable(table, idxs.employeeIdx);
  const newNames = tableNames.filter((n) => !currentNames.has(n));
  if (newNames.length === 0) return;
  // Re-render fully (simpler & cheap).
  renderListInto(list, tableNames);
}

function renderListInto(listEl, names) {
  listEl.innerHTML = "";
  names.forEach((name) => {
    const label = document.createElement("label");
    label.className = "nashub-filter-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    cb.checked = selectedEmployees.has(name);
    cb.addEventListener("change", () => {
      if (cb.checked) selectedEmployees.add(name);
      else selectedEmployees.delete(name);
      saveSelection();
      applyVisibilityToAllRows();
      updateStatusText(document.getElementById("nashub-filter-status"));
    });
    const span = document.createElement("span");
    span.textContent = name;
    label.appendChild(cb);
    label.appendChild(span);
    listEl.appendChild(label);
  });
}

function openFilterPanel(table, idxs) {
  const panel = document.createElement("div");
  panel.id = "nashub-filter-panel";
  panel.className = "nashub-filter-panel";

  const header = document.createElement("div");
  header.className = "nashub-filter-header";
  header.innerHTML = `<strong>Select employees to show</strong>`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "nashub-filter-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => panel.remove());
  header.appendChild(closeBtn);

  const search = document.createElement("input");
  search.type = "text";
  search.placeholder = "Search…";
  search.className = "nashub-filter-search";

  const toolbar = document.createElement("div");
  toolbar.className = "nashub-filter-toolbar";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.textContent = "Select all";
  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.textContent = "Clear";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "nashub-filter-toggle";
  const toggleCb = document.createElement("input");
  toggleCb.type = "checkbox";
  toggleCb.checked = filterEnabled;
  toggleCb.addEventListener("change", () => {
    filterEnabled = toggleCb.checked;
    saveSelection();
    applyVisibilityToAllRows();
    updateStatusText(document.getElementById("nashub-filter-status"));
  });
  const toggleSpan = document.createElement("span");
  toggleSpan.textContent = "Filter on";
  toggleLabel.appendChild(toggleCb);
  toggleLabel.appendChild(toggleSpan);

  toolbar.appendChild(allBtn);
  toolbar.appendChild(noneBtn);
  toolbar.appendChild(toggleLabel);

  const list = document.createElement("div");
  list.className = "nashub-filter-list";

  const names = getEmployeeNamesFromTable(table, idxs.employeeIdx);
  renderListInto(list, names);

  allBtn.addEventListener("click", () => {
    names.forEach((n) => selectedEmployees.add(n));
    saveSelection();
    renderListInto(list, names);
    applyVisibilityToAllRows();
    updateStatusText(document.getElementById("nashub-filter-status"));
  });
  noneBtn.addEventListener("click", () => {
    selectedEmployees.clear();
    saveSelection();
    renderListInto(list, names);
    applyVisibilityToAllRows();
    updateStatusText(document.getElementById("nashub-filter-status"));
  });

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    Array.from(list.querySelectorAll(".nashub-filter-item")).forEach((item) => {
      const name = item.querySelector("span")?.textContent?.toLowerCase() || "";
      item.style.display = !q || name.includes(q) ? "" : "none";
    });
  });

  panel.appendChild(header);
  panel.appendChild(search);
  panel.appendChild(toolbar);
  panel.appendChild(list);

  const host = document.getElementById("nashub-filter-host");
  (host || document.body).appendChild(panel);
}

function applyVisibilityToAllRows() {
  document.querySelectorAll("table.mat-table").forEach((table) => {
    const headerRow = table.querySelector("thead tr");
    if (!headerRow) return;
    const idxs = getBodyIndexes(headerRow);
    if (idxs.employeeIdx === -1) return;
    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      const name = cells[idxs.employeeIdx]?.textContent?.trim() || "";
      applyRowVisibility(row, name);
    });
  });
}

// ---------- Scanner ----------

function scan() {
  const tables = document.querySelectorAll("table.mat-table");
  tables.forEach((table) => {
    if (
      table.querySelector("th.cdk-column-in") &&
      table.querySelector("th.cdk-column-out") &&
      table.querySelector("th.cdk-column-break_time") &&
      table.querySelector("th.cdk-column-employee")
    ) {
      processTable(table);
    }
  });
}

let scanScheduled = false;
function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    scan();
  });
}

const observer = new MutationObserver(() => scheduleScan());

async function start() {
  await loadSelection();
  scan();
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
