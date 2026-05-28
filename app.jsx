// app.jsx — root component, state machine
const { useState: useStateA } = React;

function App() {
  const [screen, setScreen] = useStateA("welcome"); // welcome | preview | drawing
  const [data, setData] = useStateA(null);
  const [fileName, setFileName] = useStateA("");
  const [error, setError] = useStateA(null);
  const [warnings, setWarnings] = useStateA([]);
  const [eligible, setEligible] = useStateA([]);
  const [seed, setSeed] = useStateA(0);

  // ── Demo data loader (for testing without uploading a file)
  const loadDemoData = () => {
    const spots = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const households = [
      "220號2樓", "220號3樓", "220號5樓", "220號7樓", "220號9樓", "220號11樓", "220號12樓", "220號13樓",
      "218號2樓", "218號3樓", "218號5樓", "218號6樓", "218號8樓", "218號10樓", "218號12樓",
    ];
    const registered = households.slice();
    const actual = ["220號2樓","220號5樓","220號7樓","220號9樓","220號11樓","220號12樓","218號2樓","218號3樓","218號5樓","218號8樓","218號10樓","218號12樓","218號13樓"];
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
    setScreen("drawing");
  };

  const handleRestart = () => {
    setData(null);
    setFileName("");
    setError(null);
    setWarnings([]);
    setEligible([]);
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
          data={data}
          eligible={eligible}
          seed={seed}
          autoPlay={true}
          onBack={() => {
            if (window.confirm("確定要從頭開始?目前抽籤紀錄將會清除,需要重新匯入名單。")) {
              handleRestart();
            }
          }}
        />
      )}
    </div>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
