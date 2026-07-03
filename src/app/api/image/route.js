const STYLE_TAG = ", cute watercolor cartoon children's book illustration, soft rounded chibi proportions with a big head and small body, large sparkling expressive eyes, gentle soft-edged watercolor washes, warm inviting palette, simple clean minimal background, whimsical and tender mood, Chinese picture-book inspired, adorable and child-friendly";

const NEGATIVE_PROMPT = "realistic proportions, adult body, adult face, mature facial features, gaunt face, long adult limbs, fine art painting, gallery painting, photorealistic, hyper-detailed rendering, 3D render, flat vector art, hard uniform outlines, dark backgrounds, cool colors, blue tones, anime, manga, complex cluttered background, duplicate characters, multiple copies of same character, clones, extra limbs, text, watermark";

async function readSegmindImage(res) {
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    // Error responses come back as JSON even when success responses are raw image bytes
    const err = contentType.includes("application/json") ? await res.json().catch(() => ({})) : {};
    throw new Error(err.message || err.error || `Segmind error: ${res.status}`);
  }

  // On success Segmind returns the image as raw bytes (image/jpeg, image/png, ...)
  // rather than JSON — only decode as JSON if it actually says so.
  if (contentType.includes("application/json")) {
    const data = await res.json();
    const base64 = data.image;
    if (!base64) throw new Error("No image returned from Segmind");
    return { base64, contentType: "image/png" };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), contentType: contentType || "image/jpeg" };
}

// Neolemon V3 generates every panel. Panel 1 has no reference (ip_image
// omitted) and establishes the character; panels 2+ pass panel 1's own
// output back in as ip_image so the character stays visually consistent.
async function generateImage(prompt, ipImage) {
  const body = {
    prompt: prompt + STYLE_TAG,
    negative_prompt: NEGATIVE_PROMPT,
    steps: 20,
    guidance_scale: 3,
    width: 1024,
    height: 768,
    seed: Math.floor(Math.random() * 2147483647),
  };
  if (ipImage) body.ip_image = ipImage;

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

// Neolemon's ip_image parameter needs a real hosted URL, not a base64 blob —
// this is what fal.ai used to provide for panel 1 before it was removed.
// Segmind's own asset storage fills the same role without adding another
// image provider: upload panel 1's own output, get back a URL, and use that
// as ip_image for every later panel.
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

export async function POST(request) {
  const { prompt, anchorUrl } = await request.json();

  try {
    if (anchorUrl) {
      // Panels 2+: anchorUrl is already a real hosted URL from panel 1's upload
      const { base64, contentType } = await generateImage(prompt, anchorUrl);
      return Response.json({ url: `data:${contentType};base64,${base64}` });
    }

    // Panel 1: generate with no reference, then upload the result so it can
    // be reused as ip_image for every subsequent panel.
    const { base64, contentType } = await generateImage(prompt, null);
    const url = await uploadToSegmindStorage(base64, contentType);
    return Response.json({ url });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
