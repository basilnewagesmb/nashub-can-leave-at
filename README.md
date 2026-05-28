# NAS HUB — Can Leave At

A Chrome/Edge (Manifest V3) extension that enhances the **Work From Office** page on NAS HUB:

1. Adds a **Can Leave At** column to the WFO table.
2. Adds a **Filter Employees** button so you only see the people you care about.

Target page: `https://nashub.newagesysindia.com/time-tracker/wfo`

---

## Features

### Can Leave At column
Computed per row as:

```
Can Leave At = IN time + 8h work + Break Time
```

Example: `IN = 10:29 AM`, `Break = 45m` → `Can Leave At = 07:14 PM`.

The column is inserted right after **OUT** and updates automatically when the date changes or new rows load.

### Employee filter
- Click **Filter Employees** above the table to open a checkbox list of everyone in the table.
- Pick the people you want to see — unchecked rows hide immediately.
- Search box, **Select all**, and **Clear** are provided.
- Toggle **Filter on** off to temporarily see everyone without losing your selection.
- Your selection is saved (Chrome local storage) and re-applied on every visit and every date change.

---

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select the `nashub-can-leave-at` folder.
5. Visit the WFO page. If it was already open, reload it.

Whenever you change a file, click the **refresh icon** on the extension's card in `chrome://extensions`, then reload the page.

---

## Files

```
nashub-can-leave-at/
├── manifest.json   # MV3 manifest; matches the WFO URL
├── content.js      # injects the column + filter UI; watches DOM for re-renders
├── content.css     # styling for the column and the filter panel
├── popup.html      # small info popup shown when clicking the toolbar icon
├── icon.png        # toolbar icon
└── README.md       # this file
```

---

## How it works

- A content script runs on `https://nashub.newagesysindia.com/time-tracker/wfo*`.
- It finds the Angular Material table by its column classes (`cdk-column-in`, `cdk-column-out`, `cdk-column-break_time`, `cdk-column-employee`).
- A `MutationObserver` (scans batched per animation frame) re-applies the column and the filter whenever Angular re-renders the table — e.g., when you change the date.
- Header and rows are tracked with `data-` flags so cells aren't duplicated and late-arriving rows still get the new column.
- The filter list reads employee names from the live table, so it always reflects who is shown for the current date.
- The selection is persisted via `chrome.storage.local`.

---

## Configuration

The required work duration is currently hard-coded:

```js
// content.js
const REQUIRED_WORK_MINUTES = 8 * 60;
```

To change it (e.g., to 7.5 hours), edit that constant and reload the extension.

---

## Troubleshooting

| Symptom | Try |
|---|---|
| Column header appears but cells are empty | Reload the extension card, then hard-refresh the page (`Ctrl+F5`). |
| Column doesn't appear at all | Check the URL pattern in `manifest.json` matches the page you're on. |
| Filter doesn't remember selection | Make sure the extension has its `storage` permission enabled (it's declared in `manifest.json`). |
| Wrong "Can Leave At" time | Check the IN time format — the parser expects `HH:MM AM/PM`. Open DevTools Console for any errors. |

---

## Privacy

The extension runs only on the configured NAS HUB URL. It does not send any data anywhere — selection is stored locally in your browser via `chrome.storage.local`.
