export default function ClickableText({ text, characterPinyin, showPinyin, vocabulary, onWordClick }) {
  // Fallback lookup by character content, used only if the model's per-character
  // pinyin array ever drifts out of position relative to the text.
  const pinyinByChar = {};
  if (characterPinyin) {
    characterPinyin.forEach(({ char, pinyin }) => { if (pinyin && !(char in pinyinByChar)) pinyinByChar[char] = pinyin; });
  }
  const chars = Array.from(text);
  let cjkIdx = 0;
  return (
    <span>
      {chars.map((ch, i) => {
        // Match actual CJK ideographs rather than excluding known punctuation —
        // an exclusion list misses embedded Latin text (e.g. a name like "June")
        // and less-common punctuation (「」『』, …, —), each of which would
        // otherwise consume a characterPinyin slot meant for a later character
        // and desync the alignment for the rest of the string.
        const isCJK = /[一-鿿㐀-䶿]/u.test(ch);
        if (!isCJK) {
          return showPinyin
            ? <ruby key={i} style={{ pointerEvents: "none" }}>{ch}<rt></rt></ruby>
            : <span key={i}>{ch}</span>;
        }
        const entry = characterPinyin?.[cjkIdx];
        cjkIdx++;
        const py = showPinyin ? (entry?.char === ch ? entry.pinyin : pinyinByChar[ch]) : null;
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
