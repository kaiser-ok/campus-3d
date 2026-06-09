import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Cpu, Download, FolderOpen, Pencil, RefreshCw, X } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function renderPdfPage(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const baseVp = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, 1800 / baseVp.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PDF 轉換失敗'))), 'image/jpeg', 0.92);
  });
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CAMPUS = { width: 92, depth: 130 };
const ACCENT_OPTIONS = ['#617180', '#687985', '#72808b', '#697987', '#737c88', '#8a7b67', '#64798a', '#667983'];
const STEP_LABELS = ['上傳底圖', 'AI 標記', '確認資料', '預覽套用'];

// LLM prompt — asks for bounding boxes + metadata in one shot
const AI_DETECT_PROMPT = `你是校園平面圖分析 AI。請仔細分析這張學校校園俯視平面圖，自動識別圖中所有獨立的建築物或建築區塊。

對每棟建築，提供以下資訊：
- box：在圖片中的正規化座標 [nx, ny, nw, nd]
    nx = 建築左邊緣 x 座標 ÷ 圖片總寬度（0.0 ~ 1.0）
    ny = 建築上邊緣 y 座標 ÷ 圖片總高度（0.0 ~ 1.0）
    nw = 建築寬度 ÷ 圖片總寬度
    nd = 建築高度（深度）÷ 圖片總高度
- name：建築名稱（繁體中文，圖上有文字則使用，否則根據外觀描述）
- floors：地上樓層數（無法確定則估計為 4）
- basements：地下樓層數（0 或 1）
- rooms：各樓層可見的教室或空間名稱（僅填圖上可讀到的文字，讀不到則留空物件 {}）

重要判斷規則：
- 只標記真正的建築物，不要標記操場、球場、道路、停車場、校門、圍牆、綠地或空白區域。
- box 必須貼近建築外框，不要把相鄰建築、走廊或中庭一起包進去。
- 如果建築是 L 型、T 型、ㄇ 型、斜角、或與其他建築交錯，請拆成 2~3 個較小的矩形區塊，各自用相同建築名稱加上「A區」「B區」。
- 若文字標籤跨到其他建築或空地，不要因為文字範圍而放大 box。
- 若建築只有一排教室或房間，box 高度必須貼齊該排建築外牆，不要把下方空白區、中庭、廣場或走廊一起框入；例如「教學大樓A區」若只有上方教室列，就只框上方建築列。
- 相鄰建築的 box 不應互相重疊；若不確定邊界，寧可略小也不要過大。

只回傳以下 JSON 格式，不含任何說明、markdown 或程式碼區塊：
{"buildings":[{"name":"建築名稱","box":[0.1,0.05,0.15,0.3],"floors":4,"basements":1,"rooms":{"1":["101","102"],"2":["201","202"]}}]}`;


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function boxArea(box) {
  return Math.max(0, box.nw) * Math.max(0, box.nd);
}

function intersection(a, b) {
  const x1 = Math.max(a.nx, b.nx);
  const y1 = Math.max(a.ny, b.ny);
  const x2 = Math.min(a.nx + a.nw, b.nx + b.nw);
  const y2 = Math.min(a.ny + a.nd, b.ny + b.nd);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  return { w, h, area: w * h };
}

function isLikelyNonBuildingName(name = '') {
  return /球場|操場|跑道|停車|道路|校門|圍牆|綠地|練習場/.test(String(name));
}


function stripCodeFence(text = '') {
  return String(text)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function extractBalancedJsonObject(rawText = '') {
  const text = stripCodeFence(rawText);
  const start = text.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start);
}

