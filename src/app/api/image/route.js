// Without this, serverless platforms default to a short timeout (e.g. 10-15s
// on Vercel) — fine for a single Segmind call, but panels 2+ now make two
// sequential calls (fetch the anchor image, then a full Flux IP-Adapter
// generation), which combined with GPU queueing under concurrent panel
// requests can easily exceed that default and get killed mid-request.
export const maxDuration = 300;

const STYLE_TAG = ", cute watercolor cartoon children's book illustration, soft rounded chibi proportions with a big head and small body, large sparkling expressive eyes, gentle soft-edged watercolor washes, warm inviting palette, simple clean minimal background, whimsical and tender mood, Chinese picture-book inspired, adorable and child-friendly";

const NEGATIVE_PROMPT = "realistic proportions, adult body, adult face, mature facial features, gaunt face, long adult limbs, fine art painting, gallery painting, photorealistic, hyper-detailed rendering, 3D render, flat vector art, hard uniform outlines, dark backgrounds, cool colors, blue tones, anime, manga, complex cluttered background, duplicate characters, multiple copies of same character, clones, extra limbs, text, watermark";

// How strongly panels 2+ follow the panel-1 reference vs. their own scene prompt.
// Higher = more consistent character, but risks dragging along panel 1's pose/composition.
const ADAPTER_STRENGTH = 0.65;

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
    return base64;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Empty image returned from Segmind");
  return buf.toString("base64");
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
      steps: 28,
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

// Panels 2+: Flux IP-Adapter, feeding panel 1's own image back in as the
// reference so the character stays visually consistent across the story.
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
      steps: 28,
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

// Panel 1's own output is reused as the character reference for every later
// panel. Uploading it once via Segmind's own asset storage means the client
// only ever carries a short URL as `anchorUrl` instead of resending the full
// multi-MB base64 image on every one of the (up to 15) concurrent panel calls.
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
  const url = data.file_urls?.[0] || data.urls?.[0] || data.url;
  if (!url) throw new Error(`Segmind storage upload returned no URL. Response keys: ${Object.keys(data).join(", ")}`);
  return url;
}

// anchorUrl always originates from our own uploadToSegmindStorage() call and
// is only ever echoed back by the client verbatim — but since it's still a
// client-supplied field on a public route, restrict what the server will
// actually fetch to Segmind's own domains rather than trusting it blindly
// (an unrestricted server-side fetch of a client-given URL is an SSRF vector).
function isAllowedSegmindUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && /(^|\.)segmind\.com$/.test(hostname);
  } catch {
    return false;
  }
}

async function fetchAsBase64(url) {
  const res = await fetch(url, {
    headers: { "x-api-key": process.env.SEGMIND_API_KEY },
  });
  if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Reference image fetch returned no data");
  return buf.toString("base64");
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
  if (anchorUrl && !isAllowedSegmindUrl(anchorUrl)) {
    return Response.json({ error: "Invalid reference image URL." }, { status: 400 });
  }

  try {
    if (anchorUrl) {
      // anchorUrl is panel 1's own hosted URL — fetch it once per call rather
      // than trust the client to resend the full image bytes each time.
      const referenceBase64 = await fetchAsBase64(anchorUrl);
      const base64 = await generateReferencedImage(prompt, referenceBase64);
      return Response.json({ url: `data:image/png;base64,${base64}` });
    }

    // Panel 1: generate with no reference, then upload the result so every
    // later panel can reuse it as a compact URL instead of a multi-MB blob.
    const base64 = await generateBaseImage(prompt);
    const url = await uploadToSegmindStorage(base64, "image/png");
    return Response.json({ url });
  } catch (err) {
    // Log the raw diagnostic (can include Segmind response internals) server-side
    // only, matching /api/generate's error-sanitization — never forward it as-is.
    console.error("Image generation failed:", err?.message);
    return Response.json({ error: "Could not generate this illustration. Please try again." }, { status: 500 });
  }
}
