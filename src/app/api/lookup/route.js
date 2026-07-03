import { CLAUDE_MODEL } from "../../../lib/constants";

function fallbackEntry(char, definition) {
  return { character: char, pinyin: "—", definition, example_chinese: "", example_english: "" };
}

export async function POST(request) {
  // ── 1. Parse incoming request ────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(fallbackEntry("", "Invalid request."));
  }
  const { char } = body;
  if (typeof char !== "string" || !char.trim()) {
    return Response.json(fallbackEntry(char || "", "No character was provided."));
  }

  // ── 2. Tool schema ────────────────────────────────────────────────────────
  const lookupTool = {
    name: "lookup_character",
    description: "Return a dictionary entry for a Chinese character or word",
    input_schema: {
      type: "object",
      required: ["character", "pinyin", "definition", "example_chinese", "example_english"],
      properties: {
        character:       { type: "string" },
        pinyin:          { type: "string", description: "Pinyin with tone marks" },
        definition:      { type: "string", description: "Concise English definition" },
        example_chinese: { type: "string", description: "A short example sentence using the character/word" },
        example_english: { type: "string", description: "English translation of the example sentence" },
      },
    },
  };

  try {
    // ── 3. Call Anthropic API ─────────────────────────────────────────────
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
          model: CLAUDE_MODEL,
          max_tokens: 300,
          system: "You are a Chinese-English dictionary for a children's picture book app.",
          tools: [lookupTool],
          tool_choice: { type: "tool", name: "lookup_character" },
          messages: [{
            role: "user",
            content: `Give me the dictionary entry for the Chinese character/word "${char}".`,
          }],
        }),
      });
    } catch (fetchErr) {
      console.error("Network error calling Anthropic API:", fetchErr.message);
      return Response.json(fallbackEntry(char, "Could not look up this character."));
    }

    // ── 4. Handle non-OK HTTP from Anthropic ──────────────────────────────
    if (!apiRes.ok) {
      const errBody = await apiRes.json().catch(() => ({}));
      console.error("Anthropic non-OK response:", apiRes.status, errBody.error?.message);
      return Response.json(fallbackEntry(char, "Could not look up this character."));
    }

    // ── 5. Parse Anthropic response body ───────────────────────────────────
    let data;
    try {
      data = await apiRes.json();
    } catch (parseErr) {
      console.error("Failed to parse Anthropic response body:", parseErr.message);
      return Response.json(fallbackEntry(char, "Could not look up this character."));
    }

    // ── 6. Extract tool_use block ───────────────────────────────────────────
    const toolBlock = Array.isArray(data.content)
      ? data.content.find(b => b.type === "tool_use" && b.name === "lookup_character")
      : null;

    if (!toolBlock) {
      console.error("No tool_use block. stop_reason:", data.stop_reason,
        "content types:", data.content?.map(b => b.type));
      return Response.json(fallbackEntry(char, "Could not look up this character."));
    }

    return Response.json(toolBlock.input);

  } catch (err) {
    // Catch-all: should never reach here, but guarantees a well-formed entry
    console.error("Unhandled error in /api/lookup:", err?.message, err?.stack);
    return Response.json(fallbackEntry(char, "Could not look up this character."));
  }
}
