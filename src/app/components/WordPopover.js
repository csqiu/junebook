export default function WordPopover({ entry, onClose }) {
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
