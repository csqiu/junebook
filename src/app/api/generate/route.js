// Allow up to 5 min execution — long stories need time to generate
export const maxDuration = 300;

export async function POST(request) {
  try {
    // ── 1. Parse incoming request ──────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const { panelCount, difficulty, themes, tone, mainChar, additionalElements } = body;

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
  "title_pinyin": "pinyin of title with tone marks",
  "title_english": "English title",
  "character_sheet": "One sentence describing the main character's permanent visual appearance for illustration consistency — species, size, colors, clothing, and one distinctive feature.",
  "panels": [
    {
      "panel_number": 1,
      "illustration_prompt": "Vivid scene for a children's watercolor illustration: setting, action, mood, colors. Do NOT describe the main character appearance. Under 40 words.",
      "chinese_text": "Chinese sentence(s) for this panel",
      "pinyin": "full sentence pinyin with tone marks, syllables space-separated",
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

Include 2-4 vocabulary words per panel. Make the story charming, culturally authentic, and child-appropriate.
You MUST include all ${count} panels. Return nothing except the JSON object.`;

    // ── 2. Call API and parse JSON (up to 3 attempts) ─────────────────────
    async function callAPI() {
      let apiRes;
      try {
        apiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 16000,
            system: "You are a Chinese children's book author. Return only valid JSON with no markdown, no code blocks, no extra text.",
            messages: [{ role: "user", content: prompt }],
          }),
        });
      } catch (fetchErr) {
        return { error: "Network error reaching AI service. Please try again." };
      }

      if (!apiRes.ok) {
        let errBody = {};
        try { errBody = await apiRes.json(); } catch { /* ignore */ }
        const msg = errBody.error?.message || `Anthropic API returned ${apiRes.status}`;
        console.error("Anthropic non-OK response:", apiRes.status, msg);
        return { error: msg };
      }

      let data;
      try {
        data = await apiRes.json();
      } catch {
        return { retry: true };
      }

      if (data.stop_reason === "max_tokens") {
        return { error: "Story was too long to generate. Try fewer pages." };
      }

      const raw = (data.content || []).map(b => b.text || "").join("");
      const clean = raw
        .replace(/```json|```/g, "")
        .replace(/‘|’/g, "'")
        .replace(/“|”/g, '"')
        .trim();

      // Try full parse first, then extract the outermost JSON object
      const candidates = [clean];
      const match = clean.match(/\{[\s\S]*\}/);
      if (match && match[0] !== clean) candidates.push(match[0]);

      for (const candidate of candidates) {
        try {
          const story = JSON.parse(candidate);
          if (story && Array.isArray(story.panels) && story.panels.length > 0) {
            return { story };
          }
        } catch { /* try next candidate */ }
      }

      console.error("Could not parse panels from response, raw snippet:", raw.slice(0, 200));
      return { retry: true };
    }

    let story;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await callAPI();
      if (result.story) { story = result.story; break; }
      if (result.error) return Response.json({ error: result.error }, { status: 500 });
      console.warn(`Attempt ${attempt} failed to get panels, retrying…`);
    }
    if (!story) {
      return Response.json({ error: "Could not generate a valid story. Please try again." }, { status: 500 });
    }

    // ── 3. Inject character sheet into illustration prompts ───────────────
    if (story.character_sheet) {
      story.panels = story.panels.map(p => ({
        ...p,
        illustration_prompt: `Character reference (use consistently): ${story.character_sheet} Scene: ${p.illustration_prompt}`,
      }));
    }

    return Response.json(story);

  } catch (err) {
    console.error("Unhandled error in /api/generate:", err?.message, err?.stack);
    return Response.json({ error: "An unexpected error occurred. Please try again." }, { status: 500 });
  }
}
