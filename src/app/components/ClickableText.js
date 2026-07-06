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
        // and desync the alignment for the rest of the string. Covers Unified
        // Ideographs, Extension A, compatibility ideographs, the 々/〇 marks
        // commonly used in names and dates, and supplementary-plane rare
        // characters (surrogate pairs are handled correctly since Array.from
        // iterates by codepoint, not UTF-16 code unit).
        const isCJK = /[々〇㐀-䶿一-鿿豈-﫿\u{20000}-\u{2A6DF}]/u.test(ch);
        if (!isCJK) {
          return showPinyin
            ? <ruby key={i} style={{ pointerEvents: "none" }}>{ch}<rt></rt></ruby>
            : <span key={i}>{ch}</span>;
        }
        const entry = characterPinyin?.[cjkIdx];
        cjkIdx++;
        if (showPinyin && entry?.char !== ch) {
          console.warn(`ClickableText: character_pinyin misaligned at index ${cjkIdx - 1} (expected "${ch}", got "${entry?.char}") — falling back to lookup by character.`);
        }
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
