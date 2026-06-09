// Vercel serverless function: vision analysis for floor-plan import.
// Mirrors the /api/analyze-image route served by Vite middleware in local dev.
import { analyzeImage } from './_llm.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({});
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { backend = 'gemma', imageBase64, mediaType = 'image/jpeg', prompt } = body;
    const text = await analyzeImage(backend, imageBase64, mediaType, prompt);
    res.status(200).json({ text });
  } catch (err) {
    console.error('[analyze-image]', err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
