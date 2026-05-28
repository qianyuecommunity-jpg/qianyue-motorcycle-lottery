// drawing.jsx — Drawing animation + 結束時直接匯出 PDF
const { useState: useStateD, useEffect: useEffectD, useRef: useRefD, useMemo: useMemoD, useCallback: useCallbackD } = React;

function DrawingScreen({ data, eligible, seed, autoPlay, onBack }) {
  const plan = useMemoD(() => {
    const shuffledHouseholds = window.shuffleWithSeed(eligible, seed);
    const shuffledSpots = data.spots.slice();
    const pairs = [];
    const waitlist = [];
    const n = Math.min(shuffledSpots.length, shuffledHouseholds.length);
    for (let i = 0; i < n; i++) {
      pairs.push({ type: "spot", spot: shuffledSpots[i], household: shuffledHouseholds[i] });
    }
    for (let i = n; i < shuffledHouseholds.length; i++) {
      waitlist.push({ type: "waitlist", rank: i - n + 1, household: shuffledHouseholds[i] });
    }
    const picks = [...pairs, ...waitlist];
    const unassignedSpots = shuffledSpots.slice(n);
    return { picks, pairs, waitlist, unassignedSpots };
  }, [data, eligible, seed]);

  const [index, setIndex] = useStateD(0);
  const [running, setRunning] = useStateD(autoPlay);
  const [reelOffset, setReelOffset] = useStateD(0);
  const [settled, setSettled] = useStateD(false);
  const [reelItems, setReelItems] = useStateD([]);
  const [exporting, setExporting] = useStateD(false);
  const timerRef = useRefD(null);
  const logRef = useRefD(null);

  const ITEM_H = 78;
  const SPIN_DURATION = 1500; // ms — 轉輪動畫
  const PAUSE_AFTER = 750;    // ms — 每籤結果停留

  const buildReelItems = useCallbackD((finalName) => {
    const pool = eligible.length ? eligible : ["—"];
    const tickCount = 16;
    const out = [];
    for (let i = 0; i < tickCount; i++) {
      out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    out.push(finalName);
    return out;
  }, [eligible]);

  useEffectD(() => {
    if (!running) return;
    if (index >= plan.picks.length) {
      setRunning(false);
      return;
    }
    const finalName = plan.picks[index].household;
    const items = buildReelItems(finalName);
    setReelItems(items);
    setReelOffset(0);
    setSettled(false);

    const targetOffset = -(items.length - 1) * ITEM_H;
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => setReelOffset(targetOffset));
    });

    timerRef.current = setTimeout(() => {
      setSettled(true);
      setTimeout(() => {
        setIndex((i) => i + 1);
      }, PAUSE_AFTER);
    }, SPIN_DURATION);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerRef.current);
    };
  }, [running, index, plan.picks, buildReelItems]);

  // 自動把 log 捲到最新一筆
  useEffectD(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [index, settled]);

  const visibleLog = plan.picks.slice(0, index + (settled ? 1 : 0));
  const currentPick = plan.picks[index];
  const remaining = plan.picks.length - index;
  const allDone = index >= plan.picks.length;

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const timestamp = new Date().toLocaleString("zh-TW");
      const assignments = plan.pairs.map((p) => ({
        spot: p.spot,
        household: p.household,
        time: timestamp,
      }));
      const waitlist = plan.waitlist.map((w) => ({
        rank: w.rank,
        household: w.household,
        time: timestamp,
      }));
      await window.exportResults({
        assignments,
        waitlist,
        eligible,
        registered: data.registered,
        actual: data.actual,
        spots: data.spots,
        unassignedSpots: plan.unassignedSpots,
        seed,
      });
    } finally {
      setExporting(false);
    }
  };

  // 抽籤完成後自動匯出一次 PDF;失敗或想重抓時可再按右下角按鈕
  const autoExportRef = useRefD(false);
  useEffectD(() => {
    if (!allDone || autoExportRef.current) return;
    autoExportRef.current = true;
    // 延遲讓「抽籤完成」畫面先 paint,避免 html2canvas 抓到動畫中間態
    const t = setTimeout(() => { handleExport(); }, 800);
    return () => clearTimeout(t);
  }, [allDone]);

  const reelStyle = {
    transform: `translateY(${reelOffset}px)`,
    transition: reelOffset === 0
      ? "none"
      : `transform ${SPIN_DURATION}ms cubic-bezier(.18,.66,.2,1)`,
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 20 }}>
        <div className="serif" style={{ fontSize: 28 }}>{allDone ? "抽籤完成" : "抽籤進行中"}</div>
        <div className="mono" style={{ fontSize: 12, color:"var(--ink-3)" }}>
          SEED · {seed} · TARGET {plan.pairs.length} 車格{plan.waitlist.length > 0 ? ` + ${plan.waitlist.length} 候補` : ""}
        </div>
      </div>

      <div className="draw-wrap">
        <div className="draw-stage">
          <div className="draw-now">
            <div className="lbl">— 第 {Math.min(index + 1, plan.picks.length)} / 共 {plan.picks.length} 籤 —</div>
            {allDone ? (
              <div>
                <div className="slot-no" style={{ fontSize: 64, color:"var(--accent)" }}>抽籤完成</div>
                <div className="mono" style={{ fontSize: 13, color:"var(--ink-2)" }}>
                  共配對 {plan.pairs.length} 組{plan.waitlist.length > 0 ? ` · 候補 ${plan.waitlist.length} 位` : ""}
                </div>
              </div>
            ) : currentPick ? (
              <>
                <div className="slot-no">
                  {currentPick.type === "spot" ? (
                    <><span className="pre">車格</span>{currentPick.spot}</>
                  ) : (
                    <><span className="pre">候補</span>{currentPick.rank}</>
                  )}
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
          </div>
        </div>

        <div className="draw-log">
          <div className="draw-log-inner" ref={logRef}>
          {visibleLog.length === 0 ? (
            <div className="empty-note">尚未抽出任何車格…</div>
          ) : (
            visibleLog.map((p, i) => {
              const isFirstWaitlist = p.type === "waitlist" && (i === 0 || visibleLog[i-1].type === "spot");
              return (
                <React.Fragment key={i}>
                  {isFirstWaitlist && (
                    <div style={{ marginTop: 18, fontSize:11, fontFamily:"JetBrains Mono, monospace", color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", borderTop:"1px dashed var(--rule-soft)", paddingTop: 12 }}>
                      候補順位
                    </div>
                  )}
                  <div className={`log-row ${i === visibleLog.length - 1 ? "fresh" : ""}`}>
                    {p.type === "spot" ? (
                      <>
                        <span className="no">籤 {String(i + 1).padStart(2, "0")}</span>
                        <span className="spot">車格 #{p.spot}</span>
                      </>
                    ) : (
                      <>
                        <span className="no">候補</span>
                        <span className="spot">第 {String(p.rank).padStart(2, "0")} 順位</span>
                      </>
                    )}
                    <span className="arr">→</span>
                    <span className="hh">{p.household}</span>
                  </div>
                </React.Fragment>
              );
            })
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
          <button className="btn ghost" onClick={onBack}>↺ 重新開始</button>
        </div>
        <div className="right">
          {allDone && (
            <button className="btn accent" onClick={handleExport} disabled={exporting}>
              {exporting ? "正在產生 PDF…" : "匯出 PDF"} <span className="arr">↓</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

window.DrawingScreen = DrawingScreen;
