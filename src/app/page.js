"use client";
import { useState, useRef, useEffect } from "react";
import { downloadStoryPdf } from "../lib/pdf";
import PasswordGate from "./components/PasswordGate";
import WordPopover from "./components/WordPopover";
import SetupForm from "./components/SetupForm";
import LoadingScreen from "./components/LoadingScreen";
import BookViewer from "./components/BookViewer";

const PANEL_IMAGE_CONCURRENCY = 3;

// Runs `worker` over `items` with at most `limit` in flight at once. Firing
// every panel's illustration request in full parallel competes for the same
// GPU capacity on Segmind's end, which was causing later panels to time out
// under a full 15-way burst.
async function runWithConcurrencyLimit(items, limit, worker) {
  let nextIndex = 0;
  async function runNext() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}

export default function Home() {
  const [unlocked, setUnlocked] = useState(false);
  const [panelCount, setPanelCount] = useState(6);
  const [difficulty, setDifficulty] = useState("beginner");
  const [showPinyin, setShowPinyin] = useState(true);
  const [showEnglish, setShowEnglish] = useState(true);
  const [themes, setThemes] = useState(["animals", "family"]);
  const [tone, setTone] = useState("heartwarming");
  const [mainChar, setMainChar] = useState("");
  const [additionalElements, setAdditionalElements] = useState("");
  const [phase, setPhase] = useState("setup");
  const [story, setStory] = useState(null);
  const [panels, setPanels] = useState([]);
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [popoverEntry, setPopoverEntry] = useState(null);
  const [currentPanelIdx, setCurrentPanelIdx] = useState(0);
  const [animDir, setAnimDir] = useState("none");
  const [animKey, setAnimKey] = useState(0);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const lookupCache = useRef({});
  const pdfRef = useRef(null);
  const touchStartX = useRef(null);

  function toggleTheme(t) {
    setThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function goNext() {
    if (currentPanelIdx < panels.length - 1) {
      setAnimDir("left");
      setAnimKey(k => k + 1);
      setCurrentPanelIdx(i => i + 1);
    }
  }

  function goPrev() {
    if (currentPanelIdx > 0) {
      setAnimDir("right");
      setAnimKey(k => k + 1);
      setCurrentPanelIdx(i => i - 1);
    }
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? goNext() : goPrev();
    touchStartX.current = null;
  }

  useEffect(() => {
    if (phase !== "book") return;
    function onKey(e) {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function downloadPDF() {
    setDownloadingPDF(true);
    try {
      if (!pdfRef.current) return;
      const filename = story.title_english
        ? `${story.title_english.replace(/\s+/g, "-")}.pdf`
        : "junebook.pdf";
      await downloadStoryPdf(pdfRef.current, filename);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloadingPDF(false);
    }
  }

  async function handleWordClick(char, vocabulary) {
    const found = vocabulary.find(v => v.character === char || v.character.includes(char));
    if (found) { setPopoverEntry(found); return; }
    if (lookupCache.current[char]) { setPopoverEntry(lookupCache.current[char]); return; }
    setPopoverEntry({ character: char, pinyin: "…", definition: "Looking up…" });
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ char }),
      });
      const entry = await res.json();
      lookupCache.current[char] = entry;
      setPopoverEntry(entry);
    } catch {
      setPopoverEntry({ character: char, pinyin: "—", definition: "Could not look up this character." });
    }
  }

  async function generateStory() {
    setError("");
    if (themes.length === 0) { setError("Please select at least one theme."); return; }
    setPhase("loading");
    setProgress(10);
    setLoadingMsg("Writing your story…");
    setCurrentPanelIdx(0);
    setAnimDir("none");
    setAnimKey(0);

    try {
      const storyRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelCount, difficulty, themes, tone, mainChar, additionalElements }),
      });
      const storyData = await storyRes.json();
      if (storyData.error) throw new Error(storyData.error);

      setStory(storyData);
      setProgress(40);

      const initPanels = storyData.panels.map(p => ({
        ...p,
        imageStatus: "loading",
        imageUrl: null,
      }));
      setPanels(initPanels);
      setPhase("book");
      setProgress(60);

      setLoadingMsg("Painting illustrations…");
      const total = storyData.panels.length;

      async function fetchImage(prompt, anchorUrl) {
        const imgRes = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, anchorUrl }),
        });
        const imgData = await imgRes.json();
        if (imgData.error) throw new Error(imgData.error);
        return imgData.url;
      }

      // Panel 1 establishes the character (no reference image yet)
      let anchorUrl = null;
      try {
        anchorUrl = await fetchImage(storyData.panels[0].illustration_prompt, null);
        setPanels(prev => prev.map((p, i) => i === 0 ? { ...p, imageStatus: "done", imageUrl: anchorUrl } : p));
      } catch (err) {
        setPanels(prev => prev.map((p, i) => i === 0 ? { ...p, imageStatus: "error", imageError: err.message } : p));
      }
      setProgress(70);

      // Panels 2+ via Flux IP-Adapter, using panel 1 as character reference —
      // throttled rather than fully parallel (see runWithConcurrencyLimit).
      await runWithConcurrencyLimit(storyData.panels.slice(1), PANEL_IMAGE_CONCURRENCY, async (panel, i) => {
        const idx = i + 1;
        try {
          const url = await fetchImage(panel.illustration_prompt, anchorUrl);
          setPanels(prev => prev.map((p, j) => j === idx ? { ...p, imageStatus: "done", imageUrl: url } : p));
        } catch (imgErr) {
          setPanels(prev => prev.map((p, j) => j === idx ? { ...p, imageStatus: "error", imageError: imgErr.message } : p));
        }
        setProgress(70 + Math.round((i + 1) / (total - 1) * 28));
      });

      setProgress(100);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setPhase("setup");
    }
  }

  function resetToSetup() {
    setPhase("setup");
    setStory(null);
    setPanels([]);
    setError("");
    setCurrentPanelIdx(0);
    setAnimDir("none");
  }

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="app">

      {/* ── Setup & Loading share the regular header ── */}
      {phase !== "book" && (
        <div className="header">
          <div className="header-title">Junebook</div>
          <div className="header-sub">Chinese Picture Book Generator</div>
        </div>
      )}

      {phase === "setup" && (
        <SetupForm
          error={error}
          panelCount={panelCount} setPanelCount={setPanelCount}
          difficulty={difficulty} setDifficulty={setDifficulty}
          themes={themes} toggleTheme={toggleTheme}
          tone={tone} setTone={setTone}
          mainChar={mainChar} setMainChar={setMainChar}
          additionalElements={additionalElements} setAdditionalElements={setAdditionalElements}
          showPinyin={showPinyin} setShowPinyin={setShowPinyin}
          showEnglish={showEnglish} setShowEnglish={setShowEnglish}
          onGenerate={generateStory}
        />
      )}

      {phase === "loading" && (
        <LoadingScreen loadingMsg={loadingMsg} progress={progress} />
      )}

      {phase === "book" && story && panels.length > 0 && (
        <BookViewer
          story={story}
          panels={panels}
          currentPanelIdx={currentPanelIdx}
          animKey={animKey}
          animDir={animDir}
          showPinyin={showPinyin} setShowPinyin={setShowPinyin}
          showEnglish={showEnglish} setShowEnglish={setShowEnglish}
          onWordClick={handleWordClick}
          goPrev={goPrev}
          goNext={goNext}
          downloadPDF={downloadPDF}
          downloadingPDF={downloadingPDF}
          resetToSetup={resetToSetup}
          pdfRef={pdfRef}
          handleTouchStart={handleTouchStart}
          handleTouchEnd={handleTouchEnd}
        />
      )}

      {popoverEntry && (
        <WordPopover entry={popoverEntry} onClose={() => setPopoverEntry(null)} />
      )}
    </div>
  );
}
