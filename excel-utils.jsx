// excel-utils.jsx — XLSX import/export helpers
// Exposed on window for cross-script use.

const EXPECTED_COLS = {
  spot: ["機車格號", "車格號", "格號", "車位", "spot"],
  registered: ["登記參與戶別", "登記戶別", "登記", "registered"],
  actual: ["實際參與戶別", "實到戶別", "實到", "actual", "present"],
};

function normalizeHeader(s) {
  if (s == null) return "";
  return String(s).trim().toLowerCase().replace(/\s+/g, "");
}

function findColIndex(headers, candidates) {
  const norm = headers.map(normalizeHeader);
  for (const cand of candidates) {
    const c = normalizeHeader(cand);
    const i = norm.findIndex((h) => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

// 戶別格式檢查:{戶號}-{樓層}F,戶號 218~238 雙數,樓層 1~13
const HOUSEHOLD_RE = /^(\d+)-(\d+)F$/;
function validateHouseholdFormat(s) {
  const m = s.match(HOUSEHOLD_RE);
  if (!m) return "格式錯誤(應為「戶號-樓層F」,例:220-3F)";
  const building = Number(m[1]);
  const floor = Number(m[2]);
  if (building < 218 || building > 238 || building % 2 !== 0) {
    return `戶號 ${building} 不在 218~238 雙數範圍`;
  }
  if (floor < 1 || floor > 13) {
    return `樓層 ${floor} 不在 1~13 範圍`;
  }
  return null;
}

// Parse imported workbook. Returns { spots, registered, actual, warnings }
function parseWorkbook(wb) {
  const warnings = [];
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (!rows.length) {
    throw new Error("檔案是空的,請使用範本填入資料。");
  }

  const headers = rows[0].map((h) => String(h ?? "").trim());
  const iSpot = findColIndex(headers, EXPECTED_COLS.spot);
  const iReg = findColIndex(headers, EXPECTED_COLS.registered);
  const iAct = findColIndex(headers, EXPECTED_COLS.actual);

  if (iSpot < 0 || iReg < 0 || iAct < 0) {
    throw new Error(
      `欄位辨識失敗。需要欄位:「機車格號」「登記參與戶別」「實際參與戶別」。\n目前讀到的標題:${headers.join(" / ")}`
    );
  }

  const spots = [];
  const registered = [];
  const actual = [];

  const validationErrors = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const s = row[iSpot];
    const reg = row[iReg];
    const act = row[iAct];
    if (s !== "" && s != null) spots.push(String(s).trim());
    if (reg !== "" && reg != null) {
      const v = String(reg).trim();
      const err = validateHouseholdFormat(v);
      if (err) validationErrors.push({ row: r + 1, col: "登記參與戶別", value: v, reason: err });
      registered.push(v);
    }
    if (act !== "" && act != null) {
      const v = String(act).trim();
      const err = validateHouseholdFormat(v);
      if (err) validationErrors.push({ row: r + 1, col: "實際參與戶別", value: v, reason: err });
      actual.push(v);
    }
  }

  if (validationErrors.length) {
    const MAX_LIST = 20;
    const lines = validationErrors.slice(0, MAX_LIST).map(
      (e) => `· 第 ${e.row} 列「${e.col}」=「${e.value}」 — ${e.reason}`
    );
    const more = validationErrors.length > MAX_LIST
      ? `\n…還有 ${validationErrors.length - MAX_LIST} 個錯誤未列出`
      : "";
    throw new Error(
      `戶別格式錯誤 ${validationErrors.length} 處,請修正後重新匯入。\n` +
      `(正確格式:「戶號-樓層F」;戶號為 218~238 雙數,樓層為 1~13)\n` +
      lines.join("\n") + more
    );
  }

  // dedupe + warn
  const dedupe = (arr, label) => {
    const seen = new Set();
    const out = [];
    for (const v of arr) {
      if (seen.has(v)) {
        warnings.push(`${label}有重複值「${v}」,已自動去除。`);
        continue;
      }
      seen.add(v);
      out.push(v);
    }
    return out;
  };

  return {
    spots: dedupe(spots, "機車格號"),
    registered: dedupe(registered, "登記戶別"),
    actual: dedupe(actual, "實到戶別"),
    warnings,
  };
}

async function readFileAsWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

// Generate a downloadable template workbook
function downloadTemplate() {
  const data = [
    ["機車格號", "登記參與戶別", "實際參與戶別"],
    ["1", "220-9F", "220-9F"],
    ["2", "218-3F", "218-3F"],
    ["3", "218-5F", ""],
    ["4", "220-12F", "220-12F"],
    ["5", "218-8F", "218-8F"],
    ["", "220-2F", "220-2F"],
    ["", "220-13F", ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }];
  // header style won't carry without paid sheetjs; rely on column widths only
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "抽籤資料");

  // README sheet
  const readme = [
    ["欄位說明"],
    [""],
    ["欄位名稱", "說明"],
    ["機車格號", "本次可抽的機車位編號(例:1, 2, A-12)。每列一格,空白略過。"],
    ["登記參與戶別", "事先完成登記的戶別代號(例:220-9F)。"],
    ["實際參與戶別", "當天到場參與抽籤的戶別。"],
    [""],
    ["合格抽籤資格 = 登記參與戶別 ∩ 實際參與戶別(取交集)"],
    [""],
    ["三個欄位長度可不同。空白列會被忽略,重複值會自動去除。"],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(readme);
  ws2["!cols"] = [{ wch: 18 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, ws2, "欄位說明");

  XLSX.writeFile(wb, "機車位抽籤_範本.xlsx");
}

// Export results
function exportResults({ assignments, eligible, registered, actual, spots, unassignedSpots, notDrawn, seed }) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: assignments
  const main = [["抽籤序", "機車格號", "中籤戶別", "抽籤時間"]];
  assignments.forEach((a, i) => {
    main.push([i + 1, a.spot, a.household, a.time]);
  });
  if (unassignedSpots && unassignedSpots.length) {
    main.push([]);
    main.push(["未配對車格(合格戶數不足)"]);
    unassignedSpots.forEach((s) => main.push(["", s, "(無)", ""]));
  }
  const ws1 = XLSX.utils.aoa_to_sheet(main);
  ws1["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws1, "抽籤結果");

  // Sheet 2: 名單對照
  const ref = [["戶別", "已登記", "實際到場", "合格", "中籤車格"]];
  const all = new Set([...registered, ...actual]);
  const eligibleSet = new Set(eligible);
  const won = new Map(assignments.map((a) => [a.household, a.spot]));
  [...all].sort().forEach((h) => {
    ref.push([
      h,
      registered.includes(h) ? "✓" : "",
      actual.includes(h) ? "✓" : "",
      eligibleSet.has(h) ? "✓" : "",
      won.get(h) || "",
    ]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(ref);
  ws2["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, "戶別對照");

  // Sheet 3: meta
  const meta = [
    ["項目", "值"],
    ["抽籤時間", new Date().toLocaleString("zh-TW")],
    ["亂數種子(seed)", String(seed ?? "(系統隨機)")],
    ["可抽車格數", spots.length],
    ["登記戶數", registered.length],
    ["實到戶數", actual.length],
    ["合格戶數(交集)", eligible.length],
    ["完成配對數", assignments.length],
    ["未配對車格數", (unassignedSpots || []).length],
    ["合格但未中籤戶數", (notDrawn || []).length],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(meta);
  ws3["!cols"] = [{ wch: 22 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws3, "抽籤摘要");

  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  XLSX.writeFile(wb, `機車位抽籤_結果_${ts}.xlsx`);
}

// Seeded RNG (mulberry32) for reproducible shuffles
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(arr, seed) {
  const rng = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

Object.assign(window, {
  parseWorkbook,
  readFileAsWorkbook,
  downloadTemplate,
  exportResults,
  mulberry32,
  shuffleWithSeed,
});
