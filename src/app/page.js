"use client";
import { useState, useRef } from "react";

const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || "June";

// ─── Password Gate ──────────────────────────────────────────────────────────
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
        <div className="gate-title">小故事书</div>
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

// ─── Word Popover ───────────────────────────────────────────────────────────
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

// ─── Clickable Chinese Text ─────────────────────────────────────────────────
function ClickableText({ text, vocabulary, onWordClick }) {
  const chars = Array.from(text);
  return (
    <span>
      {chars.map((ch, i) => {
        const isPunct = /[\s，。！？、：；""''【】（）]/u.test(ch);
        if (isPunct) return <span key={i}>{ch}</span>;
        return (
          <span key={i} className="char-clickable" onClick={() => onWordClick(ch, vocabulary)} title="Click to learn">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

// ─── Panel Card ─────────────────────────────────────────────────────────────
function PanelCard({ panel, showPinyin, showEnglish, onWordClick }) {
  const emojis = ["🌸","🐼","🏮","🌙","🐉","🦋","🌈","🍵"];
  return (
    <div className="panel-card">
      <div className="panel-img-wrap">
        <div className="panel-number">#{panel.panel_number}</div>
        {panel.imageStatus === "loading" && (
          <div className="panel-illustration-loading">
            <div className="img-spinner" />
            <span style={{ fontSize: "0.75rem", color: "#8b6c56", fontWeight: 600 }}>Painting…</span>
          </div>
        )}
        {panel.imageStatus === "done" && panel.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="panel-illustration" src={panel.imageUrl} alt={`Panel ${panel.panel_number}`} />
        )}
        {(panel.imageStatus === "error" || panel.imageStatus === "none") && (
          <div className="panel-illustration-placeholder">
            {panel.imageError
              ? <span style={{ fontSize: "0.7rem", color: "#c0392b", padding: "8px", textAlign: "center" }}>{panel.imageError}</span>
              : emojis[panel.panel_number % emojis.length]}
          </div>
        )}
      </div>
      <div className="panel-body">
        {showPinyin && <div className="panel-pinyin">{panel.pinyin}</div>}
        <div className="panel-chinese">
          <ClickableText text={panel.chinese_text} vocabulary={panel.vocabulary || []} onWordClick={onWordClick} />
        </div>
        {showEnglish && <div className="panel-english">{panel.english_translation}</div>}
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function Home() {
  const [unlocked, setUnlocked] = useState(false);
  const [length, setLength] = useState("medium");
  const [difficulty, setDifficulty] = useState("beginner");
  const [showPinyin, setShowPinyin] = useState(true);
  const [showEnglish, setShowEnglish] = useState(true);
  const [themes, setThemes] = useState(["animals", "family"]);
  const [tone, setTone] = useState("heartwarming");
  const [mainChar, setMainChar] = useState("");
  const [phase, setPhase] = useState("setup");
  const [story, setStory] = useState(null);
  const [panels, setPanels] = useState([]);
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [popoverEntry, setPopoverEntry] = useState(null);
  const lookupCache = useRef({});

  const themeOptions = ["animals","family","seasons","adventure","friendship","food","magic","bedtime"];
  const toneOptions = ["heartwarming","funny","educational","calming"];

  function toggleTheme(t) {
    setThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
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

    try {
      // 1. Generate story
      const storyRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ length, difficulty, themes, tone, mainChar }),
      });
      const storyData = await storyRes.json();
      if (storyData.error) throw new Error(storyData.error);

      setStory(storyData);
      setProgress(40);

      // 2. Init panels
      const initPanels = storyData.panels.map(p => ({
        ...p,
        imageStatus: "loading",
        imageUrl: null,
      }));
      setPanels(initPanels);
      setPhase("book");
      setProgress(60);

      // 3. Generate images in parallel
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

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="app">
      <div className="header">
        <div className="header-title">小故事书</div>
        <div className="header-sub">Chinese Picture Book Generator</div>
      </div>

      {phase === "setup" && (
        <div className="setup-card">
          {error && <div className="error-banner">⚠️ {error}</div>}

          <div className="setup-section">
            <span className="setup-label">📖 Story Length</span>
            <div className="chip-group">
              {[["short","Short (4 panels)"],["medium","Medium (6 panels)"],["long","Long (8 panels)"]].map(([v,l]) => (
                <button key={v} className={`chip ${length===v?"selected":""}`} onClick={() => setLength(v)}>{l}</button>
              ))}
            </div>
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
            <span className="setup-label">⚙️ Display Options</span>
            <div className="chip-group">
              <button className={`chip ${showPinyin?"selected":""}`} onClick={() => setShowPinyin(p=>!p)}>
                {showPinyin ? "✓" : ""} Show Pinyin
              </button>
              <button className={`chip ${showEnglish?"selected":""}`} onClick={() => setShowEnglish(p=>!p)}>
                {showEnglish ? "✓" : ""} Show English
              </button>
            </div>
          </div>

          <button className="generate-btn" onClick={generateStory}>
            生成故事 — Generate Story ✨
          </button>
        </div>
      )}

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

      {phase === "book" && story && (
        <>
          <div className="book-title-display">
            <h2>{story.title}</h2>
            <div style={{ color: "#8b6c56", fontSize: "0.9rem", fontWeight: 600 }}>
              {story.title_pinyin} · {story.title_english}
            </div>
          </div>

          <div className="book-controls">
            <button className={`ctrl-btn ${showPinyin?"active":""}`} onClick={() => setShowPinyin(p=>!p)}>
              {showPinyin ? "✓ Pinyin" : "Pinyin"}
            </button>
            <button className={`ctrl-btn ${showEnglish?"active":""}`} onClick={() => setShowEnglish(p=>!p)}>
              {showEnglish ? "✓ English" : "English"}
            </button>
            <button className="ctrl-btn" onClick={() => { setPhase("setup"); setStory(null); setPanels([]); setError(""); }}>
              ← New Story
            </button>
          </div>

          <div className="hint-text">Tap any Chinese character to learn its meaning ✨</div>

          <div className="book-scroll">
            {panels.map((panel, i) => (
              <PanelCard
                key={i}
                panel={panel}
                showPinyin={showPinyin}
                showEnglish={showEnglish}
                onWordClick={handleWordClick}
              />
            ))}
          </div>
        </>
      )}

      {popoverEntry && (
        <WordPopover entry={popoverEntry} onClose={() => setPopoverEntry(null)} />
      )}
    </div>
  );
}
