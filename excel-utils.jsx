// excel-utils.jsx — XLSX import/export helpers
// Exposed on window for cross-script use.

const EXPECTED_COLS = {
  spot: "機車格號",
  registered: "登記參與戶別",
  actual: "實際參與戶別",
};

function findColIndex(headers, expected) {
  return headers.findIndex((h) => String(h ?? "").trim() === expected);
}

// 戶別格式檢查:XXX號X樓。社區門牌無 4 結尾(無 224、234);
// 218/220/222/226 無 1~2 樓,238 無 1 樓。
const HOUSEHOLD_RE = /^(\d+)號(\d+)樓$/;
const BUILDING_FLOORS = {
  218: [3, 13],
  220: [3, 13],
  222: [3, 13],
  226: [3, 13],
  228: [1, 13],
  230: [1, 13],
  232: [1, 13],
  236: [1, 13],
  238: [2, 13],
};
function validateHouseholdFormat(s) {
  const m = s.match(HOUSEHOLD_RE);
  if (!m) return "格式錯誤(應為「XXX號X樓」,例:228號3樓)";
  const building = Number(m[1]);
  const floor = Number(m[2]);
  const range = BUILDING_FLOORS[building];
  if (!range) {
    return `戶號 ${building} 不存在(有效戶號:${Object.keys(BUILDING_FLOORS).join("、")})`;
  }
  if (floor < range[0] || floor > range[1]) {
    return `${building}號 無 ${floor} 樓(有效樓層:${range[0]}~${range[1]})`;
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

  // 同欄位內第一次出現的位置 → 用來指出重複時的「已在第 N 列」
  const seenSpot = new Map();
  const seenReg = new Map();
  const seenAct = new Map();

  const validationErrors = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNum = r + 1; // Excel 列號從 1 起算,標題列為第 1 列
    const s = row[iSpot];
    const reg = row[iReg];
    const act = row[iAct];

    if (s !== "" && s != null) {
      const v = String(s).trim();
      if (seenSpot.has(v)) {
        validationErrors.push({ row: rowNum, col: "機車格號", value: v, reason: `重複(已出現在第 ${seenSpot.get(v)} 列)` });
      } else {
        seenSpot.set(v, rowNum);
      }
      spots.push(v);
    }

    if (reg !== "" && reg != null) {
      const v = String(reg).trim();
      const err = validateHouseholdFormat(v);
      if (err) validationErrors.push({ row: rowNum, col: "登記參與戶別", value: v, reason: err });
      if (seenReg.has(v)) {
        validationErrors.push({ row: rowNum, col: "登記參與戶別", value: v, reason: `重複(已出現在第 ${seenReg.get(v)} 列)` });
      } else {
        seenReg.set(v, rowNum);
      }
      registered.push(v);
    }

    if (act !== "" && act != null) {
      const v = String(act).trim();
      const err = validateHouseholdFormat(v);
      if (err) validationErrors.push({ row: rowNum, col: "實際參與戶別", value: v, reason: err });
      if (seenAct.has(v)) {
        validationErrors.push({ row: rowNum, col: "實際參與戶別", value: v, reason: `重複(已出現在第 ${seenAct.get(v)} 列)` });
      } else {
        seenAct.set(v, rowNum);
      }
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
      `資料檢核錯誤 ${validationErrors.length} 處,請修正後重新匯入。\n` +
      `(戶別格式:「XXX號X樓」;戶號 218~238 雙數且無 4 結尾;218/220/222/226 為 3~13 樓、238 為 2~13 樓、其餘 1~13 樓;同一欄位內不可重複)\n` +
      lines.join("\n") + more
    );
  }

  return { spots, registered, actual, warnings };
}

async function readFileAsWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

// Generate a downloadable template workbook
function buildTemplateSpots() {
  const spots = [];
  for (let n = 4; n <= 10; n++) spots.push(String(n));
  for (let n = 12; n <= 62; n++) spots.push(String(n));
  for (const a of ["1", "2", "3"]) for (const b of ["左", "中", "右"]) spots.push(a + b);
  for (const p of ["106", "108"]) for (let i = 1; i <= 4; i++) spots.push(`${p}-${i}`);
  return spots;
}