function repairJsonLikeText(rawText = '') {
  return rawText
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/，/g, ',')
    .replace(/：/g, ':')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value) => `"${value.replace(/"/g, '\\"')}"`)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/}\s*{/g, '},{')
    .replace(/("|\]|\}|\d|true|false|null)\s+(?="(?:name|box|floors|basements|rooms|buildings)"\s*:)/g, '$1,');
}

function parseFallbackBuildingObject(rawObject = '') {
  const boxMatch = rawObject.match(/"?box"?\s*:\s*\[([^\]]+)\]/i);
  if (!boxMatch) return null;
  const box = boxMatch[1].split(',').map((value) => Number(value.trim())).filter(Number.isFinite);
  if (box.length !== 4) return null;
  const nameMatch = rawObject.match(/"?name"?\s*:\s*"([^"]+)"/i) || rawObject.match(/"?name"?\s*:\s*([^,}\]]+)/i);
  const floorsMatch = rawObject.match(/"?floors"?\s*:\s*(\d+)/i);
  const basementsMatch = rawObject.match(/"?basements"?\s*:\s*(\d+)/i);
  return {
    name: nameMatch ? String(nameMatch[1]).trim().replace(/^['"]|['"]$/g, '') : '',
    box,
    floors: floorsMatch ? Number(floorsMatch[1]) : 4,
    basements: basementsMatch ? Number(basementsMatch[1]) : 0,
    rooms: {},
  };
}

// Collect every balanced { } object, including nested ones. This recovers the
// inner building objects even when the surrounding {"buildings":[ ... ]} wrapper
// is truncated and never closes — the common cause of "Expected ']'" failures.
function collectNestedBalancedObjects(rawText = '') {
  const objects = [];
  const starts = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < rawText.length; i += 1) {
    const char = rawText[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') {
      starts.push(i);
    } else if (char === '}' && starts.length) {
      objects.push(rawText.slice(starts.pop(), i + 1));
    }
  }

  return objects;
}

function salvageBuildingDetections(rawText = '') {
  const repaired = repairJsonLikeText(extractBalancedJsonObject(rawText) || rawText);
  // Prefer leaf building objects: contain a box, but are not the wrapper object
  // (which carries the "buildings" key).
  const objects = collectNestedBalancedObjects(repaired)
    .filter((objectText) => /"?box"?\s*:/.test(objectText) && !/"?buildings"?\s*:/.test(objectText));
  return objects.map((objectText) => {
    try {
      return JSON.parse(repairJsonLikeText(objectText));
    } catch {
      return parseFallbackBuildingObject(objectText);
    }
  }).filter(Boolean);
}

function parseAiDetectionJson(rawText = '') {
  const extracted = extractBalancedJsonObject(rawText);
  if (!extracted) throw new Error('AI 回傳格式無法解析，請重試');

  const attempts = [extracted, repairJsonLikeText(extracted)];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      return Array.isArray(parsed) ? { buildings: parsed } : parsed;
    } catch (error) {
      lastError = error;
    }
  }

  const salvaged = salvageBuildingDetections(rawText);
  if (salvaged.length > 0) return { buildings: salvaged };
  throw new Error(`AI 回傳 JSON 格式不完整，已嘗試修復仍失敗：${lastError?.message || 'unknown parse error'}`);
}

function normalizeBox(box) {
  const nx = clamp(box.nx, 0, 0.985);
  const ny = clamp(box.ny, 0, 0.985);
  return {
    ...box,
    nx,
    ny,
    nw: clamp(box.nw, 0.012, 1 - nx),
    nd: clamp(box.nd, 0.012, 1 - ny),
  };
}

function resolveBoxOverlaps(rawBoxes) {
  const boxes = rawBoxes
    .map(normalizeBox)
    .filter((box) => boxArea(box) >= 0.00028)
    .map((box) => ({ ...box }));
  const pad = 0.004;

  for (let iter = 0; iter < 8; iter += 1) {
    let changed = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const hit = intersection(a, b);
        if (!hit.area) continue;

        const areaA = boxArea(a);
        const areaB = boxArea(b);
        const smallerArea = Math.min(areaA, areaB);
        if (hit.area / smallerArea < 0.11) continue;

        const big = areaA >= areaB ? a : b;
        const small = big === a ? b : a;
        const bigCx = big.nx + big.nw / 2;
        const bigCy = big.ny + big.nd / 2;
        const smallCx = small.nx + small.nw / 2;
        const smallCy = small.ny + small.nd / 2;
        const trimX = hit.w / Math.max(0.001, big.nw);
        const trimY = hit.h / Math.max(0.001, big.nd);

        if (trimX <= trimY) {
          if (smallCx < bigCx) {
            const nextLeft = Math.min(big.nx + big.nw - 0.012, small.nx + small.nw + pad);
            big.nw = big.nx + big.nw - nextLeft;
            big.nx = nextLeft;
          } else {
            big.nw = Math.max(0.012, small.nx - pad - big.nx);
          }
        } else if (smallCy < bigCy) {
          const nextTop = Math.min(big.ny + big.nd - 0.012, small.ny + small.nd + pad);
          big.nd = big.ny + big.nd - nextTop;
          big.ny = nextTop;
        } else {
          big.nd = Math.max(0.012, small.ny - pad - big.ny);
        }
        Object.assign(big, normalizeBox(big));
        changed = true;
      }
    }
    if (!changed) break;
  }

  return boxes;
}


const MIN_BOX_SIZE = 0.012;
const HANDLE_HIT = 8;

