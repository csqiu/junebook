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
      base64: true,
    }),
  });

  return readSegmindImage(res);
}

// The client sends back whatever panel 1 returned as `anchorUrl` for every
// later panel — that's a data: URI (see below), so strip it back down to the
// raw base64 payload the API itself expects.
function stripDataUriPrefix(value) {
  const match = /^data:[^,]*;base64,(.*)$/s.exec(value);
  return match ? match[1] : value;
}

export async function POST(request) {
  const { prompt, anchorUrl } = await request.json();

  try {
    const base64 = anchorUrl
      ? await generateReferencedImage(prompt, stripDataUriPrefix(anchorUrl))
      : await generateBaseImage(prompt);
    return Response.json({ url: `data:image/png;base64,${base64}` });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
