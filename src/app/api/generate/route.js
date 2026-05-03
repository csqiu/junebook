export async function POST(request) {
  const { panelCount, difficulty, themes, tone, mainChar, additionalElements } = await request.json();

  const count = Math.min(Math.max(parseInt(panelCount) || 6, 4), 16);
  const hsk = difficulty === "beginner" ? "HSK 1-2 (very simple, ~300 characters)" :
              difficulty === "intermediate" ? "HSK 3-4 (~1200 characters)" :
              "HSK 5-6 (~2500 characters)";

  const extraLine = additionalElements?.trim()
    ? `- Additional story elements: ${additionalElements.trim()}`
    : "";

  const prompt = `You are a children's book author creating a Chinese picture book.

Generate a ${count}-panel picture book story with these parameters:
- HSK level: ${hsk}
- Themes: ${themes.join(", ")}
- Main character: ${mainChar || "a little rabbit"}
- Tone: ${tone}
${extraLine}

Return ONLY valid JSON (no markdown, no backticks) in this exact structure:
{
  "title": "Story title in Chinese",
  "title_pinyin": "pinyin of title",
  "title_english": "English title",
  "character_sheet": "One sentence describing the main character's permanent visual appearance for illustration consistency — species, size, colors, clothing, and one distinctive feature. Example: 'Mei is a small white rabbit with pink inner ears, wearing a red qipao with gold trim and a yellow flower clip on her right ear.'",
  "panels": [
    {
      "panel_number": 1,
      "illustration_prompt": "A vivid scene for a children's watercolor illustration: describe the setting, action, mood, and colors. Do NOT redescribe the main character here — their appearance is provided separately. Keep it under 40 words.",
      "chinese_text": "Chinese sentence(s) for this panel",
      "pinyin": "full pinyin with tone marks",
      "english_translation": "English translation",
      "vocabulary": [
        {
          "character": "word",
          "pinyin": "pinyin",
          "definition": "English definition",
          "example_chinese": "Example sentence in Chinese",
          "example_english": "Example sentence in English"
        }
      ]
    }
  ]
}

Include 2-4 vocabulary words per panel. Make the story charming, culturally authentic, and child-appropriate.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      system: "You are a Chinese children's book author. Return only valid JSON with no markdown, no code blocks, no extra text. Never use smart quotes inside JSON values.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return Response.json({ error: err.error?.message || "Claude API error" }, { status: 500 });
  }

  const data = await res.json();
  const raw = data.content.map((b) => b.text || "").join("");
  const clean = raw
    .replace(/```json|```/g, "")
    .replace(/‘|’/g, "'")
    .replace(/“|”/g, '"')
    .trim();

  function injectCharacterSheet(story) {
    if (story.character_sheet && story.panels) {
      story.panels = story.panels.map(p => ({
        ...p,
        illustration_prompt: `Character reference (use consistently): ${story.character_sheet} Scene: ${p.illustration_prompt}`,
      }));
    }
    return story;
  }

  try {
    const story = JSON.parse(clean);
    return Response.json(injectCharacterSheet(story));
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return Response.json(injectCharacterSheet(JSON.parse(match[0])));
      } catch {}
    }
    return Response.json({ error: "Failed to parse story JSON. Please try again." }, { status: 500 });
  }
}
