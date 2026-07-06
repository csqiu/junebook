import { PANEL_EMOJIS } from "../../lib/constants";
import ClickableText from "./ClickableText";

export default function PanelViewer({ panel, showPinyin, showEnglish, onWordClick, animDir }) {
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
          <img className="panel-full-img" src={panel.imageUrl} alt={`Panel ${panel.panel_number}`} />
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
