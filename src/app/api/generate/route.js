export async function POST(request) {
  const { length, difficulty, themes, tone, mainChar } = await request.json();

  const panelCount = length === "short" ? 4 : length === "medium" ? 6 : 8;
  const hsk = difficulty === "beginner" ? "HSK 1-2 (very simple, ~300 characters)" :
              difficulty === "intermediate" ? "HSK 3-4 (~1200 characters)" :
              "HSK 5-6 (~2500 characters)";

  const prompt = `You are a children's book author creating a Chinese picture book.

Generate a ${panelCount}-panel picture book story with these parameters:
- HSK level: ${hsk}
- Themes: ${themes.join(", ")}
- Main character: ${mainChar || "a little rabbit"}
- Tone: ${tone}

Return ONLY valid JSON (no markdown, no backticks) in this exact structure:
{
  "title": "Story title in Chinese",
  "title_pinyin": "pinyin of title",
  "title_english": "English title",
  "panels": [
    {
      "panel_number": 1,
      "illustration_prompt": "A vivid scene for a children's watercolor illustration: describe characters, setting, mood, colors. Keep it under 50 words.",
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
      max_tokens: 8000,
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
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .trim();

  try {
    const story = JSON.parse(clean);
    return Response.json(story);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return Response.json(JSON.parse(match[0]));
      } catch {}
    }
    return Response.json({ error: "Failed to parse story JSON. Please try again." }, { status: 500 });
  }
}
