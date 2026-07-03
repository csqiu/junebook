import { CLAUDE_MODEL } from "./constants";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Calls Claude with a single forced tool_use so the response is guaranteed to
// match `tool.input_schema` — no freeform JSON parsing required. Never throws;
// every failure mode (network, HTTP, parsing, missing tool_use block, truncation)
// resolves to { ok: false, reason, message } so callers can pick their own
// fallback behavior instead of every route re-implementing this guard chain.
export async function callClaudeTool({ system, tool, messages, maxTokens }) {
  let apiRes;
  try {
    apiRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages,
      }),
    });
  } catch (fetchErr) {
    return { ok: false, reason: "network", message: `Network error reaching AI service: ${fetchErr.message}` };
  }

  if (!apiRes.ok) {
    const errBody = await apiRes.json().catch(() => ({}));
    return { ok: false, reason: "http_error", message: errBody.error?.message || `Anthropic API returned ${apiRes.status}` };
  }

  let data;
  try {
    data = await apiRes.json();
  } catch (parseErr) {
    return { ok: false, reason: "parse_error", message: `Unexpected response from AI: ${parseErr.message}` };
  }

  if (data.stop_reason === "max_tokens") {
    return { ok: false, reason: "max_tokens", message: "Response was too long." };
  }

  const toolBlock = Array.isArray(data.content)
    ? data.content.find(b => b.type === "tool_use" && b.name === tool.name)
    : null;

  if (!toolBlock) {
    return {
      ok: false,
      reason: "no_tool_block",
      message: `AI did not return the expected ${tool.name} structure.`,
      debug: { stop_reason: data.stop_reason, contentTypes: data.content?.map(b => b.type) },
    };
  }

  return { ok: true, result: toolBlock.input };
}
