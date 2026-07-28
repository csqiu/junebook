// Without this, serverless platforms default to a short timeout (e.g. 10-15s
// on Vercel) — image generation plus GPU queueing under concurrent panel
// requests can push past that default and get killed mid-request.
export const maxDuration = 300;

const STYLE_TAG = ", cute watercolor cartoon children's book illustration — a single storybook scene, NOT a character reference sheet or turnaround — soft rounded chibi proportions with a big head and small body, large sparkling expressive eyes, gentle soft-edged watercolor washes, warm inviting palette, simple clean minimal background, whimsical and tender mood, Chinese picture-book inspired, adorable, friendly, and child-friendly storybook character design";

const NEGATIVE_PROMPT = "character reference sheet, character model sheet, turnaround, multiple views, multiple poses, pose sheet, grid layout, neutral studio background, realistic proportions, adult body, adult face, mature facial features, gaunt face, long adult limbs, fine art painting, gallery painting, photorealistic, hyper-detailed rendering, 3D render, flat vector art, hard uniform outlines, dark backgrounds, cool colors, blue tones, anime, manga, complex cluttered background, duplicate characters, multiple copies of same character, clones, extra limbs, text, watermark";

// Panel 1: fal.ai flux/dev, plain text-to-image. Returns a real, publicly
// hosted URL directly — no separate upload step needed, unlike Segmind's
// asset storage — that URL becomes Neolemon's ip_image reference for every
// later panel. This is the original pre-session design: fal.ai was never
// once implicated in a "load failed" report this session (only Segmind
// endpoints were), regardless of which Segmind model was used.
async function generateAnchorImage(prompt) {
  const res = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: {
      "Authorization": `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt + STYLE_TAG,
      negative_prompt: NEGATIVE_PROMPT,
      image_size: "landscape_4_3",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.detail || `fal.ai error: ${res.status}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error("No image URL returned from fal.ai");
  return url;
}

// Panels 2+: Segmind Neolemon V3 with ip_image = panel 1's fal.ai URL —
// Segmind's own servers fetch that URL server-to-server, we never have to.
async function generateConsistentImage(prompt, ipImageUrl) {
  const res = await fetch("https://api.segmind.com/v1/consistent-character-AI-neolemon-v3", {
    method: "POST",
    headers: {
      "x-api-key": process.env.SEGMIND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt + STYLE_TAG,
      negative_prompt: NEGATIVE_PROMPT,
      ip_image: ipImageUrl,
      steps: 20,
      guidance_scale: 5,
      width: 1024,
      height: 768,
      seed: Math.floor(Math.random() * 2147483647),
      base64: true,
    }),
  });

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    const err = contentType.includes("application/json") ? await res.json().catch(() => ({})) : {};
    throw new Error(err.message || err.error || `Segmind error: ${res.status}`);
  }
  if (contentType.includes("application/json")) {
    const data = await res.json();
    if (!data.image) throw new Error("No image returned from Segmind");
    return data.image;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Empty image returned from Segmind");
  return buf.toString("base64");
}

// anchorUrl always originates from our own generateAnchorImage() call and is
// only ever echoed back by the client verbatim — but since it's still a
// client-supplied field on a public route, block obviously-internal targets
// rather than trusting it blindly (this URL is handed to Segmind, which
// fetches it server-side).
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
    if (anchorUrl) {
      // Panels 2+: Neolemon with panel 1 as character reference
      const base64 = await runStage("generate_referenced", () => generateConsistentImage(prompt, anchorUrl));
      return Response.json({ url: `data:image/png;base64,${base64}` });
    }

    // Panel 1: fal.ai returns a real URL directly — used for both display
    // and as the anchor passed to panels 2+, no extra upload step needed.
    const url = await runStage("generate_base", () => generateAnchorImage(prompt));
    return Response.json({ url, anchorUrl: url });
  } catch (err) {
    // Log the raw diagnostic server-side only — never forward it to the
    // client, matching /api/generate's error-sanitization. The stage name
    // itself is safe to return, unlike err.message.
    console.error(`Image generation failed at stage "${err.stage || "unknown"}":`, err.message);
    return Response.json(
      { error: "Could not generate this illustration. Please try again.", stage: err.stage || "unknown" },
      { status: 500 }
    );
  }
}
