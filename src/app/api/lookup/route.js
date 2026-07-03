import { callClaudeTool } from "../../../lib/anthropic";

function fallbackEntry(char, definition) {
  return { character: char, pinyin: "—", definition, example_chinese: "", example_english: "" };
}

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

export async function POST(request) {
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

  const callResult = await callClaudeTool({
    system: "You are a Chinese-English dictionary for a children's picture book app.",
    tool: lookupTool,
    messages: [{ role: "user", content: `Give me the dictionary entry for the Chinese character/word "${char}".` }],
    maxTokens: 300,
  });

  if (!callResult.ok) {
    console.error("Lookup failed:", callResult);
    return Response.json(fallbackEntry(char, "Could not look up this character."));
  }

  return Response.json(callResult.result);
}
