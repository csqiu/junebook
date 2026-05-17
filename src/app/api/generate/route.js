// Allow up to 5 min execution — long stories need time to generate
export const maxDuration = 300;

async function callAnthropic(prompt, storyTool) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: "You are a Chinese children's book author. Create charming, culturally authentic stories for young children.",
      tools: [storyTool],
      tool_choice: { type: "tool", name: "create_story" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API returned ${res.status}`);
  }
  return res.json();
}

function extractStory(data) {
  if (data.stop_reason === "max_tokens") {
    throw new Error("Story was too long to generate. Try fewer pages.");
  }
  const toolBlock = Array.isArray(data.content)
    ? data.content.find(b => b.type === "tool_use" && b.name === "create_story")
    : null;
  if (!toolBlock) {
    throw new Error(`AI did not return a story structure (stop_reason: ${data.stop_reason}).`);
  }
  const story = toolBlock.input;
  if (!story || typeof story !== "object") {
    throw new Error("Story data was malformed.");
  }
  // Claude occasionally JSON-encodes nested arrays as strings — unwrap if needed
  if (typeof story.panels === "string") {
    try { story.panels = JSON.parse(story.panels); } catch { /* leave as-is, will fail below */ }
  }
  if (!Array.isArray(story.panels) || story.panels.length === 0) {
    const keys = Object.keys(story);
    const panelsVal = story.panels === undefined ? "undefined"
      : story.panels === null ? "null"
      : Array.isArray(story.panels) ? `array(${story.panels.length})`
      : `${typeof story.panels}`;
    throw new Error(`Story panels were missing. Keys present: [${keys.join(", ")}]. Panels type: ${panelsVal}.`);
  }
  return story;
}

export async function POST(request) {
  try {
    // ── 1. Parse request ───────────────────────────────────────────────────
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

    const prompt = `Create a ${count}-panel Chinese picture book story with these parameters:
- HSK level: ${hsk}
- Themes: ${themes.join(", ")}
- Main character: ${mainChar || "a little rabbit"}
- Tone: ${tone}
${extraLine}

Include 2-4 vocabulary words per panel. Make the story charming, culturally authentic, and child-appropriate.`;

    // ── 2. Tool schema ─────────────────────────────────────────────────────
    const storyTool = {
      name: "create_story",
      description: "Output a complete Chinese picture book story",
      input_schema: {
        type: "object",
        required: ["title", "title_pinyin", "title_english", "character_sheet", "panels"],
        properties: {
          title:         { type: "string", description: "Story title in Chinese" },
          title_pinyin:  { type: "string", description: "Pinyin of the title with tone marks" },
          title_english: { type: "string", description: "English title" },
          character_sheet: {
            type: "string",
            description: "One sentence describing the main character's permanent visual appearance — species, size, colors, clothing, and one distinctive feature.",
          },
          panels: {
            type: "array",
            items: {
              type: "object",
              required: ["panel_number", "illustration_prompt", "chinese_text", "pinyin", "english_translation", "vocabulary"],
              properties: {
                panel_number:        { type: "integer" },
                illustration_prompt: {
                  type: "string",
                  description: "Vivid scene for a children's watercolor illustration. Name every character present, then describe setting, action, mood, colors. Under 45 words.",
                },
                chinese_text:        { type: "string" },
                pinyin:              { type: "string", description: "Full sentence pinyin with tone marks, syllables separated by spaces" },
                english_translation: { type: "string" },
                vocabulary: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["character", "pinyin", "definition", "example_chinese", "example_english"],
                    properties: {
                      character:       { type: "string" },
                      pinyin:          { type: "string" },
                      definition:      { type: "string" },
                      example_chinese: { type: "string" },
                      example_english: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    // ── 3. Call Anthropic — retry once on panels-missing failure ──────────
    let story;
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const data = await callAnthropic(prompt, storyTool);
        story = extractStory(data);
        break;
      } catch (err) {
        lastErr = err;
        console.error(`Attempt ${attempt} failed:`, err.message);
        if (attempt === 1 && err.message.includes("panels were missing")) {
          // Only retry for the missing-panels case
          continue;
        }
        throw err;
      }
    }
    if (!story) throw lastErr;

    // ── 4. Inject character sheet into every illustration prompt ──────────
    if (story.character_sheet) {
      story.panels = story.panels.map(p => ({
        ...p,
        illustration_prompt: `${p.illustration_prompt} [Character: ${story.character_sheet}]`,
      }));
    }

    return Response.json(story);

  } catch (err) {
    console.error("Error in /api/generate:", err?.message);
    return Response.json({ error: err.message || "An unexpected error occurred. Please try again." }, { status: 500 });
  }
}
