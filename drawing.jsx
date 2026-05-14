// drawing.jsx — Drawing animation + Results screens
const { useState: useStateD, useEffect: useEffectD, useRef: useRefD, useMemo: useMemoD, useCallback: useCallbackD } = React;

// ─────────────────────────────────────────────────────────────────────────────
// Drawing animation
// ─────────────────────────────────────────────────────────────────────────────
function DrawingScreen({ spots, eligible, seed, autoPlay, onDone, onBack }) {
  // Pre-compute the full assignment list (we already know who gets what — animation is theater)
  const plan = useMemoD(() => {
    const shuffledHouseholds = window.shuffleWithSeed(eligible, seed);
    const shuffledSpots = spots.slice(); // spots in given order
    const pairs = [];
    const n = Math.min(shuffledSpots.length, shuffledHouseholds.length);
    for (let i = 0; i < n; i++) {
      pairs.push({ spot: shuffledSpots[i], household: shuffledHouseholds[i] });
    }
    const unassignedSpots = shuffledSpots.slice(n);
    const notDrawn = shuffledHouseholds.slice(n);
    return { pairs, unassignedSpots, notDrawn };
  }, [spots, eligible, seed]);

  const [index, setIndex] = useStateD(0); // 0 .. plan.pairs.length
  const [running, setRunning] = useStateD(autoPlay);
  const [reelOffset, setReelOffset] = useStateD(0);
  const [settled, setSettled] = useStateD(false);
  const [reelItems, setReelItems] = useStateD([]); // names that scroll past
  const tickAudioRef = useRefD(null);
  const timerRef = useRefD(null);

  const ITEM_H = 78;
  const SPIN_DURATION = 200; // ms — 轉輪動畫
  const PAUSE_AFTER = 100;   // ms — 每籤結果停留

  const buildReelItems = useCallbackD((finalName) => {
    // ~16 ticks + final name resting at last position
    const pool = eligible.length ? eligible : ["—"];
    const tickCount = 16;
    const out = [];
    for (let i = 0; i < tickCount; i++) {
      out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    out.push(finalName);
    return out;
  }, [eligible]);

  // Trigger spin for current index
  useEffectD(() => {
    if (!running) return;
    if (index >= plan.pairs.length) {
      setRunning(false);
      return;
    }
    const finalName = plan.pairs[index].household;
    const items = buildReelItems(finalName);
    setReelItems(items);
    setReelOffset(0);
    setSettled(false);

    // Animate offset to last item
    // Use rAF to apply transition then change offset on next tick
    const targetOffset = -(items.length - 1) * ITEM_H;
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReelOffset(targetOffset));
    });

    const settleTime = SPIN_DURATION;
    timerRef.current = setTimeout(() => {
      setSettled(true);
      setTimeout(() => {
        setIndex((i) => i + 1);
      }, PAUSE_AFTER);
    }, settleTime);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerRef.current);
    };
  }, [running, index, plan.pairs, buildReelItems]);

  // Auto-finish handler
  useEffectD(() => {
    if (index >= plan.pairs.length && plan.pairs.length > 0) {
      // ready to wrap; do nothing here, user navigates via button
    }
  }, [index, plan.pairs.length]);

  const drawnLog = plan.pairs.slice(0, index + (settled && index < plan.pairs.length ? 1 : 0));
  // Only show settled entries in log
  const visibleLog = plan.pairs.slice(0, index + (settled ? 1 : 0)).slice(0, plan.pairs.length);

  const currentPair = plan.pairs[index];
  const remaining = plan.pairs.length - index;
  const allDone = index >= plan.pairs.length;

  const handleSkipAll = () => {
    clearTimeout(timerRef.current);
    setRunning(false);
    setIndex(plan.pairs.length);
    setSettled(true);
  };

  const handleStep = () => {
    if (running) return;
    setRunning(true);
  };

  const handlePause = () => {
    setRunning(false);
    clearTimeout(timerRef.current);
  };

  // Build dynamic transition style
  const reelStyle = {
    transform: `translateY(${reelOffset}px)`,
    transition: reelOffset === 0
      ? "none"
      : `transform ${SPIN_DURATION}ms cubic-bezier(.18,.66,.2,1)`,
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 20 }}>
        <div className="serif" style={{ fontSize: 28 }}>抽籤進行中</div>
        <div className="mono" style={{ fontSize: 12, color:"var(--ink-3)" }}>
          SEED · {seed} · TARGET {plan.pairs.length} 組
        </div>
      </div>

      <div className="draw-wrap">
        <div className="draw-stage">
          <div className="draw-now">
            <div className="lbl">— 第 {Math.min(index + 1, plan.pairs.length)} 籤 / 共 {plan.pairs.length} 籤 —</div>
            {allDone ? (
              <div>
                <div className="slot-no" style={{ fontSize: 64, color:"var(--accent)" }}>抽籤完成</div>
                <div className="mono" style={{ fontSize: 13, color:"var(--ink-2)" }}>
                  共配對 {plan.pairs.length} 組 · 點下方按鈕查看完整結果
                </div>
              </div>
            ) : currentPair ? (
              <>
                <div className="slot-no">
                  <span className="pre">車格</span>{currentPair.spot}
                </div>
                <div className="arrow">▼</div>
                <div className={`reel ${settled ? "settled" : ""}`}>
                  <div className="reel-fade-t"></div>
                  <div className="reel-fade-b"></div>
                  <div className="reel-track" style={reelStyle}>
                    {reelItems.map((it, i) => (
                      <div className="item" key={i}>{it}</div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="slot-no" style={{ fontSize: 48 }}>準備抽籤…</div>
            )}
          </div>

          <div className="draw-controls">
            <div className="ticker">
              {allDone ? "已完成全部抽籤" : `剩餘 ${remaining} 籤`}
            </div>
            {!allDone && !running && (
              <button className="btn accent" onClick={handleStep}>
                {index === 0 ? "開始抽籤" : "繼續"} <span className="arr">▶</span>
              </button>
            )}
            {!allDone && running && (
              <button className="btn ghost" onClick={handlePause}>暫停 ❚❚</button>
            )}
            {!allDone && (
              <button className="btn ghost" onClick={handleSkipAll}>跳過動畫 ⇥</button>
            )}
          </div>
        </div>

        <div className="draw-log">
          <div className="draw-log-inner">
          {visibleLog.length === 0 ? (
            <div className="empty-note">尚未抽出任何車格…</div>
          ) : (
            visibleLog.map((p, i) => (
              <div key={i} className={`log-row ${i === visibleLog.length - 1 ? "fresh" : ""}`}>
                <span className="no">籤 {String(i + 1).padStart(2, "0")}</span>
                <span className="spot">車格 #{p.spot}</span>
                <span className="arr">→</span>
                <span className="hh">{p.household}</span>
              </div>
            ))
          )}
          {allDone && plan.unassignedSpots.length > 0 && (
            <>
              <div style={{ marginTop: 18, fontSize:11, fontFamily:"JetBrains Mono, monospace", color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", borderTop:"1px dashed var(--rule-soft)", paddingTop: 12 }}>
                未配對車格
              </div>
              {plan.unassignedSpots.map((s, i) => (
                <div key={`u${i}`} className="log-row empty">
                  <span className="no">空</span>
                  <span className="spot">車格 #{s}</span>
                  <span className="arr">→</span>
                  <span className="hh">(無人)</span>
                </div>
              ))}
            </>
          )}
          </div>
        </div>
      </div>

      <div className="row-actions">
        <div className="left">
          <button className="btn ghost" onClick={onBack}>← 回到名單</button>
        </div>
        <div className="right">
          {allDone && (
            <button className="btn accent" onClick={() => onDone(plan)}>
              查看完整結果 <span className="arr">→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────
function ResultsScreen({ plan, data, eligible, seed, onRestart, onBack }) {
  const now = useMemoD(() => new Date(), []);
  const timestamp = now.toLocaleString("zh-TW");

  const assignments = plan.pairs.map((p) => ({
    spot: p.spot,
    household: p.household,
    time: timestamp,
  }));

  const handleExport = () => {
    window.exportResults({
      assignments,
      eligible,
      registered: data.registered,
      actual: data.actual,
      spots: data.spots,
      unassignedSpots: plan.unassignedSpots,
      notDrawn: plan.notDrawn,
      seed,
    });
  };

  const handlePrint = () => window.print();

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 18 }}>
        <div className="serif" style={{ fontSize: 28 }}>抽籤結果</div>
        <div className="mono" style={{ fontSize: 12, color:"var(--ink-3)" }}>
          SEED {seed} · {timestamp}
        </div>
      </div>

      <div className="stats">
        <div className="stat accent">
          <div className="lbl">完成配對</div>
          <div className="val">{assignments.length}<span className="unit">組</span></div>
          <div className="sub">已分配車格</div>
        </div>
        <div className="stat">
          <div className="lbl">未配對車格</div>
          <div className="val">{plan.unassignedSpots.length}<span className="unit">格</span></div>
          <div className="sub">無人認領</div>
        </div>
        <div className="stat">
          <div className="lbl">未中籤戶</div>
          <div className="val">{plan.notDrawn.length}<span className="unit">戶</span></div>
          <div className="sub">合格但車格不足</div>
        </div>
        <div className="stat">
          <div className="lbl">總合格戶</div>
          <div className="val">{eligible.length}<span className="unit">戶</span></div>
          <div className="sub">登記 ∩ 實到</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 22 }}>
        <div className="panel-h">
          <h3>車格配對清單</h3>
          <span className="count">共 {assignments.length} 組</span>
        </div>
        <div className="results-grid">
          {assignments.map((a, i) => (
            <div key={i} className="res-card">
              <div className="lbl">車格</div>
              <div className="spot">#{a.spot}</div>
              <div className="hh">{a.household}</div>
              <div className="seq">第 {String(i + 1).padStart(2, "0")} 籤</div>
            </div>
          ))}
          {plan.unassignedSpots.map((s, i) => (
            <div key={`u${i}`} className="res-card empty">
              <div className="lbl">車格</div>
              <div className="spot">#{s}</div>
              <div className="hh">無人認領</div>
              <div className="seq">未配對</div>
            </div>
          ))}
        </div>
      </div>

      {plan.notDrawn.length > 0 && (
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-h">
            <h3>合格但未中籤戶</h3>
            <span className="count">{plan.notDrawn.length} 戶</span>
          </div>
          <div className="chip-list">
            {plan.notDrawn.map((h) => <span key={h} className="chip">{h}</span>)}
          </div>
        </div>
      )}

      <div className="row-actions">
        <div className="left">
          <button className="btn ghost" onClick={onBack}>← 重新抽籤(換種子)</button>
          <button className="btn ghost" onClick={onRestart}>↺ 回到起點</button>
        </div>
        <div className="right">
          <button className="btn ghost" onClick={handlePrint}>列印 / 存 PDF</button>
          <button className="btn accent" onClick={handleExport}>
            匯出 Excel <span className="arr">↓</span>
          </button>
        </div>
      </div>
    </div>
  );
}

window.DrawingScreen = DrawingScreen;
window.ResultsScreen = ResultsScreen;
