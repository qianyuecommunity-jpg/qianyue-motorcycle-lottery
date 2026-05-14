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

// Escape user-supplied strings for safe HTML interpolation in the PDF report.
function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Export results as PDF (uses html2pdf.js -> html2canvas + jsPDF)
function exportResults({ assignments, waitlist, eligible, registered, actual, spots, unassignedSpots, seed }) {
  const timestamp = new Date().toLocaleString("zh-TW");
  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const filename = `機車位抽籤_結果_${ts}.pdf`;

  const eligibleSet = new Set(eligible);
  const wonSpot = new Map(assignments.map((a) => [a.household, a.spot]));
  const wonRank = new Map((waitlist || []).map((w) => [w.household, w.rank]));
  const allHouseholds = [...new Set([...registered, ...actual])].sort();

  const refRows = allHouseholds.map((h) => {
    const got = wonSpot.has(h)
      ? escHtml(wonSpot.get(h))
      : wonRank.has(h)
      ? `候補 ${wonRank.get(h)}`
      : "";
    return `<tr>
      <td>${escHtml(h)}</td>
      <td class="c">${registered.includes(h) ? "✓" : ""}</td>
      <td class="c">${actual.includes(h) ? "✓" : ""}</td>
      <td class="c">${eligibleSet.has(h) ? "✓" : ""}</td>
      <td>${got}</td>
    </tr>`;
  }).join("");

  const assignmentRows = assignments.map((a, i) =>
    `<tr><td>${i + 1}</td><td>${escHtml(a.spot)}</td><td>${escHtml(a.household)}</td><td>${escHtml(a.time)}</td></tr>`
  ).join("");

  const unassignedBlock = (unassignedSpots && unassignedSpots.length) ? `
    <h3>未配對車格(合格戶數不足)</h3>
    <table>
      <thead><tr><th>機車格號</th><th>狀態</th></tr></thead>
      <tbody>
        ${unassignedSpots.map((s) => `<tr><td>${escHtml(s)}</td><td class="muted">無人認領</td></tr>`).join("")}
      </tbody>
    </table>
  ` : "";

  const waitlistBlock = (waitlist && waitlist.length) ? `
    <h3>候補名單(車格不足,依抽籤順位)</h3>
    <table>
      <thead><tr><th>順位</th><th>候補編號</th><th>戶別</th><th>抽籤時間</th></tr></thead>
      <tbody>
        ${waitlist.map((w) => `<tr><td>${w.rank}</td><td>候補 ${w.rank}</td><td>${escHtml(w.household)}</td><td>${escHtml(w.time || "")}</td></tr>`).join("")}
      </tbody>
    </table>
  ` : "";

  const container = document.createElement("div");
  container.className = "pdf-report";
  container.innerHTML = `
    <style>
      .pdf-report { font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; color: #1B2421; background: #fff; padding: 0; }
      .pdf-report h1 { font-size: 22px; margin: 0 0 6px; font-weight: 700; }
      .pdf-report h2 { font-size: 15px; margin: 22px 0 10px; border-bottom: 1.5px solid #1B2421; padding-bottom: 4px; font-weight: 700; }
      .pdf-report h3 { font-size: 12px; margin: 16px 0 6px; font-weight: 600; color: #3F4744; }
      .pdf-report .meta { font-size: 11px; color: #555; margin-bottom: 14px; font-family: "JetBrains Mono", monospace; }
      .pdf-report table { width: 100%; border-collapse: collapse; font-size: 10.5px; page-break-inside: auto; }
      .pdf-report th, .pdf-report td { border: 0.5px solid #999; padding: 4px 7px; text-align: left; vertical-align: top; }
      .pdf-report thead th { background: #EEE8DA; font-weight: 600; }
      .pdf-report td.c, .pdf-report th.c { text-align: center; }
      .pdf-report td.muted { color: #888; font-style: italic; }
      .pdf-report tr { page-break-inside: avoid; }
      .pdf-report .footer { margin-top: 24px; font-size: 9.5px; color: #837C6E; border-top: 1px solid #ddd; padding-top: 8px; }
    </style>
    <h1>機車位抽籤結果</h1>
    <div class="meta">SEED · ${escHtml(seed)} &nbsp; · &nbsp; 抽籤時間:${escHtml(timestamp)}</div>

    <h2>抽籤結果</h2>
    <table>
      <thead><tr><th>抽籤序</th><th>機車格號</th><th>中籤戶別</th><th>抽籤時間</th></tr></thead>
      <tbody>${assignmentRows}</tbody>
    </table>
    ${unassignedBlock}
    ${waitlistBlock}

    <h2>戶別對照</h2>
    <table>
      <thead><tr><th>戶別</th><th class="c">已登記</th><th class="c">實際到場</th><th class="c">合格</th><th>中籤車格 / 候補</th></tr></thead>
      <tbody>${refRows}</tbody>
    </table>

    <h2>抽籤摘要</h2>
    <table>
      <tbody>
        <tr><td>抽籤時間</td><td>${escHtml(timestamp)}</td></tr>
        <tr><td>亂數種子 (seed)</td><td>${escHtml(seed ?? "(系統隨機)")}</td></tr>
        <tr><td>可抽車格數</td><td>${spots.length}</td></tr>
        <tr><td>登記戶數</td><td>${registered.length}</td></tr>
        <tr><td>實到戶數</td><td>${actual.length}</td></tr>
        <tr><td>合格戶數(交集)</td><td>${eligible.length}</td></tr>
        <tr><td>完成配對數</td><td>${assignments.length}</td></tr>
        <tr><td>未配對車格數</td><td>${(unassignedSpots || []).length}</td></tr>
        <tr><td>候補戶數</td><td>${(waitlist || []).length}</td></tr>
      </tbody>
    </table>

    <div class="footer">本檔由瀏覽器端開源程式生成;以同一 SEED 與輸入名單,任何人皆可離線復現此結果。</div>
  `;
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "180mm";
  document.body.appendChild(container);

  return window.html2pdf().set({
    margin: [15, 15, 15, 15],
    filename,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#FFFFFF" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: "tr" },
  }).from(container).save().finally(() => {
    document.body.removeChild(container);
  });
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
