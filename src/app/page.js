"use client";
import { useState, useRef, useEffect } from "react";

const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || "June";
const PANEL_EMOJIS = ["🌸","🐼","🏮","🌙","🐉","🦋","🌈","🍵","🌺","🦊","🌿","🐠","🍁","🦁","🌻","🎋"];

// ─── Password Gate ────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function tryUnlock() {
    if (input.trim() === APP_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setInput("");
    }
  }

  return (
    <div className="gate-overlay">
      <style>{`@keyframes shakeX { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }`}</style>
      <div className="gate-card" style={shake ? { animation: "shakeX 0.4s ease" } : {}}>
        <div className="gate-icon">🏮</div>
        <div className="gate-title">Junebook</div>
        <div className="gate-sub">Chinese Picture Book Generator</div>
        <input
          className="gate-input"
          type="password"
          placeholder="Enter passphrase"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false); }}
          onKeyDown={e => e.key === "Enter" && tryUnlock()}
          autoFocus
        />
        <button className="gate-btn" onClick={tryUnlock}>Enter 进入</button>
        {error && <div className="gate-error">Incorrect passphrase — try again</div>}
        <div className="gate-hint">Ask for the password 😊</div>
      </div>
    </div>
  );
}

// ─── Build per-character pinyin from flat sentence pinyin ─────────────────────
function buildCharacterPinyin(chineseText, flatPinyin) {
  if (!flatPinyin || !chineseText) return [];
  const syllables = flatPinyin.trim().split(/\s+/);
  const chars = Array.from(chineseText).filter(ch => !/[\s，。！？、：；""''【】（）a-zA-Z0-9]/u.test(ch));
  return chars.map((char, i) => ({ char, pinyin: syllables[i] || "" }));
}

// ─── Word Popover ─────────────────────────────────────────────────────────────
function WordPopover({ entry, onClose }) {
  if (!entry) return null;
  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover-card" onClick={e => e.stopPropagation()}>
        <div className="popover-char">{entry.character}</div>
        <div className="popover-pinyin">{entry.pinyin}</div>
        <div className="popover-def">{entry.definition}</div>
        {entry.example_chinese && (
          <>
            <div className="popover-example-label">Example</div>
            <div className="popover-example-cn">{entry.example_chinese}</div>
            <div className="popover-example-en">{entry.example_english}</div>
          </>
        )}
        <button className="popover-close" onClick={onClose}>Close ✕</button>
      </div>
    </div>
  );
}

