// Vercel serverless function: text-only network analysis.
// Mirrors the /api/chat route served by Vite middleware in local dev.
import { chatText } from './_llm.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({});
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { backend = 'gemma', prompt } = body;
    const text = await chatText(backend, prompt);
    res.status(200).json({ text });
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
