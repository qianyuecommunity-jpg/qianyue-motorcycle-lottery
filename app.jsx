// app.jsx — root component, state machine
const { useState: useStateA } = React;

function App() {
  const [screen, setScreen] = useStateA("welcome"); // welcome | preview | drawing | results
  const [data, setData] = useStateA(null);
  const [fileName, setFileName] = useStateA("");
  const [error, setError] = useStateA(null);
  const [warnings, setWarnings] = useStateA([]);
  const [eligible, setEligible] = useStateA([]);
  const [seed, setSeed] = useStateA(0);
  const [plan, setPlan] = useStateA(null);

  // ── Demo data loader (for testing without uploading a file)
  const loadDemoData = () => {
    const spots = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const households = [
      "220-2F", "220-3F", "220-5F", "220-7F", "220-9F", "220-11F", "220-12F", "220-13F",
      "218-2F", "218-3F", "218-5F", "218-6F", "218-8F", "218-10F", "218-12F",
    ];
    const registered = households.slice();
    const actual = ["220-2F","220-5F","220-7F","220-9F","220-11F","220-12F","218-2F","218-3F","218-5F","218-8F","218-10F","218-12F","218-13F"];
    setData({ spots, registered, actual });
    setFileName("示範資料.xlsx");
    setWarnings(["這是內建示範資料,實際使用請匯入自己的名單。"]);
    setError(null);
    setScreen("preview");
  };

  const handleImport = (newData, name, err) => {
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setData(newData);
    setFileName(name);
    setWarnings(newData.warnings || []);
    setScreen("preview");
  };

  const handleStartDrawing = (eligibleList) => {
    setEligible(eligibleList);
    // Generate a fresh seed each time
    setSeed(Math.floor(Math.random() * 1_000_000));
    setPlan(null);
    setScreen("drawing");
  };

  const handleDrawingDone = (planResult) => {
    setPlan(planResult);
    setScreen("results");
  };

  const handleRedraw = () => {
    // re-roll seed and go back to drawing
    setSeed(Math.floor(Math.random() * 1_000_000));
    setPlan(null);
    setScreen("drawing");
  };

  const handleRestart = () => {
    setData(null);
    setFileName("");
    setError(null);
    setWarnings([]);
    setEligible([]);
    setPlan(null);
    setScreen("welcome");
  };

  return (
    <div className="frame">
      <AppHeader />
      <Steps current={screen} />

      {screen === "welcome" && (
        <>
          <WelcomeScreen onImport={handleImport} error={error} />
          <div style={{ marginTop: 56, paddingTop: 22, borderTop: "1px dashed var(--rule-soft)", display:"flex", justifyContent:"space-between", alignItems:"baseline", flexWrap:"wrap", gap: 16 }}>
            <div className="mono" style={{ fontSize: 11, color:"var(--ink-3)", letterSpacing:".06em" }}>
              · 全程於瀏覽器執行,不上傳任何資料 · 可部署於 GitHub Pages 供社區公開使用
            </div>
            <button className="btn ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={loadDemoData}>
              載入示範資料
            </button>
          </div>
        </>
      )}

      {screen === "preview" && data && (
        <PreviewScreen
          data={data}
          fileName={fileName}
          warnings={warnings}
          onBack={handleRestart}
          onStart={handleStartDrawing}
        />
      )}

      {screen === "drawing" && data && (
        <DrawingScreen
          spots={data.spots}
          eligible={eligible}
          seed={seed}
          autoPlay={true}
          onDone={handleDrawingDone}
          onBack={() => setScreen("preview")}
        />
      )}

      {screen === "results" && plan && (
        <ResultsScreen
          plan={plan}
          data={data}
          eligible={eligible}
          seed={seed}
          onRestart={handleRestart}
          onBack={handleRedraw}
        />
      )}
    </div>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
