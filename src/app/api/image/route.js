export async function POST(request) {
  const { prompt } = await request.json();

  const fullPrompt = prompt +
    ", traditional Chinese children's picture book illustration, soft diffused brushwork watercolor with no hard outlines, warm palette of vermillion red and golden yellow and amber and warm ivory, cute round-faced chibi character design with expressive eyes, minimal simple background with flat color washes, Chinese folk art inspired, tender and cozy mood";

  const res = await fetch("https://fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: {
      "Authorization": `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      negative_prompt: "hard outlines, sharp edges, dark backgrounds, cool colors, blue tones, photorealistic, 3D render, western cartoon, anime, manga, complex cluttered background, duplicate characters, multiple copies of same character, clones, extra limbs, text, watermark",
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