function boxToCanvasRect(box, cw, ch) {
  return {
    x: box.nx * cw,
    y: box.ny * ch,
    w: box.nw * cw,
    h: box.nd * ch,
  };
}

function cursorForHandle(handle) {
  if (!handle) return 'default';
  if (handle === 'move') return 'move';
  if (handle === 'n' || handle === 's') return 'ns-resize';
  if (handle === 'e' || handle === 'w') return 'ew-resize';
  if (handle === 'nw' || handle === 'se') return 'nwse-resize';
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  return 'default';
}

function hitTestBoxes(boxes, x, y, cw, ch) {
  for (let i = boxes.length - 1; i >= 0; i -= 1) {
    const box = boxes[i];
    const rect = boxToCanvasRect(box, cw, ch);
    const left = rect.x;
    const top = rect.y;
    const right = rect.x + rect.w;
    const bottom = rect.y + rect.h;
    const handles = [
      ['nw', left, top], ['n', left + rect.w / 2, top], ['ne', right, top],
      ['e', right, top + rect.h / 2], ['se', right, bottom], ['s', left + rect.w / 2, bottom],
      ['sw', left, bottom], ['w', left, top + rect.h / 2],
    ];
    for (const [handle, hx, hy] of handles) {
      if (Math.abs(x - hx) <= HANDLE_HIT && Math.abs(y - hy) <= HANDLE_HIT) {
        return { boxId: box.id, handle };
      }
    }
    const nearEdge = x >= left - HANDLE_HIT && x <= right + HANDLE_HIT && y >= top - HANDLE_HIT && y <= bottom + HANDLE_HIT;
    const inside = x >= left && x <= right && y >= top && y <= bottom;
    if (nearEdge || inside) return { boxId: box.id, handle: 'move' };
  }
  return null;
}

