// screens.jsx — Welcome / Preview / Drawing / Results screens
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─────────────────────────────────────────────────────────────────────────────
// Header / steps
// ─────────────────────────────────────────────────────────────────────────────
function AppHeader({ step }) {
  const today = new Date();
  const stamp = today.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
  return (
    <div className="head">
      <div className="brand">
        <div className="logo">
          <img src="assets/logo-qianyue.jpg" alt="皇翔芊樾" />
        </div>
        <div className="brand-text">
          <div className="brand-name">皇翔芊樾</div>
          <div className="brand-sub">Huang Hsiang Qian Yue</div>
        </div>
      </div>
      <div className="meta">
        <span className="meta-l1">機車位 公開抽籤</span>
        EDITION · {stamp.replace(/\//g, ".")}
      </div>
    </div>
  );
}

const STEPS = [
  { id: "welcome", n: "01", lbl: "匯入資料" },
  { id: "preview", n: "02", lbl: "確認名單" },
  { id: "drawing", n: "03", lbl: "進行抽籤" },
];

function Steps({ current }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="steps">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.id}>
          <div className={`step ${i === idx ? "active" : i < idx ? "done" : ""}`}>
            <span className="n">{s.n}</span>
            <span className="lbl">{s.lbl}</span>
          </div>
          {i < STEPS.length - 1 && <span className="sep">/</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome
// ─────────────────────────────────────────────────────────────────────────────
function WelcomeScreen({ onImport, error }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const wb = await window.readFileAsWorkbook(file);
      const data = window.parseWorkbook(wb);
      onImport(data, file.name);
    } catch (e) {
      onImport(null, file.name, e.message || String(e));
    }
  };

  return (
    <div className="welcome-hero">
      <div>
        <div className="eyebrow">芊樾住戶 · 公開抽籤系統</div>
        <h1>
          機車位<br />
          <span className="accent">公開抽籤</span>。
        </h1>
        <p className="sub">
          匯入登記與實到名單,系統自動取交集為合格戶,逐格抽出機車位歸屬,結果可一鍵匯出 PDF,公開、可追溯。
        </p>
        <div className="actions">
          <button className="btn accent" onClick={() => fileRef.current?.click()}>
            匯入名單 <span className="arr">↑</span>
          </button>
          <button className="btn ghost" onClick={() => window.downloadTemplate()}>
            下載 Excel 範本 <span className="arr">↓</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        <div
          className={`dropzone ${dragOver ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
          }}
        >
          也可將 .xlsx 檔拖曳至此區域。
          <span className="mono">accepted: .xlsx · .xls · .csv</span>
        </div>

        {error && <div className="alert" style={{ marginTop: 18 }}>⚠ {error}</div>}

        <div className="hint">tip · 範本含三欄:機車格號 / 登記參與戶別 / 實際參與戶別</div>
      </div>

      <aside className="info-card">
        <div className="info-title">抽籤五步驟</div>
        <ol>
          <li><div><b>下載範本</b><span>取得標準三欄 Excel 模板。</span></div></li>
          <li><div><b>填入資料</b><span>把車格號、登記戶、實到戶填好。</span></div></li>
          <li><div><b>匯入確認</b><span>系統算出合格交集,呈現預覽。</span></div></li>
          <li><div><b>進行抽籤</b><span>逐格動畫抽出,過程透明。</span></div></li>
          <li><div><b>匯出 PDF</b><span>抽完一鍵下載,含對照、摘要、SEED。</span></div></li>
        </ol>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview
// ─────────────────────────────────────────────────────────────────────────────
// 戶別對照矩陣:欄 = 戶號、列 = 樓層(由高到低),格子狀態一眼看出參與情形
function HouseholdMatrix({ registered, actual }) {
  const buildings = Object.keys(BUILDING_FLOORS).map(Number);
  const maxFloor = Math.max(...Object.values(BUILDING_FLOORS).map(([, hi]) => hi));
  const regSet = new Set(registered);
  const actSet = new Set(actual);

  // 狀態分類:eligible = 登記∩實到、reg-only = 僅登記、act-only = 到場未登記、absent = 未參與
  const cellOf = (b, f) => {
    const [lo, hi] = BUILDING_FLOORS[b];
    if (f < lo || f > hi) return null; // 該戶不存在 → 留白
    const h = `${b}號${f}樓`;
    const reg = regSet.has(h);
    const act = actSet.has(h);
    if (reg && act) return { h, cls: "eligible", mark: "", label: "合格" };
    if (reg) return { h, cls: "reg-only", mark: "", label: "僅登記未到" };
    if (act) return { h, cls: "act-only", mark: "✕", label: "到場未登記" };
    return { h, cls: "absent", mark: "·", label: "未參與" };
  };

  const floors = [];
  for (let f = maxFloor; f >= 1; f--) floors.push(f);

  return (
    <div className="hh-matrix" style={{ gridTemplateColumns: `44px repeat(${buildings.length}, 1fr)` }}>
      <div></div>
      {buildings.map((b) => (
        <div key={b} className="hh-col-h">{b}<span>號</span></div>
      ))}
      {floors.map((f) => (
        <React.Fragment key={f}>
          <div className="hh-row-h">{f}F</div>
          {buildings.map((b) => {
            const cell = cellOf(b, f);
            if (!cell) return <div key={b} className="hh-cell void"></div>;
            return (
              <div key={b} className={`hh-cell ${cell.cls}`} title={`${cell.h} — ${cell.label}`}>
                {cell.mark}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

function PreviewScreen({ data, fileName, onBack, onStart, warnings }) {
  const [tab, setTab] = useState("households");
  const eligible = useMemo(() => {
    const actSet = new Set(data.actual);
    return data.registered.filter((h) => actSet.has(h));
  }, [data]);

  const spotsCount = data.spots.length;
  const eligibleCount = eligible.length;
  const willAssign = Math.min(spotsCount, eligibleCount);
  const unassignedSpots = Math.max(0, spotsCount - eligibleCount);
  const waitlistCount = Math.max(0, eligibleCount - spotsCount);

  return (
    <div>
      {warnings && warnings.length > 0 && (
        <div className="alert warn">
          {warnings.map((w, i) => <div key={i}>· {w}</div>)}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 18 }}>
        <div className="serif" style={{ fontSize: 28 }}>名單預覽</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>SOURCE · {fileName || "imported.xlsx"}</div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="lbl">可抽車格</div>
          <div className="val">{spotsCount}<span className="unit">格</span></div>
          <div className="sub">本次抽籤標的</div>
        </div>
        <div className="stat">
          <div className="lbl">登記戶數</div>
          <div className="val">{data.registered.length}<span className="unit">戶</span></div>
          <div className="sub">事先登記</div>
        </div>
        <div className="stat">
          <div className="lbl">實到戶數</div>
          <div className="val">{data.actual.length}<span className="unit">戶</span></div>
          <div className="sub">當天到場</div>
        </div>
        <div className="stat accent">
          <div className="lbl">合格戶數</div>
          <div className="val">{eligibleCount}<span className="unit">戶</span></div>
          <div className="sub">登記 ∩ 實到</div>
        </div>
      </div>

      <div style={{ background:"var(--paper)", border:"1px solid var(--rule)", padding:"16px 20px", marginBottom: 24, display:"flex", gap: 28, flexWrap:"wrap", alignItems:"baseline" }}>
        <div className="mono" style={{ fontSize: 12, color:"var(--ink-2)" }}>
          推算:本次將配對 <b style={{ color:"var(--accent)", fontSize: 16 }}>{willAssign}</b> 組
        </div>
        {unassignedSpots > 0 && (
          <div className="mono" style={{ fontSize: 12, color:"var(--warn, #c97a1a)" }}>
            ⚠ 將有 <b>{unassignedSpots}</b> 個車格無人認領(合格戶數不足)
          </div>
        )}
        {waitlistCount > 0 && (
          <div className="mono" style={{ fontSize: 12, color:"var(--warn, #c97a1a)" }}>
            ⚠ 將有 <b>{waitlistCount}</b> 戶抽為候補(車格不足)
          </div>
        )}
        {willAssign === 0 && (
          <div className="mono" style={{ fontSize: 12, color:"var(--accent)" }}>
            ⚠ 目前無可配對組合,請檢查資料
          </div>
        )}
      </div>

      <div className="panel">
        <div className="tabs">
          <button className={tab==="households"?"active":""} onClick={()=>setTab("households")}>
            戶別對照 · 合格 {eligibleCount}
          </button>
          <button className={tab==="spots"?"active":""} onClick={()=>setTab("spots")}>
            車格清單 · {spotsCount}
          </button>
        </div>

        {tab === "households" && (
          <div>
            {eligibleCount === 0 && <div className="empty-note">尚無合格戶。請檢查登記名單與實到名單是否有交集。</div>}
            <HouseholdMatrix registered={data.registered} actual={data.actual} />
            <div className="legend">
              <span><i className="sw" style={{ background:"var(--ink)" }}></i>合格(登記且實到) {eligibleCount}</span>
              <span><i className="sw" style={{ border:"1.5px solid var(--ink)", boxSizing:"border-box" }}></i>僅登記未到 {data.registered.length - eligibleCount}</span>
              <span><b style={{ color:"var(--warn)" }}>✕</b> 到場未登記 {data.actual.length - eligibleCount}</span>
              <span><b style={{ color:"var(--ink-3)" }}>·</b> 未參與</span>
              <span><i className="sw" style={{ background:"repeating-linear-gradient(45deg, transparent 0 3px, rgba(27,36,33,.18) 3px 6px)" }}></i>無此戶別</span>
            </div>
          </div>
        )}
        {tab === "spots" && (
          <div className="chip-list">
            {data.spots.length === 0 && <div className="empty-note">沒有車格資料。</div>}
            {data.spots.map((s) => <span key={s} className="chip">#{s}</span>)}
          </div>
        )}
      </div>

      <div className="row-actions">
        <div className="left">
          <button className="btn ghost" onClick={onBack}>← 重新匯入</button>
        </div>
        <div className="right">
          <button className="btn accent" disabled={willAssign === 0} onClick={() => onStart(eligible)}>
            開始抽籤 <span className="arr">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

window.AppHeader = AppHeader;
window.Steps = Steps;
window.WelcomeScreen = WelcomeScreen;
window.PreviewScreen = PreviewScreen;
