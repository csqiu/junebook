const STYLE_TAG = ", loose ink and wash children's book illustration, expressive flowing ink brushwork with watercolor washes that bleed beyond the lines, spontaneous gestural painting, warm palette of amber and terracotta and ink black with golden accents, cute round-faced character design, minimal airy background, traditional Chinese ink wash painting inspired, painterly and tender mood";

async function generateNeolemonImage(prompt, ipImage) {
  const body = {
    prompt: prompt + STYLE_TAG,
    steps: 20,
    guidance_scale: 3,
    width: 1024,
    height: 768,
    seed: Math.floor(Math.random() * 2147483647),
  };

  if (ipImage) {
    // Segmind expects raw base64, not a data URI
    body.ip_image = ipImage.replace(/^data:image\/\w+;base64,/, "");
  }

  const res = await fetch("https://api.segmind.com/v1/consistent-character-AI-neolemon-v3", {
    method: "POST",
    headers: {
      "x-api-key": process.env.SEGMIND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = JSON.stringify(err);
    throw new Error(`Segmind ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const base64 = data.image;
  if (!base64) throw new Error(`Segmind returned no image. Response: ${JSON.stringify(data)}`);
  return `data:image/png;base64,${base64}`;
}

export async function POST(request) {
  const { prompt, anchorUrl } = await request.json();

  try {
    const url = await generateNeolemonImage(prompt, anchorUrl || null);
    return Response.json({ url });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
