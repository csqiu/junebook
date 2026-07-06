import PanelViewer from "./PanelViewer";
import PdfExportLayer from "./PdfExportLayer";

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

      <PdfExportLayer
        pdfRef={pdfRef}
        panels={panels}
        showPinyin={showPinyin}
        showEnglish={showEnglish}
        story={story}
      />
    </div>
  );
}
