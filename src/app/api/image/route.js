// Without this, serverless platforms default to a short timeout (e.g. 10-15s
// on Vercel) — image generation plus GPU queueing under up to 15 concurrent
// panel requests can push past that default and get killed mid-request.
export const maxDuration = 300;

const STYLE_TAG = ", cute watercolor cartoon children's book illustration, soft rounded chibi proportions with a big head and small body, large sparkling expressive eyes, gentle soft-edged watercolor washes, warm inviting palette, simple clean minimal background, whimsical and tender mood, Chinese picture-book inspired, adorable and child-friendly";

const NEGATIVE_PROMPT = "realistic proportions, adult body, adult face, mature facial features, gaunt face, long adult limbs, fine art painting, gallery painting, photorealistic, hyper-detailed rendering, 3D render, flat vector art, hard uniform outlines, dark backgrounds, cool colors, blue tones, anime, manga, complex cluttered background, duplicate characters, multiple copies of same character, clones, extra limbs, text, watermark";

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

// Neolemon V3 generates every panel. With no ip_image, it generates the
// initial character from text alone; with ip_image set to a URL, it
// generates a new scene using that character as reference — Segmind's own
// servers fetch the URL, we never have to (unlike Flux IP-Adapter, which
// rejected a URL and needed the actual base64 bytes sent directly).
async function generateNeolemonImage(prompt, ipImageUrl) {
  const body = {
    prompt: prompt + STYLE_TAG,
    negative_prompt: NEGATIVE_PROMPT,
    steps: 20,
    guidance_scale: 3,
    width: 1024,
    height: 768,
    seed: Math.floor(Math.random() * 2147483647),
    base64: true,
  };
  if (ipImageUrl) body.ip_image = ipImageUrl;

  const res = await fetch("https://api.segmind.com/v1/consistent-character-AI-neolemon-v3", {
    method: "POST",
    headers: {
      "x-api-key": process.env.SEGMIND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return readSegmindImage(res);
}

// Used only to hand panel 1's image to later panels as a compact reference —
// the browser never sees this URL (see POST handler).
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
// rather than allowlisting a specific hostname we've never actually confirmed.
function isSafeReferenceUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return !/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/i.test(hostname);
  } catch {
    return false;
  }
}

// Tags a thrown error with which stage produced it, so a failure is
// diagnosable from the client-visible response alone.
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
    const { base64, contentType } = await runStage(
      anchorUrl ? "generate_referenced" : "generate_base",
      () => generateNeolemonImage(prompt, anchorUrl)
    );

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