function updateBoxFromInteraction(action, x, y, cw, ch) {
  const dx = (x - action.startX) / cw;
  const dy = (y - action.startY) / ch;
  const start = action.startBox;
  if (action.handle === 'move') {
    return normalizeBox({
      ...start,
      nx: clamp(start.nx + dx, 0, 1 - start.nw),
      ny: clamp(start.ny + dy, 0, 1 - start.nd),
    });
  }

  let left = start.nx;
  let right = start.nx + start.nw;
  let top = start.ny;
  let bottom = start.ny + start.nd;

  if (action.handle.includes('w')) left += dx;
  if (action.handle.includes('e')) right += dx;
  if (action.handle.includes('n')) top += dy;
  if (action.handle.includes('s')) bottom += dy;

  if (right - left < MIN_BOX_SIZE) {
    if (action.handle.includes('w')) left = right - MIN_BOX_SIZE;
    else right = left + MIN_BOX_SIZE;
  }
  if (bottom - top < MIN_BOX_SIZE) {
    if (action.handle.includes('n')) top = bottom - MIN_BOX_SIZE;
    else bottom = top + MIN_BOX_SIZE;
  }

  left = clamp(left, 0, 1 - MIN_BOX_SIZE);
  right = clamp(right, left + MIN_BOX_SIZE, 1);
  top = clamp(top, 0, 1 - MIN_BOX_SIZE);
  bottom = clamp(bottom, top + MIN_BOX_SIZE, 1);

  return normalizeBox({
    ...start,
    nx: left,
    ny: top,
    nw: right - left,
    nd: bottom - top,
  });
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function isStructuralPixel(r, g, b, a) {
  if (a < 32) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = max - min;
  return lum < 172 || (sat > 42 && lum < 238) || (g > r + 24 && b > r + 12 && lum < 245) || (b > r + 28 && lum < 238);
}

function createContentSource(img) {
  if (!img) return null;
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (!naturalW || !naturalH) return null;
  const scale = Math.min(1, 1200 / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

function tightenBoxToImageContent(box, source) {
  if (!source) return normalizeBox(box);
  const x0 = Math.max(0, Math.floor(box.nx * source.width));
  const y0 = Math.max(0, Math.floor(box.ny * source.height));
  const x1 = Math.min(source.width - 1, Math.ceil((box.nx + box.nw) * source.width));
  const y1 = Math.min(source.height - 1, Math.ceil((box.ny + box.nd) * source.height));
  if (x1 <= x0 || y1 <= y0) return normalizeBox(box);

  const stride = Math.max(1, Math.floor(Math.max(x1 - x0, y1 - y0) / 220));
  const xs = [];
  const ys = [];

  for (let y = y0; y <= y1; y += stride) {
    for (let x = x0; x <= x1; x += stride) {
      const idx = (y * source.width + x) * 4;
      if (isStructuralPixel(source.data[idx], source.data[idx + 1], source.data[idx + 2], source.data[idx + 3])) {
        xs.push(x);
        ys.push(y);
      }
    }
  }

  if (xs.length < 36) return normalizeBox(box);
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);

  const left = percentile(xs, 0.025);
  const right = percentile(xs, 0.975);
  const top = percentile(ys, 0.025);
  const bottom = percentile(ys, 0.975);
  const contentW = right - left;
  const contentH = bottom - top;
  if (contentW < 8 || contentH < 8) return normalizeBox(box);

  const padX = Math.max(6, Math.min(20, contentW * 0.08));
  const padY = Math.max(6, Math.min(20, contentH * 0.08));
  const next = normalizeBox({
    ...box,
    nx: (left - padX) / source.width,
    ny: (top - padY) / source.height,
    nw: (contentW + padX * 2) / source.width,
    nd: (contentH + padY * 2) / source.height,
  });

  const oldArea = boxArea(box);
  const newArea = boxArea(next);
  const shrankEnough = newArea < oldArea * 0.86;
  const notTooTiny = newArea > oldArea * 0.16;
  if (shrankEnough && notTooTiny) return next;
  return normalizeBox(box);
}

function tightenBoxesToImageContent(boxes, img) {
  const source = createContentSource(img);
  if (!source) return boxes.map(normalizeBox);
  return boxes.map((box) => tightenBoxToImageContent(box, source));
}

function hasBoxSizeConcern(box) {
  const area = boxArea(box);
  const longSide = Math.max(box.nw, box.nd);
  const shortSide = Math.max(0.001, Math.min(box.nw, box.nd));
  return area > 0.055 || longSide / shortSide > 6.5;
}

// ── DrawStep ─────────────────────────────────────────────────────────────────

function DrawStep({ imageUrl, imageBlob, boxes, setBoxes, aiBackend, setAiBackend }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState(null);
  const [editAction, setEditAction] = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [cursor, setCursor] = useState('default');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => {
    if (selectedBoxId && !boxes.some((box) => box.id === selectedBoxId)) setSelectedBoxId(null);
  }, [boxes, selectedBoxId]);

  // Load image → size canvas to fit
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW = 720, maxH = 430;
      const ar = img.width / img.height;
      if (ar >= maxW / maxH) { canvas.width = maxW; canvas.height = Math.round(maxW / ar); }
      else { canvas.height = maxH; canvas.width = Math.round(maxH * ar); }
      setReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw on every state change
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);

    boxes.forEach((box, i) => {
      const { x, y, w, h } = boxToCanvasRect(box, cw, ch);
      const selected = box.id === selectedBoxId;
      const hovered = box.id === hoverTarget?.boxId;
      const concern = hasBoxSizeConcern(box);
      const stroke = selected ? '#0f766e' : concern ? '#f59e0b' : '#2bb8a5';
      const fill = selected ? 'rgba(20,184,166,0.22)' : concern ? 'rgba(245,158,11,0.16)' : 'rgba(43,184,165,0.15)';
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = selected || hovered ? 3.5 : 2.5;
      ctx.strokeRect(x, y, w, h);

      const label = box.name || `建築 ${i + 1}`;
      ctx.font = 'bold 13px system-ui,sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = concern ? 'rgba(180,83,9,0.9)' : 'rgba(20,119,107,0.88)';
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, Math.min(tw + 10, Math.max(34, w - 6)), 20, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 8, y + 17, Math.max(24, w - 12));

      if (selected) {
        const points = [
          [x, y], [x + w / 2, y], [x + w, y],
          [x + w, y + h / 2], [x + w, y + h], [x + w / 2, y + h],
          [x, y + h], [x, y + h / 2],
        ];
        points.forEach(([hx, hy]) => {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0f766e';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(hx - 4, hy - 4, 8, 8, 2);
          ctx.fill();
          ctx.stroke();
        });
      }
    });

    if (draft) {
      const sx = Math.min(draft.x1, draft.x2), sy = Math.min(draft.y1, draft.y2);
      const sw = Math.abs(draft.x2 - draft.x1), sh = Math.abs(draft.y2 - draft.y1);
      ctx.fillStyle = 'rgba(245,158,11,0.12)';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }

    if (aiLoading) {
      ctx.fillStyle = 'rgba(15,25,28,0.42)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AI 分析圖面中…', cw / 2, ch / 2);
      ctx.textAlign = 'left';
    }
  }); // no deps — reruns after every render

  function canvasPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) * (canvas.width / rect.width), 0, canvas.width),
      y: clamp((e.clientY - rect.top) * (canvas.height / rect.height), 0, canvas.height),
    };
  }

  function onDown(e) {
    if (e.button !== 0 || aiLoading) return;
    const canvas = canvasRef.current;
    const { x, y } = canvasPos(e);
    if (manualMode) {
      setDraft({ x1: x, y1: y, x2: x, y2: y });
      return;
    }

    const hit = hitTestBoxes(boxes, x, y, canvas.width, canvas.height);
    if (!hit) {
      setSelectedBoxId(null);
      return;
    }
    const startBox = boxes.find((box) => box.id === hit.boxId);
    if (!startBox) return;
    setSelectedBoxId(hit.boxId);
    setHoverTarget(hit);
    setCursor(cursorForHandle(hit.handle));
    setEditAction({ boxId: hit.boxId, handle: hit.handle, startX: x, startY: y, startBox: { ...startBox } });
  }

  function onMove(e) {
    if (aiLoading || !ready) return;
    const canvas = canvasRef.current;
    const { x, y } = canvasPos(e);

    if (draft) {
      setDraft((d) => ({ ...d, x2: x, y2: y }));
      return;
    }

    if (editAction) {
      const nextBox = updateBoxFromInteraction(editAction, x, y, canvas.width, canvas.height);
      setBoxes((prev) => prev.map((box) => (box.id === editAction.boxId ? nextBox : box)));
      return;
    }

    if (!manualMode) {
      const hit = hitTestBoxes(boxes, x, y, canvas.width, canvas.height);
      setHoverTarget(hit);
      setCursor(cursorForHandle(hit?.handle));
    }
  }

  function finishDraft() {
    if (!draft) return;
    const { x1, y1, x2, y2 } = draft;
    const cw = canvasRef.current.width, ch = canvasRef.current.height;
    const nx = Math.min(x1, x2) / cw, ny = Math.min(y1, y2) / ch;
    const nw = Math.abs(x2 - x1) / cw, nd = Math.abs(y2 - y1) / ch;
    if (nw > 0.015 && nd > 0.015) {
      const id = `b${Date.now()}`;
      setBoxes(prev => [...prev, {
        id,
        nx, ny, nw, nd,
        name: '',
        floors: 4,
        basements: 0,
        accent: ACCENT_OPTIONS[prev.length % ACCENT_OPTIONS.length],
        rooms: {},
      }]);
      setSelectedBoxId(id);
    }
    setDraft(null);
  }

  function onUp() {
    finishDraft();
    if (editAction) {
      setEditAction(null);
      setHoverTarget(null);
    }
  }

  function tightenCurrentBoxes() {
    const tightened = resolveBoxOverlaps(tightenBoxesToImageContent(boxes, imgRef.current));
    setBoxes(tightened);
    if (!selectedBoxId && tightened[0]) setSelectedBoxId(tightened[0].id);
  }

  async function runAI() {
    if (!imageBlob) return;
    setAiLoading(true);
    setAiError('');
    try {
      const base64 = await blobToBase64(imageBlob);
      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backend: aiBackend,
          imageBase64: base64,
          mediaType: imageBlob.type || 'image/jpeg',
          prompt: AI_DETECT_PROMPT,
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        const raw = await res.text().catch(() => '');
        throw new Error(`伺服器回應非 JSON（HTTP ${res.status}）：${raw.slice(0, 120)}`);
      }
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

      const { buildings: detections = [] } = parseAiDetectionJson(data.text);

      const newBoxes = detections
        .filter(d => Array.isArray(d.box) && d.box.length === 4)
        .filter(d => !isLikelyNonBuildingName(d.name))
        .map((d, i) => ({
          id: `ai${Date.now()}_${i}`,
          nx: Math.max(0, Math.min(0.99, d.box[0])),
          ny: Math.max(0, Math.min(0.99, d.box[1])),
          nw: Math.max(0.01, Math.min(1 - d.box[0], d.box[2])),
          nd: Math.max(0.01, Math.min(1 - d.box[1], d.box[3])),
          name: d.name || `建築 ${i + 1}`,
          floors: d.floors || 4,
          basements: d.basements ?? 0,
          accent: ACCENT_OPTIONS[i % ACCENT_OPTIONS.length],
          rooms: d.rooms || {},
        }));

      const cleanedBoxes = resolveBoxOverlaps(tightenBoxesToImageContent(newBoxes, imgRef.current));
      if (!cleanedBoxes.length) throw new Error('AI 未識別到任何建築，請確認圖片為校園俯視平面圖');
      setBoxes(cleanedBoxes);
      setSelectedBoxId(cleanedBoxes[0]?.id || null);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="wiz-draw">
      <div className="wiz-canvas-wrap">
        {!ready && <p className="wiz-loading">圖片載入中…</p>}
        <canvas
          ref={canvasRef}
          className="wiz-canvas"
          style={{ cursor: manualMode ? 'crosshair' : aiLoading ? 'wait' : cursor, display: ready ? 'block' : 'none' }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        />
        {ready && (
          <button
            type="button"
            className={`wiz-manual-toggle${manualMode ? ' is-active' : ''}`}
            title={manualMode ? '關閉手動框選' : '手動框選補充建築'}
            onClick={() => setManualMode(m => !m)}
          >
            <Pencil size={14} />
            {manualMode ? '手動模式（點擊關閉）' : '手動補框'}
          </button>
        )}
      </div>

      <aside className="wiz-sidebar">
        <div className="wiz-ai-primary">
          <p className="wiz-ai-title"><Cpu size={15} /> AI 自動標記建築</p>
          <select value={aiBackend} onChange={e => setAiBackend(e.target.value)} className="wiz-backend-select">
            <option value="gemma">Gemma 4（本地）</option>
            <option value="claude">Claude API</option>
            <option value="openrouter">OpenRouter（多模型）</option>
          </select>
          <button
            type="button"
            className="wiz-ai-run-btn"
            onClick={runAI}
            disabled={aiLoading}
          >
            {aiLoading ? '分析中，請稍候…' : '🏢 AI 自動識別所有建築'}
          </button>
          {aiError && <p className="wiz-error">{aiError}</p>}
        </div>

        <p className="wiz-edit-hint">拖曳框線可移動，拉白色控制點可縮放；過大的 A / B 區可先用自動收斂再微調。</p>

        {boxes.length > 0 && (
          <button
            type="button"
            className="wiz-tighten-btn"
            onClick={tightenCurrentBoxes}
          >
            <RefreshCw size={14} /> 自動收斂框線
          </button>
        )}

        <div className="wiz-box-section">
          <p className="wiz-hint">已識別建築（{boxes.length}）</p>
          <ul className="wiz-box-list">
            {boxes.map((box, i) => (
              <li
                key={box.id}
                className={`wiz-box-item${box.id === selectedBoxId ? ' is-active' : ''}${hasBoxSizeConcern(box) ? ' has-warning' : ''}`}
                onClick={() => setSelectedBoxId(box.id)}
              >
                <span className="wiz-swatch" style={{ background: box.accent }} />
                <span className="wiz-box-label">{box.name || `建築 ${i + 1}`}</span>
                <small className="wiz-box-meta">{box.floors}F</small>
                <button
                  type="button"
                  aria-label="移除"
                  onClick={(event) => {
                    event.stopPropagation();
                    setBoxes(prev => prev.filter(b => b.id !== box.id));
                    if (selectedBoxId === box.id) setSelectedBoxId(null);
                  }}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
            {!boxes.length && (
              <li className="wiz-empty-li">點擊上方「AI 自動識別」開始</li>
            )}
          </ul>
        </div>

        {boxes.length > 0 && (
          <button
            type="button"
            className="wiz-clear-btn"
            onClick={() => setBoxes([])}
          >
            清除全部重來
          </button>
        )}
      </aside>
    </div>
  );
}

// ── EditStep ─────────────────────────────────────────────────────────────────

function EditStep({ boxes, setBoxes }) {
  function upd(id, field, value) {
    setBoxes(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  }
  function updRooms(id, floor, raw) {
    setBoxes(prev => prev.map(b => {
      if (b.id !== id) return b;
      return { ...b, rooms: { ...b.rooms, [floor]: raw.split('、').map(s => s.trim()).filter(Boolean) } };
    }));
  }

  if (!boxes.length) return <p className="wiz-empty-edit">請先在「AI 標記」步驟識別建築。</p>;

  return (
    <div className="wiz-edit">
      {boxes.map((box, i) => (
        <div key={box.id} className="wiz-edit-card">
          <header className="wiz-card-header">
            <input
              className="wiz-name-input"
              value={box.name}
              placeholder={`建築 ${i + 1}`}
              onChange={e => upd(box.id, 'name', e.target.value)}
            />
            <div className="wiz-colors">
              {ACCENT_OPTIONS.map(c => (
                <button key={c} type="button" title={c}
                  className={`wiz-chip${box.accent === c ? ' is-selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => upd(box.id, 'accent', c)}
                />
              ))}
            </div>
          </header>
          <div className="wiz-num-row">
            <label>地上樓層<input type="number" min="1" max="20" value={box.floors} onChange={e => upd(box.id, 'floors', Math.max(1, +e.target.value))} /></label>
            <label>地下樓層<input type="number" min="0" max="5" value={box.basements} onChange={e => upd(box.id, 'basements', Math.max(0, +e.target.value))} /></label>
          </div>
          <div className="wiz-rooms">
            {Array.from({ length: box.floors }, (_, fi) => fi + 1).map(f => (
              <label key={f}>
                {f}F 空間（以「、」分隔）
                <input
                  value={(box.rooms[f] || []).join('、')}
                  placeholder="教室101、教室102"
                  onChange={e => updRooms(box.id, f, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function previewStyle(building) {
  const left = ((building.x - building.w / 2) / CAMPUS.width + 0.5) * 100;
  const top = ((building.z - building.d / 2) / CAMPUS.depth + 0.5) * 100;
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${(building.w / CAMPUS.width) * 100}%`,
    height: `${(building.d / CAMPUS.depth) * 100}%`,
    borderColor: building.accent,
    background: `${building.accent}55`,
  };
}

function generatedIntersection(a, b) {
  const ax1 = a.x - a.w / 2;
  const ax2 = a.x + a.w / 2;
  const az1 = a.z - a.d / 2;
  const az2 = a.z + a.d / 2;
  const bx1 = b.x - b.w / 2;
  const bx2 = b.x + b.w / 2;
  const bz1 = b.z - b.d / 2;
  const bz2 = b.z + b.d / 2;
  const w = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const d = Math.max(0, Math.min(az2, bz2) - Math.max(az1, bz1));
  return w * d;
}

function previewWarnings(generated) {
  const warnings = [];
  generated.forEach((building) => {
    const areaRatio = (building.w * building.d) / (CAMPUS.width * CAMPUS.depth);
    const longSide = Math.max(building.w, building.d);
    const shortSide = Math.max(0.1, Math.min(building.w, building.d));
    if (areaRatio > 0.16) warnings.push(`${building.name} 面積偏大，建議回到 AI 標記確認框線。`);
    if (longSide / shortSide > 8) warnings.push(`${building.name} 長寬比過大，可能把走廊或道路包進去了。`);
  });

  for (let i = 0; i < generated.length; i += 1) {
    for (let j = i + 1; j < generated.length; j += 1) {
      const a = generated[i];
      const b = generated[j];
      const hit = generatedIntersection(a, b);
      const smaller = Math.min(a.w * a.d, b.w * b.d);
      if (hit / Math.max(1, smaller) > 0.12) warnings.push(`${a.name} 與 ${b.name} 仍有明顯重疊。`);
    }
  }

  return warnings.slice(0, 5);
}

function BuildingPreview({ generated, imageUrl }) {
  const warnings = previewWarnings(generated);
  return (
    <section className="wiz-preview-panel">
      <div className="wiz-preview-head">
        <div>
          <h3>建築位置預覽</h3>
          <p>套用前先確認框線落點。若位置不對，請回到「AI 標記」刪除或手動重框。</p>
        </div>
        <span>{generated.length} 棟</span>
      </div>
      <div className="wiz-preview-map">
        {imageUrl ? <img src={imageUrl} alt="匯入底圖預覽" /> : null}
        <div className="wiz-preview-grid" />
        {generated.map((building, index) => (
          <div className="wiz-preview-building" key={building.id || `${building.name}-${index}`} style={previewStyle(building)}>
            <strong>{building.name}</strong>
            <small>{building.floors}F · {building.w}x{building.d}</small>
          </div>
        ))}
      </div>
      {warnings.length > 0 ? (
        <div className="wiz-preview-warnings">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : (
        <p className="wiz-preview-ok">未偵測到明顯過大或重疊的建築框。</p>
      )}
    </section>
  );
}

// ── ExportStep ────────────────────────────────────────────────────────────────

function ExportStep({ generated, schoolName, setSchoolName, imageUrl }) {
  const json = JSON.stringify(generated, null, 2);
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'buildings.json';
    a.click();
  }
  return (
    <div className="wiz-export">
      <label className="wiz-school-label">
        <span>學校名稱</span>
        <input
          className="wiz-school-input"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          placeholder="請輸入學校名稱"
          autoFocus
        />
      </label>
      <p className="wiz-export-note">共 <strong>{generated.length}</strong> 棟建築。請先確認下方預覽，位置合理再套用到場景。</p>
      <BuildingPreview generated={generated} imageUrl={imageUrl} />
      <pre className="wiz-json">{json}</pre>
      <button type="button" className="wiz-dl-btn" onClick={download}><Download size={14} /> 下載 buildings.json</button>
    </div>
  );
}

// ── ImportWizard (root) ───────────────────────────────────────────────────────

export default function ImportWizard({ onClose, onApply }) {
  const [step, setStep] = useState(0);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [aiBackend, setAiBackend] = useState('gemma');
  const [isDragging, setIsDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertErr, setConvertErr] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [applying, setApplying] = useState(false);

  async function applyWizard() {
    setApplying(true);
    try {
      let dataUrl = null;
      if (imageBlob) {
        dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(imageBlob);
        });
      }
      onApply(generated, dataUrl, schoolName);
    } finally {
      setApplying(false);
    }
  }

  async function pickFile(file) {
    if (!file) return;
    setConvertErr('');
    let blob = file;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      setConverting(true);
      try { blob = await renderPdfPage(file); }
      catch (err) { setConvertErr(err.message); setConverting(false); return; }
      setConverting(false);
    } else if (!file.type.startsWith('image/')) {
      return;
    }
    setImageBlob(blob);
    setImageUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    setBoxes([]);
    setStep(1);
  }

  const generated = boxes.map((box, i) => ({
    id: box.id,
    name: box.name || `建築 ${i + 1}`,
    x: Math.round(((box.nx + box.nw / 2) - 0.5) * CAMPUS.width * 10) / 10,
    z: Math.round(((box.ny + box.nd / 2) - 0.5) * CAMPUS.depth * 10) / 10,
    w: Math.round(box.nw * CAMPUS.width * 10) / 10,
    d: Math.round(box.nd * CAMPUS.depth * 10) / 10,
    floors: box.floors,
    ...(box.basements > 0 && { basements: box.basements }),
    accent: box.accent,
    rooms: box.rooms,
  }));

  const canAdvance = step === 1 ? boxes.length > 0 : step === 2;

  return (
    <div className="wiz-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wiz-modal">
        <header className="wiz-header">
          <h2>匯入建築資料</h2>
          <nav className="wiz-steps" aria-label="精靈步驟">
            {STEP_LABELS.map((label, i) => (
              <span key={i} className={`wiz-step-chip${step === i ? ' is-current' : ''}${step > i ? ' is-done' : ''}`}>
                {step > i ? <Check size={11} /> : <b>{i + 1}</b>}
                {label}
              </span>
            ))}
          </nav>
          <button type="button" className="icon-button" aria-label="關閉" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="wiz-body">
          {step === 0 && (
            <label
              className={`wiz-upload${isDragging ? ' is-drag' : ''}${converting ? ' is-converting' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files[0]); }}
            >
              <FolderOpen size={44} />
              {converting ? <span>PDF 轉換中，請稍候…</span> : <span>點擊或拖曳上傳校園平面圖</span>}
              <small>支援 JPG、PNG、PDF</small>
              {convertErr && <em className="wiz-convert-err">{convertErr}</em>}
              <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} disabled={converting} onChange={e => pickFile(e.target.files[0])} />
            </label>
          )}

          {step === 1 && imageUrl && (
            <DrawStep
              imageUrl={imageUrl}
              imageBlob={imageBlob}
              boxes={boxes}
              setBoxes={setBoxes}
              aiBackend={aiBackend}
              setAiBackend={setAiBackend}
            />
          )}

          {step === 2 && <EditStep boxes={boxes} setBoxes={setBoxes} />}
          {step === 3 && <ExportStep generated={generated} schoolName={schoolName} setSchoolName={setSchoolName} imageUrl={imageUrl} />}
        </div>

        <footer className="wiz-footer">
          {step > 0 && (
            <button type="button" className="wiz-nav-btn" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={15} /> 上一步
            </button>
          )}
          <span className="wiz-spacer" />
          {step > 0 && step < 3 && (
            <button type="button" className="wiz-nav-btn is-primary" disabled={!canAdvance} onClick={() => setStep(s => s + 1)}>
              下一步 <ChevronRight size={15} />
            </button>
          )}
          {step === 3 && (
            <button type="button" className="wiz-nav-btn is-primary" onClick={applyWizard} disabled={applying}>
              <Check size={15} /> {applying ? '處理中…' : '套用到場景'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
