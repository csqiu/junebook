export async function POST(request) {
  const { char } = await request.json();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: "Return only valid JSON, no markdown.",
      messages: [{
        role: "user",
        content: `Give me the dictionary entry for the Chinese character/word "${char}". Return JSON: {"character":"${char}","pinyin":"...","definition":"...","example_chinese":"...","example_english":"..."}`,
      }],
    }),
  });

  const data = await res.json();
  const text = data.content.map((b) => b.text || "").join("").replace(/```json|```/g, "").trim();

  try {
    return Response.json(JSON.parse(text));
  } catch {
    return Response.json({ character: char, pinyin: "—", definition: "Could not look up this character.", example_chinese: "", example_english: "" });
  }
}
