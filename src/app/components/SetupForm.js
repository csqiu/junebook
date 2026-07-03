const THEME_OPTIONS = ["animals","family","seasons","adventure","friendship","food","magic","bedtime"];
const TONE_OPTIONS = ["heartwarming","funny","educational","calming"];
const DIFFICULTY_OPTIONS = [
  ["beginner", "Beginner (HSK 1–2)"],
  ["intermediate", "Intermediate (HSK 3–4)"],
  ["advanced", "Advanced (HSK 5–6)"],
];

export default function SetupForm({
  error,
  panelCount, setPanelCount,
  difficulty, setDifficulty,
  themes, toggleTheme,
  tone, setTone,
  mainChar, setMainChar,
  additionalElements, setAdditionalElements,
  showPinyin, setShowPinyin,
  showEnglish, setShowEnglish,
  onGenerate,
}) {
  return (
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
          {DIFFICULTY_OPTIONS.map(([v, l]) => (
            <button key={v} className={`chip ${difficulty===v?"selected":""}`} onClick={() => setDifficulty(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <span className="setup-label">🌟 Themes</span>
        <div className="chip-group">
          {THEME_OPTIONS.map(t => (
            <button key={t} className={`chip ${themes.includes(t)?"selected":""}`} onClick={() => toggleTheme(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="setup-section">
        <span className="setup-label">🎭 Tone</span>
        <div className="chip-group">
          {TONE_OPTIONS.map(t => (
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

      <button className="generate-btn" onClick={onGenerate}>
        生成故事 — Generate Story ✨
      </button>
    </div>
  );
}
