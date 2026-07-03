# 小故事书 · Chinese Picture Book Generator

## Deploy to Vercel (5 minutes)

### Option A — Drag and drop (easiest)
1. Go to vercel.com and sign up / log in
2. Click **"Add New Project"**
3. Choose **"Upload"** and drag this entire folder
4. Before deploying, add these **Environment Variables**:
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `SEGMIND_API_KEY` = your Segmind key
   - `NEXT_PUBLIC_APP_PASSWORD` = June
5. Click **Deploy**

### Option B — Via GitHub
1. Push this folder to a GitHub repo
2. Import the repo on vercel.com
3. Add the same environment variables above
4. Deploy

## Local development
```bash
npm install
# create .env.local with your keys (see .env.local.example)
npm run dev
```

## Environment Variables
| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (sk-ant-...) |
| `SEGMIND_API_KEY` | Your Segmind API key (powers all illustration generation via Neolemon V3) |
| `NEXT_PUBLIC_APP_PASSWORD` | Password for the app gate (default: June) |