function downloadTemplate() {
  const spots = buildTemplateSpots();
  const exampleHouseholds = [
    ["220號9樓", "220號9樓"],
    ["218號3樓", "218號3樓"],
    ["218號5樓", ""],
    ["220號12樓", "220號12樓"],
    ["218號8樓", "218號8樓"],
    ["228號2樓", "228號2樓"],
    ["220號13樓", ""],
  ];

  const data = [["機車格號", "登記參與戶別", "實際參與戶別"]];
  spots.forEach((spot, i) => {
    const ex = exampleHouseholds[i] || ["", ""];
    data.push([spot, ex[0], ex[1]]);
  });

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
    ["機車格號", "本次可抽的機車位編號(例:4, 12, 1左, 106-1)。每列一格,空白略過。"],
    ["登記參與戶別", "事先完成登記的戶別代號(例:228號3樓)。"],
    ["實際參與戶別", "當天到場參與抽籤的戶別。"],
    [""],
    ["合格抽籤資格 = 登記參與戶別 ∩ 實際參與戶別(取交集)"],
    [""],
    ["三個欄位長度可不同。空白列會被忽略,前後空白會自動去除;同一欄位內不可重複,否則匯入時會回報錯誤。"],
    [""],
    ["有效戶別:戶號 218~238 雙數且無 4 結尾(無 224、234);218/220/222/226 為 3~13 樓、238 為 2~13 樓、其餘 1~13 樓。"],
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

// Export results as PDF — 直接 orchestrate html2canvas + jsPDF,容器在頁面上短暫可見
async function exportResults({ assignments, waitlist, eligible, registered, actual, spots, unassignedSpots, seed }) {
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
    return `<tr><td>${escHtml(h)}</td><td class="c">${registered.includes(h) ? "✓" : ""}</td><td class="c">${actual.includes(h) ? "✓" : ""}</td><td class="c">${eligibleSet.has(h) ? "✓" : ""}</td><td>${got}</td></tr>`;
  }).join("");

  const assignmentRows = assignments.map((a, i) =>
    `<tr><td>${i + 1}</td><td>${escHtml(a.spot)}</td><td>${escHtml(a.household)}</td><td>${escHtml(a.time)}</td></tr>`
  ).join("");

  const unassignedBlock = (unassignedSpots && unassignedSpots.length) ? `
    <h3>未配對車格(合格戶數不足)</h3>
    <table><thead><tr><th>機車格號</th><th>狀態</th></tr></thead><tbody>${unassignedSpots.map((s) => `<tr><td>${escHtml(s)}</td><td class="muted">無人認領</td></tr>`).join("")}</tbody></table>
  ` : "";

  const waitlistBlock = (waitlist && waitlist.length) ? `
    <h3>候補名單(車格不足,依抽籤順位)</h3>
    <table><thead><tr><th>順位</th><th>候補編號</th><th>戶別</th><th>抽籤時間</th></tr></thead><tbody>${waitlist.map((w) => `<tr><td>${w.rank}</td><td>候補 ${w.rank}</td><td>${escHtml(w.household)}</td><td>${escHtml(w.time || "")}</td></tr>`).join("")}</tbody></table>
  ` : "";

  const container = document.createElement("div");
  container.className = "pdf-report";
  container.innerHTML = `
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

  // 短暫可見於畫面左上角(白底浮層),確保 html2canvas 能正確抓到 layout
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "780px";
  container.style.background = "#FFFFFF";
  container.style.zIndex = "99999";
  container.style.padding = "20px";
  container.style.boxShadow = "0 4px 24px rgba(0,0,0,.3)";
  container.style.border = "1px solid #ccc";
  document.body.appendChild(container);

  try {
    // 等 layout / 字型就緒
    await new Promise((r) => setTimeout(r, 100));

    const canvas = await window.html2canvas(container, {
      scale: 2,
      backgroundColor: "#FFFFFF",
      useCORS: true,
      logging: false,
    });

    if (!canvas || !canvas.width || !canvas.height) {
      throw new Error(`html2canvas 抓到空白:${canvas && canvas.width}x${canvas && canvas.height}`);
    }

    const JsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDFClass) throw new Error("jsPDF 未載入");

    const pdf = new JsPDFClass({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const imgW = pageW - margin * 2;
    const pxPerMm = canvas.width / imgW;
    const pageContentHpx = (pageH - margin * 2) * pxPerMm;

    // 智慧斷頁:掃描 canvas 像素列,在「整列幾乎全白」處切頁,避免切到表格列中間
    const ctx = canvas.getContext("2d");
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const W = canvas.width;

    const isWhitespaceRow = (y) => {
      let nonWhite = 0;
      const limit = Math.floor(W / 4 * 0.05); // 容忍 5% 非白像素(細邊框)
      for (let x = 0; x < W; x += 4) {
        const i = (y * W + x) * 4;
        if (pixelData[i] < 245 || pixelData[i + 1] < 245 || pixelData[i + 2] < 245) {
          nonWhite++;
          if (nonWhite > limit) return false;
        }
      }
      return true;
    };

    const findBreakAbove = (target, minY) => {
      for (let y = Math.min(target, canvas.height - 1); y >= minY; y--) {
        if (isWhitespaceRow(y)) return y;
      }
      return target; // fallback:硬切
    };

    const breakpoints = [0];
    let cur = 0;
    while (cur + pageContentHpx < canvas.height) {
      const target = Math.min(cur + pageContentHpx, canvas.height);
      const minSearch = cur + Math.floor(pageContentHpx * 0.6);
      const bp = findBreakAbove(target, minSearch);
      if (bp <= cur) break;
      breakpoints.push(bp);
      cur = bp;
    }
    if (breakpoints[breakpoints.length - 1] < canvas.height) {
      breakpoints.push(canvas.height);
    }

    // 每段切出一個子 canvas,放到對應頁面
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const top = breakpoints[i];
      const bot = breakpoints[i + 1];
      const segH = bot - top;

      const segCanvas = document.createElement("canvas");
      segCanvas.width = canvas.width;
      segCanvas.height = segH;
      const segCtx = segCanvas.getContext("2d");
      segCtx.fillStyle = "#FFFFFF";
      segCtx.fillRect(0, 0, canvas.width, segH);
      segCtx.drawImage(canvas, 0, -top);

      const segDataUrl = segCanvas.toDataURL("image/jpeg", 0.95);
      const segHmm = segH / pxPerMm;

      if (i > 0) pdf.addPage();
      pdf.addImage(segDataUrl, "JPEG", margin, margin, imgW, segHmm);
    }

    pdf.save(filename);
  } catch (err) {
    console.error("PDF 匯出失敗:", err);
    throw err;
  } finally {
    if (container.parentNode) document.body.removeChild(container);
  }
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
  BUILDING_FLOORS,
  parseWorkbook,
  readFileAsWorkbook,
  downloadTemplate,
  exportResults,
  mulberry32,
  shuffleWithSeed,
});
