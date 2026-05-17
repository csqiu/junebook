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
            description: "One sentence describing the main character's permanent visual appearance — species, size, colors, clothing, and one distinctive feature. Used verbatim in every illustration prompt."
          },
          character_reference_prompt: {
            type: "string",
            description: "A text-to-image prompt (under 25 words) for a character reference sheet: the main character only, neutral standing pose, plain white background, full body visible, no scene or props."
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
                  description: "Scene description for a children's watercolor illustration. Start by explicitly naming every character visible in this scene (e.g. 'The rabbit and the tortoise...'). Then describe setting, action, mood, time of day. Do NOT re-describe permanent appearance — that is handled separately. Under 45 words."
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
                      example_english: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    // ── 3. Call Anthropic API ──────────────────────────────────────────────
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
          system: "You are a Chinese children's book author. Create charming, culturally authentic stories for young children.",
          tools: [storyTool],
          tool_choice: { type: "tool", name: "create_story" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (fetchErr) {
      console.error("Network error calling Anthropic API:", fetchErr.message);
      return Response.json({ error: "Network error reaching AI service. Please try again." }, { status: 500 });
    }

    // ── 4. Handle non-OK HTTP from Anthropic ──────────────────────────────
    if (!apiRes.ok) {
      let errBody = {};
      try { errBody = await apiRes.json(); } catch { /* ignore */ }
      const msg = errBody.error?.message || `Anthropic API returned ${apiRes.status}`;
      console.error("Anthropic non-OK response:", apiRes.status, msg);
      return Response.json({ error: msg }, { status: 500 });
    }

    // ── 5. Parse Anthropic response body ──────────────────────────────────
    let data;
    try {
      data = await apiRes.json();
    } catch (parseErr) {
      console.error("Failed to parse Anthropic response body:", parseErr.message);
      return Response.json({ error: "Unexpected response from AI. Please try again." }, { status: 500 });
    }

    if (data.stop_reason === "max_tokens") {
      console.error("Anthropic hit max_tokens. Usage:", JSON.stringify(data.usage));
      return Response.json({ error: "Story was too long to generate. Try fewer pages." }, { status: 500 });
    }

    // ── 6. Extract tool_use block ──────────────────────────────────────────
    const toolBlock = Array.isArray(data.content)
      ? data.content.find(b => b.type === "tool_use" && b.name === "create_story")
      : null;

    if (!toolBlock) {
      console.error("No tool_use block. stop_reason:", data.stop_reason,
        "content types:", data.content?.map(b => b.type));
      return Response.json({ error: "AI did not return a story structure. Please try again." }, { status: 500 });
    }

    const story = toolBlock.input;

    // ── 7. Validate the story object ──────────────────────────────────────
    if (!story || typeof story !== "object") {
      console.error("tool_use input is not an object:", typeof story);
      return Response.json({ error: "Story data was malformed. Please try again." }, { status: 500 });
    }
    if (!Array.isArray(story.panels) || story.panels.length === 0) {
      console.error("story.panels missing or empty. stop_reason:", data.stop_reason,
        "story keys:", Object.keys(story || {}),
        "story snippet:", JSON.stringify(story).slice(0, 800));
      return Response.json({
        error: `Story panels were missing (stop_reason: ${data.stop_reason}). Please try again.`
      }, { status: 500 });
    }

    // ── 8. Inject character sheet into every illustration prompt ─────────
    if (story.character_sheet) {
      story.panels = story.panels.map(p => ({
        ...p,
        illustration_prompt: `${p.illustration_prompt} [Character: ${story.character_sheet}]`,
      }));
    }

    return Response.json(story);

  } catch (err) {
    // Catch-all: should never reach here, but guarantees a JSON response
    console.error("Unhandled error in /api/generate:", err?.message, err?.stack);
    return Response.json({ error: "An unexpected error occurred. Please try again." }, { status: 500 });
  }
}