// ─── Clickable Chinese Text ───────────────────────────────────────────────────
function ClickableText({ text, characterPinyin, showPinyin, vocabulary, onWordClick }) {
  const pinyinMap = {};
  if (characterPinyin) {
    characterPinyin.forEach(({ char, pinyin }) => { if (pinyin) pinyinMap[char] = pinyin; });
  }
  const chars = Array.from(text);
  return (
    <span>
      {chars.map((ch, i) => {
        const isPunct = /[\s，。！？、：；""''【】（）]/u.test(ch);
        if (isPunct) {
          return showPinyin
            ? <ruby key={i} style={{ pointerEvents: "none" }}>{ch}<rt></rt></ruby>
            : <span key={i}>{ch}</span>;
        }
        const py = showPinyin ? pinyinMap[ch] : null;
        if (showPinyin) {
          return (
            <ruby key={i} className="char-ruby" onClick={() => onWordClick?.(ch, vocabulary)}>
              {ch}<rt className="char-rt">{py ?? ""}</rt>
            </ruby>
          );
        }
        return (
          <span key={i} className="char-clickable" onClick={() => onWordClick?.(ch, vocabulary)}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

// ─── Full-Screen Panel ────────────────────────────────────────────────────────
function PanelViewer({ panel, showPinyin, showEnglish, onWordClick, animDir }) {
  const emoji = PANEL_EMOJIS[panel.panel_number % PANEL_EMOJIS.length];
  return (
    <div className="panel-full" data-anim={animDir}>
      <div className="panel-full-img-wrap">
        {panel.imageStatus === "loading" && (
          <div className="panel-full-loading">
            <div className="img-spinner" />
            <span style={{ fontSize: "0.8rem", color: "#8b6c56", fontWeight: 600 }}>Painting…</span>
          </div>
        )}
        {panel.imageStatus === "done" && panel.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="panel-full-img" src={panel.imageUrl} crossOrigin="anonymous" alt={`Panel ${panel.panel_number}`} />
        )}
        {(panel.imageStatus === "error" || panel.imageStatus === "none") && (
          <div className="panel-full-placeholder">
            {panel.imageError
              ? <span style={{ fontSize: "0.75rem", color: "#c0392b", padding: "16px", textAlign: "center" }}>{panel.imageError}</span>
              : emoji}
          </div>
        )}
      </div>
      <div className="panel-full-body">
        <div className="panel-full-chinese">
          <ClickableText
            text={panel.chinese_text}
            characterPinyin={panel.character_pinyin}
            showPinyin={showPinyin}
            vocabulary={panel.vocabulary || []}
            onWordClick={onWordClick}
          />
        </div>
        {showEnglish && <div className="panel-full-english">{panel.english_translation}</div>}
        <div className="panel-full-hint">Tap any character to look it up ✨</div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
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

  const themeOptions = ["animals","family","seasons","adventure","friendship","food","magic","bedtime"];
  const toneOptions = ["heartwarming","funny","educational","calming"];

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
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");

      const container = pdfRef.current;
      if (!container) return;

      const items = container.querySelectorAll(".pdf-panel-item");

      // Capture all panels first at natural height
      const canvases = [];
      for (let i = 0; i < items.length; i++) {
        const canvas = await html2canvas(items[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#fdf6ee",
          logging: false,
        });
        canvases.push(canvas);
      }

      // Build PDF with each page sized to its panel's actual content height
      const ptWidth = 595.28; // A4 width in points
      const scale = ptWidth / canvases[0].width;
      const firstPageH = Math.ceil(canvases[0].height * scale);

      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: [ptWidth, firstPageH] });

      for (let i = 0; i < canvases.length; i++) {
        const pageH = Math.ceil(canvases[i].height * scale);
        if (i > 0) pdf.addPage([ptWidth, pageH]);
        const imgData = canvases[i].toDataURL("image/jpeg", 0.92);
        pdf.addImage(imgData, "JPEG", 0, 0, ptWidth, pageH);
      }

      const filename = story.title_english
        ? `${story.title_english.replace(/\s+/g, "-")}.pdf`
        : "junebook.pdf";
      pdf.save(filename);
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
        character_pinyin: buildCharacterPinyin(p.chinese_text, p.pinyin),
        imageStatus: "loading",
        imageUrl: null,
      }));
      setPanels(initPanels);
      setPhase("book");
      setProgress(60);

      setLoadingMsg("Painting illustrations…");
      const total = storyData.panels.length;

      await Promise.all(storyData.panels.map(async (panel, idx) => {
        try {
          const imgRes = await fetch("/api/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: panel.illustration_prompt }),
          });
          const imgData = await imgRes.json();
          if (imgData.error) throw new Error(imgData.error);
          setPanels(prev => prev.map((p, i) =>
            i === idx ? { ...p, imageStatus: "done", imageUrl: imgData.url } : p
          ));
        } catch (imgErr) {
          setPanels(prev => prev.map((p, i) =>
            i === idx ? { ...p, imageStatus: "error", imageError: imgErr.message } : p
          ));
        }
        setProgress(60 + Math.round((idx + 1) / total * 38));
      }));

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

      {/* ── Setup ── */}
      {phase === "setup" && (
        <div className="setup-card">
          {error && <div className="error-banner">⚠️ {error}</div>}

          <div className="setup-section">
            <span className="setup-label">📖 Number of Pages</span>
            <div className="panel-count-row">
              <input
                className="panel-count-slider"
                type="range"
                min={4}
                max={16}
                step={1}
                value={panelCount}
                onChange={e => setPanelCount(Number(e.target.value))}
              />
              <span className="panel-count-val">{panelCount}</span>
            </div>
            <div className="panel-count-note">Each page takes ~20–30s to illustrate ({Math.round(panelCount * 25 / 60) < 1 ? "~" + panelCount * 25 + "s" : "~" + Math.round(panelCount * 25 / 60) + " min"} total)</div>
          </div>

          <div className="setup-section">
            <span className="setup-label">📚 Chinese Difficulty</span>
            <div className="chip-group">
              {[["beginner","Beginner (HSK 1–2)"],["intermediate","Intermediate (HSK 3–4)"],["advanced","Advanced (HSK 5–6)"]].map(([v,l]) => (
                <button key={v} className={`chip ${difficulty===v?"selected":""}`} onClick={() => setDifficulty(v)}>{l}</button>
              ))}
            </div>
          </div>

          <div className="setup-section">
            <span className="setup-label">🌟 Themes</span>
            <div className="chip-group">
              {themeOptions.map(t => (
                <button key={t} className={`chip ${themes.includes(t)?"selected":""}`} onClick={() => toggleTheme(t)}>{t}</button>
              ))}
            </div>
          </div>

          <div className="setup-section">
            <span className="setup-label">🎭 Tone</span>
            <div className="chip-group">
              {toneOptions.map(t => (
                <button key={t} className={`chip ${tone===t?"selected":""}`} onClick={() => setTone(t)}>{t}</button>
              ))}
            </div>
          </div>

          <div className="setup-section">
            <span className="setup-label">🐾 Main Character</span>
            <input
              className="text-input"
              placeholder='e.g. "a little rabbit" or "a girl named June"'
              value={mainChar}
              onChange={e => setMainChar(e.target.value)}
            />
          </div>

          <div className="setup-section">
            <span className="setup-label">✨ Additional Story Elements</span>
            <textarea
              className="text-area"
              placeholder='e.g. "Set during Mid-Autumn Festival. Include a wise old tortoise. The story ends with a lesson about sharing."'
              value={additionalElements}
              onChange={e => setAdditionalElements(e.target.value)}
            />
          </div>

          <div className="setup-section">
            <span className="setup-label">⚙️ Display Options</span>
            <div className="chip-group">
              <button className={`chip ${showPinyin?"selected":""}`} onClick={() => setShowPinyin(p=>!p)}>
                {showPinyin ? "✓ " : ""}Show Pinyin
              </button>
              <button className={`chip ${showEnglish?"selected":""}`} onClick={() => setShowEnglish(p=>!p)}>
                {showEnglish ? "✓ " : ""}Show English
              </button>
            </div>
          </div>

          <button className="generate-btn" onClick={generateStory}>
            生成故事 — Generate Story ✨
          </button>
        </div>
      )}

      {/* ── Loading ── */}
      {phase === "loading" && (
        <div className="loading-screen">
          <div className="loading-lantern">🏮</div>
          <div className="loading-text">{loadingMsg}</div>
          <div className="loading-sub">Creating your personalized picture book…</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* ── Book Viewer ── */}
      {phase === "book" && story && panels.length > 0 && (
        <div
          className="book-viewer"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Header */}
          <div className="viewer-header">
            <span className="viewer-brand">Junebook</span>
            <div className="viewer-title-block">
              <div className="viewer-title-cn">{story.title}</div>
              <div className="viewer-title-sub">{story.title_pinyin} · {story.title_english}</div>
            </div>
            <button className="viewer-close-btn" onClick={resetToSetup} title="New story">✕</button>
          </div>

          {/* Full-screen panel */}
          <div className="panel-full-wrap">
            <PanelViewer
              key={animKey}
              panel={panels[currentPanelIdx]}
              showPinyin={showPinyin}
              showEnglish={showEnglish}
              onWordClick={handleWordClick}
              animDir={animDir}
            />
          </div>

          {/* Navigation */}
          <div className="viewer-nav">
            <div className="viewer-nav-row">
              <button className="nav-arrow" onClick={goPrev} disabled={currentPanelIdx === 0}>←</button>
              <span className="nav-page-info">{currentPanelIdx + 1} / {panels.length}</span>
              <button className="nav-arrow" onClick={goNext} disabled={currentPanelIdx === panels.length - 1}>→</button>
            </div>
            <div className="viewer-nav-opts">
              <button className={`ctrl-btn ${showPinyin?"active":""}`} onClick={() => setShowPinyin(p=>!p)}>
                {showPinyin ? "✓ " : ""}Pinyin
              </button>
              <button className={`ctrl-btn ${showEnglish?"active":""}`} onClick={() => setShowEnglish(p=>!p)}>
                {showEnglish ? "✓ " : ""}English
              </button>
              <button className="ctrl-btn pdf-btn" onClick={downloadPDF} disabled={downloadingPDF}>
                {downloadingPDF ? "⏳ Saving…" : "↓ PDF"}
              </button>
            </div>
          </div>

          {/* Hidden PDF render container */}
          <div ref={pdfRef} className="pdf-hidden-container" aria-hidden="true">
            {panels.map((panel, i) => {
              const emoji = PANEL_EMOJIS[panel.panel_number % PANEL_EMOJIS.length];
              return (
                <div key={i} className="pdf-panel-item">
                  {panel.imageStatus === "done" && panel.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img className="pdf-panel-img" src={panel.imageUrl} crossOrigin="anonymous" alt="" />
                    : <div className="pdf-panel-placeholder">{emoji}</div>
                  }
                  <div className="pdf-panel-body">
                    <div className="pdf-panel-page">Page {panel.panel_number} of {panels.length}</div>
                    <div className="pdf-panel-chinese">
                      <ClickableText
                        text={panel.chinese_text}
                        characterPinyin={panel.character_pinyin}
                        showPinyin={showPinyin}
                        vocabulary={[]}
                      />
                    </div>
                    {showEnglish && <div className="pdf-panel-english">{panel.english_translation}</div>}
                    <div className="pdf-panel-branding">Junebook · {story.title_english}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Word Popover ── */}
      {popoverEntry && (
        <WordPopover entry={popoverEntry} onClose={() => setPopoverEntry(null)} />
      )}
    </div>
  );
}
