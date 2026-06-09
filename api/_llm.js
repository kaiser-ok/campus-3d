// Shared LLM backend routing.
// Imported by both the Vite dev-server middleware (vite.config.js) and the
// Vercel serverless functions (api/analyze-image.js, api/chat.js) so local dev
// and production behave identically. Files prefixed with "_" are not exposed
// as routes by Vercel.

const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || 'http://192.168.30.46:8000';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'google/gemma-4-31B-it';

const OPENROUTER_URL = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

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

// ── OpenRouter (OpenAI-compatible, multi-model routing) ──────────────────────

async function openrouterChat(messages, maxTokens = 2000) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY 未設定');
  const response = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'School WiFi 3D Campus Map',
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, max_tokens: maxTokens, messages }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `OpenRouter HTTP ${response.status}`);
  return data.choices?.[0]?.message?.content ?? '';
}

async function callOpenrouter(imageBase64, mediaType, prompt) {
  return openrouterChat([{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
      { type: 'text', text: prompt },
    ],
  }]);
}

async function callOpenrouterText(prompt) {
  return openrouterChat([{ role: 'user', content: prompt }], 1500);
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

// ── Dispatchers ──────────────────────────────────────────────────────────────

export async function analyzeImage(backend, imageBase64, mediaType, prompt) {
  const byBackend = {
    claude: () => callClaude(imageBase64, mediaType, prompt),
    openrouter: () => callOpenrouter(imageBase64, mediaType, prompt),
    gemma: () => callGemma(imageBase64, mediaType, prompt),
  };
  return (byBackend[backend] || byBackend.gemma)();
}

export async function chatText(backend, prompt) {
  const byBackend = {
    claude: () => callClaudeText(prompt),
    openrouter: () => callOpenrouterText(prompt),
    gemma: () => callGemmaText(prompt),
  };
  return (byBackend[backend] || byBackend.gemma)();
}
