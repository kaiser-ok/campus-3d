import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || 'http://192.168.30.46:8000';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'google/gemma-4-31B-it';

async function readBody(req) {
  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', resolve);
    req.on('error', reject);
  });
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

function respond(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body, 'utf-8'),
  });
  res.end(body);
}

// ── Gemma (OpenAI-compatible) ────────────────────────────────────────────────

async function gemmaChat(messages, maxTokens = 2000) {
  const response = await fetch(`${LOCAL_LLM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LOCAL_LLM_MODEL, max_tokens: maxTokens, messages }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Gemma HTTP ${response.status}`);
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemma(imageBase64, mediaType, prompt) {
  return gemmaChat([{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
      { type: 'text', text: prompt },
    ],
  }]);
}

async function callGemmaText(prompt) {
  return gemmaChat([{ role: 'user', content: prompt }], 1500);
}

// ── Claude (Anthropic) ───────────────────────────────────────────────────────

async function claudeApi(messages, maxTokens = 2000) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: maxTokens, messages }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Claude HTTP ${response.status}`);
  return data.content?.[0]?.text ?? '';
}

async function callClaude(imageBase64, mediaType, prompt) {
  return claudeApi([{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
      { type: 'text', text: prompt },
    ],
  }]);
}

async function callClaudeText(prompt) {
  return claudeApi([{ role: 'user', content: prompt }], 1500);
}

// ── Vite plugin ──────────────────────────────────────────────────────────────

function aiProxyPlugin() {
  return {
    name: 'ai-proxy',
    configureServer(server) {
      // Vision: floor plan analysis
      server.middlewares.use('/api/analyze-image', async (req, res) => {
        if (req.method !== 'POST') return respond(res, 405, {});
        try {
          const { backend = 'gemma', imageBase64, mediaType = 'image/jpeg', prompt } = await readBody(req);
          const text = backend === 'claude'
            ? await callClaude(imageBase64, mediaType, prompt)
            : await callGemma(imageBase64, mediaType, prompt);
          respond(res, 200, { text });
        } catch (err) {
          console.error('[analyze-image]', err);
          respond(res, 500, { error: err.message || String(err) });
        }
      });

      // Text-only: network analysis
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') return respond(res, 405, {});
        try {
          const { backend = 'gemma', prompt } = await readBody(req);
          const text = backend === 'claude'
            ? await callClaudeText(prompt)
            : await callGemmaText(prompt);
          respond(res, 200, { text });
        } catch (err) {
          console.error('[chat]', err);
          respond(res, 500, { error: err.message || String(err) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), aiProxyPlugin()],
});
