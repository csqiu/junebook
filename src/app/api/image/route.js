export async function POST(request) {
  const { prompt } = await request.json();

  const fullPrompt = prompt +
    ", loose ink and wash children's book illustration, expressive flowing ink brushwork with watercolor washes that bleed beyond the lines, spontaneous gestural painting, warm palette of amber and terracotta and ink black with golden accents, cute round-faced character design, minimal airy background, traditional Chinese ink wash painting inspired, painterly and tender mood";

  const res = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: {
      "Authorization": `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: fullPrompt,
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
    return Response.json(
      { error: err.message || err.detail || `fal.ai error: ${res.status}` },
      { status: 500 }
    );
  }

  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) {
    return Response.json({ error: "No image URL returned from fal.ai" }, { status: 500 });
  }

  return Response.json({ url });
}
