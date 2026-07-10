// Without this, serverless platforms default to a short timeout (e.g. 10-15s
// on Vercel) — each panel now makes two or three sequential Segmind calls,
// and GPU queueing under up to 15 concurrent panel requests can push any
// single one past that default and get it killed mid-request.
export const maxDuration = 300;

const STYLE_TAG = ", cute watercolor cartoon children's book illustration, soft rounded chibi proportions with a big head and small body, large sparkling expressive eyes, gentle soft-edged watercolor washes, warm inviting palette, simple clean minimal background, whimsical and tender mood, Chinese picture-book inspired, adorable and child-friendly";

const NEGATIVE_PROMPT = "realistic proportions, adult body, adult face, mature facial features, gaunt face, long adult limbs, fine art painting, gallery painting, photorealistic, hyper-detailed rendering, 3D render, flat vector art, hard uniform outlines, dark backgrounds, cool colors, blue tones, anime, manga, complex cluttered background, duplicate characters, multiple copies of same character, clones, extra limbs, text, watermark";

// How strongly panels 2+ follow the panel-1 reference vs. their own scene prompt.
// Higher = more consistent character, but risks dragging along panel 1's pose/composition.
const ADAPTER_STRENGTH = 0.65;

// Returns { base64, contentType } — tracking the real content type (rather
// than assuming PNG) matters because it gets re-declared when uploading to
// Segmind storage; a mislabeled data: URI risks a corrupt/rejected upload.
async function readSegmindImage(res) {
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    // Error responses come back as JSON even when success responses are raw image bytes
    const err = contentType.includes("application/json") ? await res.json().catch(() => ({})) : {};
    throw new Error(err.message || err.error || `Segmind error: ${res.status}`);
  }

  // Success can come back as raw image bytes or as JSON with a base64 field —
  // requesting base64:true below biases toward JSON, but handle either.
  if (contentType.includes("application/json")) {
    const data = await res.json();
    const base64 = data.image;
    if (!base64) throw new Error("No image returned from Segmind");
    return { base64, contentType: "image/png" };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Empty image returned from Segmind");
  return { base64: buf.toString("base64"), contentType: contentType || "image/png" };
}

// Panel 1: Flux Dev, plain text-to-image — this is the same model that reliably
// hit the intended watercolor/ink-wash style when it ran through fal.ai, now
// called directly on Segmind instead of pulling in a second provider.
async function generateBaseImage(prompt) {
  const res = await fetch("https://api.segmind.com/v1/flux-dev", {
    method: "POST",
    headers: {
      "x-api-key": process.env.SEGMIND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt + STYLE_TAG,
      negative_prompt: NEGATIVE_PROMPT,
      steps: 20,
      guidance_scale: 3.5,
      width: 1024,
      height: 768,
      seed: Math.floor(Math.random() * 2147483647),
      enable_safety_checker: true,
      base64: true,
    }),
  });

  return readSegmindImage(res);
}

// Panels 2+: Flux IP-Adapter, feeding panel 1's own image data back in as the
// reference so the character stays visually consistent across the story.
// flux-ipadapter's `image` field rejects a URL ("The string did not match
// the expected pattern") — confirmed live — so this needs the actual base64
// bytes, unlike Neolemon's ip_image which took a URL.
async function generateReferencedImage(prompt, referenceBase64) {
  const res = await fetch("https://api.segmind.com/v1/flux-ipadapter", {
    method: "POST",
    headers: {
      "x-api-key": process.env.SEGMIND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt + STYLE_TAG,
      negative_prompt: NEGATIVE_PROMPT,
      image: referenceBase64,
      adapter_strength: ADAPTER_STRENGTH,
      steps: 20,
      guidance_scale: 3.5,
      width: 1024,
      height: 768,
      seed: Math.floor(Math.random() * 2147483647),
      enable_safety_checker: true,
      base64: true,
    }),
  });

  return readSegmindImage(res);
}

// Used only to hand panel 1's image to later panels as a compact reference —
// the browser never sees this URL (see POST handler). Restored the full
// candidate-key fallback list that an earlier commit (7037870) confirmed was
// needed live; a later rewrite-from-memory accidentally narrowed it to just
// three keys, silently dropping two that had been verified necessary.
async function uploadToSegmindStorage(base64, contentType) {
  const res = await fetch("https://workflows-api.segmind.com/upload-asset", {
    method: "POST",
    headers: {
      "x-api-key": process.env.SEGMIND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data_urls: [`data:${contentType};base64,${base64}`] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Segmind storage upload error: ${res.status}`);
  }

  const data = await res.json();
  const url = data.file_urls?.[0] || data.urls?.[0] || data.url || data.data_urls?.[0] || data.assets?.[0]?.url;
  if (!url) throw new Error(`Segmind storage upload returned no URL. Response keys: ${Object.keys(data).join(", ")}`);
  return url;
}

// anchorUrl always originates from our own uploadToSegmindStorage() call and
// is only ever echoed back by the client verbatim — but since it's still a
// client-supplied field on a public route, block obviously-internal targets
// rather than allowlisting a specific hostname we've never actually confirmed
// (an earlier *.segmind.com-only allowlist risked silently rejecting a
// legitimate asset URL on a different host, e.g. a CDN Segmind fronts).
function isSafeReferenceUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return !/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/i.test(hostname);
  } catch {
    return false;
  }
}

async function fetchAsBase64(url) {
  const res = await fetch(url, {
    headers: { "x-api-key": process.env.SEGMIND_API_KEY },
  });
  if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Reference image fetch returned no data");
  return { base64: buf.toString("base64"), contentType };
}

// Tags a thrown error with which stage produced it, so a failure is
// diagnosable from the client-visible response alone — every architecture
// change made earlier this session was a guess based on an ambiguous "load
// failed" browser message with no way to tell which of 2-3 sequential
// Segmind calls actually failed.
async function runStage(name, fn) {
  try {
    return await fn();
  } catch (err) {
    throw Object.assign(new Error(err.message), { stage: name });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { prompt, anchorUrl } = body || {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    return Response.json({ error: "Missing illustration prompt." }, { status: 400 });
  }
  if (anchorUrl && !isSafeReferenceUrl(anchorUrl)) {
    return Response.json({ error: "Invalid reference image URL.", stage: "validate_anchor" }, { status: 400 });
  }

  try {
    let base64, contentType;
    if (anchorUrl) {
      const reference = await runStage("fetch_reference", () => fetchAsBase64(anchorUrl));
      ({ base64, contentType } = await runStage("generate_referenced", () => generateReferencedImage(prompt, reference.base64)));
    } else {
      ({ base64, contentType } = await runStage("generate_base", () => generateBaseImage(prompt)));
    }

    // The browser only ever gets a data: URI (no network fetch, no auth
    // needed) — it never touches the Segmind storage URL directly. Only
    // panel 1's image needs to become a reusable reference, so only that
    // path uploads and returns an anchorUrl for the client to pass along.
    const response = { url: `data:${contentType};base64,${base64}` };
    if (!anchorUrl) {
      response.anchorUrl = await runStage("upload", () => uploadToSegmindStorage(base64, contentType));
    }
    return Response.json(response);
  } catch (err) {
    // Log the raw diagnostic (can include Segmind response internals) server-side
    // only, matching /api/generate's error-sanitization — never forward it as-is.
    // The stage name itself is safe to return to the client, unlike err.message.
    console.error(`Image generation failed at stage "${err.stage || "unknown"}":`, err.message);
    return Response.json(
      { error: "Could not generate this illustration. Please try again.", stage: err.stage || "unknown" },
      { status: 500 }
    );
  }
}
