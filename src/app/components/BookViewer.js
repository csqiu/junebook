import { PANEL_EMOJIS } from "../../lib/constants";
import ClickableText from "./ClickableText";
import PanelViewer from "./PanelViewer";

export default function BookViewer({
  story, panels, currentPanelIdx, animKey, animDir,
  showPinyin, setShowPinyin, showEnglish, setShowEnglish,
  onWordClick, goPrev, goNext,
  downloadPDF, downloadingPDF, resetToSetup,
  pdfRef, handleTouchStart, handleTouchEnd,
}) {
  return (
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
          onWordClick={onWordClick}
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
  );
}
