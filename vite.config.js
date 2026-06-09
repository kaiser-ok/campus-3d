import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { analyzeImage, chatText } from './api/_llm.js';

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

// ── Vite plugin ──────────────────────────────────────────────────────────────
// Backend routing lives in api/_llm.js so dev middleware and the Vercel
// serverless functions (api/analyze-image.js, api/chat.js) stay in sync.

function aiProxyPlugin() {
  return {
    name: 'ai-proxy',
    configureServer(server) {
      // Vision: floor plan analysis
      server.middlewares.use('/api/analyze-image', async (req, res) => {
        if (req.method !== 'POST') return respond(res, 405, {});
        try {
          const { backend = 'gemma', imageBase64, mediaType = 'image/jpeg', prompt } = await readBody(req);
          const text = await analyzeImage(backend, imageBase64, mediaType, prompt);
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
          const text = await chatText(backend, prompt);
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
