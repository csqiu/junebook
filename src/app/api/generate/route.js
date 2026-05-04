export async function POST(request) {
  const { panelCount, difficulty, themes, tone, mainChar, additionalElements } = await request.json();

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

  const storyTool = {
    name: "create_story",
    description: "Output a complete Chinese picture book story",
    input_schema: {
      type: "object",
      required: ["title", "title_pinyin", "title_english", "character_sheet", "panels"],
      properties: {
        title: { type: "string", description: "Story title in Chinese" },
        title_pinyin: { type: "string", description: "Pinyin of the title with tone marks" },
        title_english: { type: "string", description: "English title" },
        character_sheet: {
          type: "string",
          description: "One sentence describing the main character's permanent visual appearance for illustration consistency — species, size, colors, clothing, and one distinctive feature."
        },
        panels: {
          type: "array",
          items: {
            type: "object",
            required: ["panel_number", "illustration_prompt", "chinese_text", "pinyin", "english_translation", "vocabulary"],
            properties: {
              panel_number: { type: "integer" },
              illustration_prompt: {
                type: "string",
                description: "Vivid scene for a children's watercolor illustration: setting, action, mood, colors. Do NOT redescribe the main character. Under 40 words."
              },
              chinese_text: { type: "string", description: "Chinese sentence(s) for this panel" },
              pinyin: { type: "string", description: "Full sentence pinyin with tone marks, one syllable per word separated by spaces" },
              english_translation: { type: "string" },
              vocabulary: {
                type: "array",
                items: {
                  type: "object",
                  required: ["character", "pinyin", "definition", "example_chinese", "example_english"],
                  properties: {
                    character: { type: "string" },
                    pinyin: { type: "string" },
                    definition: { type: "string" },
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
    return Response.json({ error: err.error?.message || "Claude API error" }, { status: 500 });
  }

  const data = await res.json();

  if (data.stop_reason === "max_tokens") {
    return Response.json({ error: "Story was too long to generate. Try fewer pages." }, { status: 500 });
  }

  const toolBlock = data.content?.find(b => b.type === "tool_use");
  if (!toolBlock?.input) {
    console.error("No tool_use block in response:", JSON.stringify(data).slice(0, 500));
    return Response.json({ error: "Failed to generate story. Please try again." }, { status: 500 });
  }

  const story = toolBlock.input;

  if (story.character_sheet && story.panels) {
    story.panels = story.panels.map(p => ({
      ...p,
      illustration_prompt: `Character reference (use consistently): ${story.character_sheet} Scene: ${p.illustration_prompt}`,
    }));
  }

  return Response.json(story);
}
