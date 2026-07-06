import { memo } from "react";
import { PANEL_EMOJIS } from "../../lib/constants";
import ClickableText from "./ClickableText";

// Hidden off-screen layer html2canvas reads from for PDF export. Wrapped in
// memo() so navigating between panels (which only changes BookViewer's
// currentPanelIdx/animKey/animDir, none of which this layer depends on)
// doesn't re-render every panel's ClickableText on every page-turn.
function PdfExportLayer({ pdfRef, panels, showPinyin, showEnglish, story }) {
  return (
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
  );
}

export default memo(PdfExportLayer);
