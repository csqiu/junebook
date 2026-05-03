const STYLE_TAG = ", loose ink and wash children's book illustration, expressive flowing ink brushwork with watercolor washes that bleed beyond the lines, spontaneous gestural painting, warm palette of amber and terracotta and ink black with golden accents, cute round-faced character design, minimal airy background, traditional Chinese ink wash painting inspired, painterly and tender mood";

// Generate panel 1 via fal.ai flux/dev to get a publicly accessible URL
// that can then be used as Neolemon's ip_image character reference.
async function generateAnchorImage(prompt) {
  const res = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: {
      "Authorization": `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt + STYLE_TAG,
      negative_prompt: "flat vector art, hard uniform outlines, dark backgrounds, cool colors, blue tones, photorealistic, 3D render, western cartoon, anime, manga, complex cluttered background, duplicate characters, multiple copies of same character, clones, extra limbs, text, watermark",
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

// Generate panels 2+ via Neolemon V3 with ip_image = panel 1 URL
async function generateConsistentImage(prompt, ipImageUrl) {
  const res = await fetch("https://api.segmind.com/v1/consistent-character-AI-neolemon-v3", {
    method: "POST",
    headers: {
      "x-api-key": process.env.SEGMIND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt + STYLE_TAG,
      ip_image: ipImageUrl,
      steps: 20,
      guidance_scale: 3,
      width: 1024,
      height: 768,
      seed: Math.floor(Math.random() * 2147483647),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Segmind error: ${res.status}`);
  }
  const data = await res.json();
  const base64 = data.image;
  if (!base64) throw new Error("No image returned from Segmind");
  return `data:image/png;base64,${base64}`;
}

export async function POST(request) {
  const { prompt, anchorUrl } = await request.json();

  try {
    if (anchorUrl) {
      // Panels 2+: use Neolemon with panel 1 as character reference
      const url = await generateConsistentImage(prompt, anchorUrl);
      return Response.json({ url });
    } else {
      // Panel 1: generate via fal.ai to produce a public URL for ip_image
      const url = await generateAnchorImage(prompt);
      return Response.json({ url });
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
