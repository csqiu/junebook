import { callClaudeTool } from "../../../lib/anthropic";

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
            description: "One sentence describing the main character's permanent visual appearance, for an image generation model with no other context. Must start by stating age and gender or species explicitly (e.g. 'A young girl...', 'A little boy...', 'A small rabbit...') — an image model will default to a generic adult if this is left implicit. Then describe size, colors, clothing, hairstyle, and one distinctive feature."
          },
          panels: {
            type: "array",
            items: {
              type: "object",
              required: ["panel_number", "illustration_prompt", "chinese_text", "character_pinyin", "english_translation", "vocabulary"],
              properties: {
                panel_number:        { type: "integer" },
                illustration_prompt: { type: "string", description: "Vivid scene for a children's watercolor illustration: setting, action, mood, colors. Do NOT describe the character's appearance. Under 40 words." },
                chinese_text:        { type: "string" },
                character_pinyin: {
                  type: "array",
                  description: "Pinyin with tone marks for chinese_text, one entry per Chinese character in reading order, skipping punctuation and whitespace. Must have exactly one entry per Chinese character in chinese_text, in the same order.",
                  items: {
                    type: "object",
                    required: ["char", "pinyin"],
                    properties: {
                      char:   { type: "string", description: "A single Chinese character from chinese_text" },
                      pinyin: { type: "string", description: "That character's pinyin syllable with tone marks, in this sentence's context" }
                    }
                  }
                },
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

    // ── 3. Call Claude ──────────────────────────────────────────────────────
    const callResult = await callClaudeTool({
      system: "You are a Chinese children's book author. Create charming, culturally authentic stories for young children.",
      tool: storyTool,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 16000,
    });

    if (!callResult.ok) {
      // Log the raw diagnostic message server-side only — never forward it to
      // the client, since it can contain low-level fetch/parse error text.
      console.error("Story generation failed:", callResult);
      const errMsg = callResult.reason === "max_tokens"
        ? "Story was too long to generate. Try fewer pages."
        : callResult.reason === "no_tool_block"
          ? "AI did not return a story structure. Please try again."
          : "Something went wrong while writing your story. Please try again.";
      return Response.json({ error: errMsg }, { status: 500 });
    }

    const story = callResult.result;

    // ── 4. Validate the story object ────────────────────────────────────────
    if (!story || typeof story !== "object") {
      console.error("tool_use input is not an object:", typeof story);
      return Response.json({ error: "Story data was malformed. Please try again." }, { status: 500 });
    }
    if (!Array.isArray(story.panels) || story.panels.length === 0) {
      console.error("story.panels missing or empty:", JSON.stringify(story).slice(0, 300));
      return Response.json({ error: "Story panels were missing. Please try again." }, { status: 500 });
    }

    // ── 5. Inject character sheet into illustration prompts ───────────────
    // Repeats the user's literal main-character text verbatim alongside Claude's
    // character_sheet paraphrase — a redundant anchor in case the paraphrase drops
    // a detail (age/gender in particular) that the image model needs to be told
    // explicitly rather than left implicit. The two are injected independently so
    // an empty character_sheet (schema requires it be present, not non-empty)
    // doesn't also wipe out the user's own mainChar anchor. Uses the same
    // fallback as the story prompt above so the default character gets this
    // anchor too, not just explicitly-typed ones.
    const mainCharText = (mainChar || "a little rabbit").trim().replace(/[.!?]+$/, "");
    const mainCharLine = mainCharText ? ` Main character: ${mainCharText}.` : "";
    const characterSheetLine = story.character_sheet ? ` ${story.character_sheet}` : "";
    if (mainCharLine || characterSheetLine) {
      story.panels = story.panels.map(p => ({
        ...p,
        illustration_prompt: `Character reference (use consistently):${mainCharLine}${characterSheetLine} Scene: ${p.illustration_prompt}`,
      }));
    }

    return Response.json(story);

  } catch (err) {
    // Catch-all: should never reach here, but guarantees a JSON response
    console.error("Unhandled error in /api/generate:", err?.message, err?.stack);
    return Response.json({ error: "An unexpected error occurred. Please try again." }, { status: 500 });
  }
}
