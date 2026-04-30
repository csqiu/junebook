export async function POST(request) {
  const { prompt } = await request.json();

  const fullPrompt = prompt +
    ", children's picture book illustration, soft watercolor style, pastel colors, warm and gentle, cute friendly characters, simple clean background, Studio Ghibli inspired, age 2-6";

  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: {
      "Authorization": `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      image_size: "landscape_4_3",
      num_inference_steps: 4,
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
