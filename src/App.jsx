import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Activity,
  AlertTriangle,
  Building2,
  Cable,
  Check,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  FolderOpen,
  Gauge,
  Keyboard,
  Layers,
  Map as MapIcon,
  Maximize2,
  Pencil,
  Plus,
  RotateCcw,
  Server,
  Trash2,
  Upload,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import ImportWizard from './ImportWizard.jsx';
import buildingsData from './data/buildings.json';
import devicesData from './data/devices.json';
import heatZonesData from './data/heatZones.json';

const DEFAULT_SCHOOL = {
  id: 'default',
  name: '壽山高中',
  buildings: buildingsData,
  devices: devicesData,
  heatZones: heatZonesData,
  networkLinks: createDefaultNetworkLinks(devicesData, buildingsData),
  planUrl: '/school-plan.jpg',
};

function loadSchools() {
  try {
    const stored = JSON.parse(localStorage.getItem('campus3d_schools') || '[]');
    return [normalizeSchoolGeometry(DEFAULT_SCHOOL), ...stored.map((s) => normalizeSchoolGeometry({
      ...s,
      planUrl: localStorage.getItem(`campus3d_img_${s.id}`) || null,
    }))];
  } catch {
    return [DEFAULT_SCHOOL];
  }
}

function saveSchools(schools) {
  try {
    const payload = schools
      .filter((s) => s.id !== 'default')
      .map(({ id, name, buildings, devices, heatZones, networkLinks }) => ({ id, name, buildings, devices, heatZones, networkLinks }));
    localStorage.setItem('campus3d_schools', JSON.stringify(payload));
  } catch (e) {
    console.warn('[campus3d] 無法儲存學校清單', e);
  }
}

function saveSchoolImage(id, dataUrl) {
  if (!dataUrl) return;
  try { localStorage.setItem(`campus3d_img_${id}`, dataUrl); }
  catch (e) { console.warn('[campus3d] 底圖儲存失敗（空間不足）', e); }
}


function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('請選擇 JPG 或 PNG 圖檔'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

function createDefaultNetworkLinks(deviceList = [], buildingList = []) {
  const switchList = deviceList.filter((device) => device.type === 'switch');
  const coreSwitch = switchList.find((device) => /core|main|核心|主幹/i.test(`${device.id} ${device.name}`)) || switchList[0] || null;
  const switchByBuilding = new Map(switchList.map((device) => [device.building, device]));

  return deviceList
    .filter((device) => device.type === 'ap' || device.type === 'switch')
    .map((device, index) => {
      const building = buildingList.find((item) => item.id === device.building);
      const buildingLabel = building?.name || device.building || '未指定建築';
      const floor = String(device.floor || '1F').toUpperCase();
      const localSwitch = switchByBuilding.get(device.building) || coreSwitch;
      const isCore = coreSwitch && device.id === coreSwitch.id;
      const isSwitch = device.type === 'switch';
      const medium = isSwitch && !isCore ? 'fiber' : 'cat6';
      const portNumber = String(index + 1).padStart(2, '0');
      const cablePrefix = String(building?.id || device.building || 'site').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 10) || 'SITE';

      return {
        id: `net-${device.id}`,
        deviceId: device.id,
        switchId: isSwitch ? (isCore ? device.id : coreSwitch?.id || '') : localSwitch?.id || '',
        switchPort: isCore ? 'CORE' : medium === 'fiber' ? `Te1/1/${portNumber}` : `Gi1/0/${portNumber}`,
        patchPanel: `${buildingLabel} ${floor} PP`,
        patchPort: `P${portNumber}`,
        vlan: device.type === 'ap' ? 'VLAN 20 WiFi' : 'VLAN 10 Mgmt',
        cableId: `${cablePrefix}-${floor}-${portNumber}`,
        medium,
        fiberCore: medium === 'fiber' ? `Core ${portNumber}-${String(index + 2).padStart(2, '0')}` : '',
        uplinkTo: isSwitch && !isCore ? coreSwitch?.id || '' : '',
        status: device.status || 'online',
        note: isSwitch ? '交換器上行鏈路' : 'AP 到樓層 IDF / switch 的水平配線',
      };
    });
}

function normalizeNetworkLinks(rawLinks = [], deviceList = [], buildingList = []) {
  const generated = createDefaultNetworkLinks(deviceList, buildingList);
  const byDeviceId = new Map(generated.map((link) => [link.deviceId, link]));
  const source = Array.isArray(rawLinks) ? rawLinks : [];

  source.forEach((raw, index) => {
    const deviceId = getRecordValue(raw, ['deviceId', 'device_id', 'device', 'apId', 'ap_id', 'ap', 'switchDevice', '設備ID', '設備', 'AP ID']);
    if (!deviceId) return;
    const fallback = byDeviceId.get(deviceId) || generated[index] || {};
    byDeviceId.set(deviceId, normalizeNetworkLink({ ...fallback, ...raw, deviceId }, index));
  });

  return deviceList
    .filter((device) => device.type === 'ap' || device.type === 'switch')
    .map((device, index) => normalizeNetworkLink(byDeviceId.get(device.id) || generated[index] || { deviceId: device.id }, index));
}

function normalizeNetworkLink(raw, index = 0) {
  const deviceId = getRecordValue(raw, ['deviceId', 'device_id', 'device', 'apId', 'ap_id', 'ap', '設備ID', '設備', 'AP ID']) || raw.deviceId || '';
  const mediumRaw = String(getRecordValue(raw, ['medium', 'media', 'cableType', 'typeOfCable', '媒介', '線材']) || raw.medium || 'cat6').toLowerCase();
  const medium = /fiber|光纖|fo|single|multi/.test(mediumRaw) ? 'fiber' : 'cat6';
  const status = normalizeStatus(getRecordValue(raw, ['status', '狀態']) || raw.status || 'online');

  return {
    id: String(raw.id || `net-${deviceId || index}`),
    deviceId: String(deviceId),
    switchId: String(getRecordValue(raw, ['switchId', 'switch_id', 'switch', 'edgeSwitch', '交換器', 'Switch']) || raw.switchId || ''),
    switchPort: String(getRecordValue(raw, ['switchPort', 'switch_port', 'port', 'portId', '端口', '埠號']) || raw.switchPort || ''),
    patchPanel: String(getRecordValue(raw, ['patchPanel', 'patch_panel', 'panel', '配線架', 'Patch Panel']) || raw.patchPanel || ''),
    patchPort: String(getRecordValue(raw, ['patchPort', 'patch_port', 'patch', '配線孔', 'Patch Port']) || raw.patchPort || ''),
    vlan: String(getRecordValue(raw, ['vlan', 'VLAN']) || raw.vlan || ''),
    cableId: String(getRecordValue(raw, ['cableId', 'cable_id', 'cable', 'label', '線號', '線纜編號']) || raw.cableId || ''),
    medium,
    fiberCore: String(getRecordValue(raw, ['fiberCore', 'fiber_core', 'core', '芯數', '光纖芯']) || raw.fiberCore || ''),
    uplinkTo: String(getRecordValue(raw, ['uplinkTo', 'uplink_to', 'uplink', '上行', '上聯']) || raw.uplinkTo || ''),
    status,
    note: String(getRecordValue(raw, ['note', 'notes', '備註', '說明']) || raw.note || ''),
  };
}

function parseNetworkLinksText(text, fileName = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('檔案是空的');

  if (/\.json$/i.test(fileName) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = JSON.parse(trimmed);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.networkLinks)) return data.networkLinks;
    if (Array.isArray(data.links)) return data.links;
    if (Array.isArray(data.rows)) return data.rows;
    throw new Error('JSON 需要是陣列，或包含 networkLinks / links / rows 陣列');
  }

  return parseCsvRecords(trimmed);
}

function parseCsvRecords(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('CSV 需要標題列與至少一筆資料');

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
}

function normalizeHeader(header) {
  return String(header || '').trim().replace(/^﻿/, '');
}

function getRecordValue(record, keys) {
  if (!record) return '';
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return String(record[key]).trim();
  }
  const entries = Object.entries(record);
  for (const key of keys) {
    const lower = String(key).toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '');
    const found = entries.find(([name]) => String(name).toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '') === lower);
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') return String(found[1]).trim();
  }
  return '';
}

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (/offline|down|fault|fail|red|故障|斷線|離線/.test(value)) return 'offline';
  if (/warn|warning|amber|yellow|高|警告|異常/.test(value)) return 'warning';
  return 'online';
}

function mergeDevicesFromNetworkRecords(existingDevices = [], records = [], buildingList = []) {
  const next = existingDevices.map((device) => ({ ...device }));
  const byId = new Map(next.map((device, index) => [device.id, { device, index }]));

  records.forEach((record, index) => {
    const id = getRecordValue(record, ['deviceId', 'device_id', 'device', 'apId', 'ap_id', 'ap', '設備ID', '設備', 'AP ID']);
    if (!id) return;
    const current = byId.get(id)?.device;
    const building = resolveBuildingId(getRecordValue(record, ['building', 'buildingId', 'building_id', '建築', '棟別']), buildingList) || current?.building || buildingList[0]?.id || 'outdoor';
    const buildingInfo = buildingList.find((item) => item.id === building);
    const typeRaw = getRecordValue(record, ['type', 'deviceType', 'device_type', '類型']);
    const type = /switch|sw|交換器/i.test(typeRaw || id) ? 'switch' : 'ap';
    const parsedX = Number(getRecordValue(record, ['x', 'X']));
    const parsedZ = Number(getRecordValue(record, ['z', 'Z']));
    const offset = (index % 5) - 2;
    const fallbackX = buildingInfo ? buildingInfo.x + clamp(offset * 1.8, -buildingInfo.w / 3, buildingInfo.w / 3) : 0;
    const fallbackZ = buildingInfo ? buildingInfo.z + clamp(Math.floor(index / 5) * 1.7, -buildingInfo.d / 3, buildingInfo.d / 3) : 0;
    const patch = {
      id,
      type: current?.type || type,
      name: getRecordValue(record, ['name', 'deviceName', 'device_name', '名稱']) || current?.name || id,
      building,
      x: Number.isFinite(parsedX) ? parsedX : current?.x ?? Math.round(fallbackX * 10) / 10,
      z: Number.isFinite(parsedZ) ? parsedZ : current?.z ?? Math.round(fallbackZ * 10) / 10,
      floor: getRecordValue(record, ['floor', '樓層']) || current?.floor || '1F',
      status: normalizeStatus(getRecordValue(record, ['status', '狀態']) || current?.status || 'online'),
      users: Number(getRecordValue(record, ['users', 'clientCount', 'clients', '用戶'])) || current?.users || 0,
      mbps: Number(getRecordValue(record, ['mbps', 'traffic', 'throughput', '流量'])) || current?.mbps || 0,
      channel: getRecordValue(record, ['channel', '頻道']) || current?.channel || '-',
    };

    if (current) {
      Object.assign(current, patch);
    } else {
      byId.set(id, { device: patch, index: next.length });
      next.push(patch);
    }
  });

  return next;
}

function resolveBuildingId(value, buildingList = []) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  const found = buildingList.find((building) => (
    String(building.id).toLowerCase() === normalized
    || String(building.name).toLowerCase().replace(/\s+/g, '') === normalized
    || String(building.name).toLowerCase().replace(/\s+/g, '').includes(normalized)
  ));
  return found?.id || text;
}

function createVisibleSampleNetworkRecords(deviceList = [], buildingList = []) {
  const building = buildingList.find((item) => item.id !== 'outdoor') || buildingList[0] || { id: 'demo', name: '範例建築', x: 0, z: 0, w: 18, d: 16 };
  const core = deviceList.find((device) => device.type === 'switch' && /core|核心|main/i.test(`${device.id} ${device.name}`))
    || deviceList.find((device) => device.type === 'switch')
    || { id: 'SW-MAIN-CORE' };
  const localSwitchId = 'SW-DEMO-IDF';
  const baseX = Number(building.x) || 0;
  const baseZ = Number(building.z) || 0;
  const spanX = Math.max(3, Number(building.w) || 12);
  const spanZ = Math.max(3, Number(building.d) || 12);

  return [
    {
      deviceId: localSwitchId,
      type: 'switch',
      name: `${building.name} 範例 IDF`,
      building: building.id,
      floor: '1F',
      x: Math.round((baseX - spanX * 0.18) * 10) / 10,
      z: Math.round((baseZ - spanZ * 0.18) * 10) / 10,
      switchId: core.id,
      switchPort: 'Te1/1/12',
      patchPanel: `${building.name} MDF`,
      patchPort: 'FO-12',
      vlan: 'VLAN 10 Mgmt',
      cableId: 'DEMO-FO-12',
      medium: 'fiber',
      fiberCore: 'Core 11-12',
      uplinkTo: core.id,
      status: 'warning',
      users: 24,
      mbps: 380,
      channel: 'uplink 62%',
      note: '範例：跨棟光纖到樓層 IDF',
    },
    {
      deviceId: 'AP-DEMO-FAULT',
      type: 'ap',
      name: `${building.name} 範例故障 AP`,
      building: building.id,
      floor: '2F',
      x: Math.round((baseX + spanX * 0.12) * 10) / 10,
      z: Math.round((baseZ + spanZ * 0.08) * 10) / 10,
      switchId: localSwitchId,
      switchPort: 'Gi1/0/48',
      patchPanel: `${building.name} 2F PP`,
      patchPort: 'P48',
      vlan: 'VLAN 20 WiFi',
      cableId: 'DEMO-CAT6-048',
      medium: 'cat6',
      fiberCore: '',
      uplinkTo: core.id,
      status: 'offline',
      users: 0,
      mbps: 0,
      channel: '離線',
      note: '範例：故障 AP，線路與設備會以紅色呈現',
    },
    {
      deviceId: 'AP-DEMO-HIGH',
      type: 'ap',
      name: `${building.name} 範例高流量 AP`,
      building: building.id,
      floor: '3F',
      x: Math.round((baseX + spanX * 0.26) * 10) / 10,
      z: Math.round((baseZ + spanZ * 0.22) * 10) / 10,
      switchId: localSwitchId,
      switchPort: 'Gi1/0/36',
      patchPanel: `${building.name} 3F PP`,
      patchPort: 'P36',
      vlan: 'VLAN 20 WiFi',
      cableId: 'DEMO-CAT6-036',
      medium: 'cat6',
      fiberCore: '',
      uplinkTo: core.id,
      status: 'warning',
      users: 128,
      mbps: 920,
      channel: '5GHz ch149',
      note: '範例：高用戶與高流量 AP，可搭配用戶流量模式觀察',
    },
  ];
}

function makeDefaultRooms(floors) {
  return Object.fromEntries(Array.from({ length: Math.max(1, floors) }, (_, index) => [index + 1, []]));
}

function createBlankBuilding(index = 0) {
  const floors = 4;
  return {
    id: `custom-${Date.now()}-${index}`,
    name: `新增建築 ${index + 1}`,
    x: 0,
    z: 0,
    w: 10,
    d: 12,
    floors,
    basements: 0,
    accent: BUILDING_ACCENT_OPTIONS[index % BUILDING_ACCENT_OPTIONS.length],
    rooms: makeDefaultRooms(floors),
  };
}

function normalizeEditedBuildings(rawBuildings) {
  return rawBuildings.map((building) => normalizeSceneBuilding({
    ...building,
    accent: building.accent || '#667983',
    rooms: building.rooms || {},
  }));
}

function normalizeSchoolGeometry(school) {
  const normalizedBuildings = sanitizeSceneBuildings(school.buildings || []);
  const normalizedDevices = Array.isArray(school.devices) ? school.devices : [];
  return {
    ...school,
    buildings: normalizedBuildings,
    devices: normalizedDevices,
    heatZones: Array.isArray(school.heatZones) ? school.heatZones : [],
    networkLinks: normalizeNetworkLinks(school.networkLinks || [], normalizedDevices, normalizedBuildings),
  };
}

function sceneBuildingArea(building) {
  return Math.max(0, building.w) * Math.max(0, building.d);
}

function sceneEdges(building) {
  return {
    left: building.x - building.w / 2,
    right: building.x + building.w / 2,
    top: building.z - building.d / 2,
    bottom: building.z + building.d / 2,
  };
}

function sceneIntersection(a, b) {
  const ae = sceneEdges(a);
  const be = sceneEdges(b);
  const left = Math.max(ae.left, be.left);
  const right = Math.min(ae.right, be.right);
  const top = Math.max(ae.top, be.top);
  const bottom = Math.min(ae.bottom, be.bottom);
  const w = Math.max(0, right - left);
  const d = Math.max(0, bottom - top);
  return { w, d, area: w * d };
}

function normalizeSceneBuilding(building) {
  const w = Math.max(1.2, Number(building.w) || 1.2);
  const d = Math.max(1.2, Number(building.d) || 1.2);
  return {
    ...building,
    x: Number.isFinite(building.x) ? building.x : 0,
    z: Number.isFinite(building.z) ? building.z : 0,
    w,
    d,
    floors: Math.max(1, Number(building.floors) || 4),
    basements: Math.max(0, Number(building.basements) || 0),
  };
}

function updateSceneBuildingFromEdges(building, edges) {
  const left = Math.min(edges.left, edges.right - 1.2);
  const right = Math.max(edges.right, left + 1.2);
  const top = Math.min(edges.top, edges.bottom - 1.2);
  const bottom = Math.max(edges.bottom, top + 1.2);
  building.x = Math.round(((left + right) / 2) * 10) / 10;
  building.z = Math.round(((top + bottom) / 2) * 10) / 10;
  building.w = Math.round((right - left) * 10) / 10;
  building.d = Math.round((bottom - top) * 10) / 10;
}

function sanitizeSceneBuildings(rawBuildings) {
  const buildingsToClean = rawBuildings
    .map(normalizeSceneBuilding)
    .filter((building) => sceneBuildingArea(building) >= 2.6)
    .map((building) => ({ ...building }));
  const pad = 0.6;

  for (let iter = 0; iter < 10; iter += 1) {
    let changed = false;
    for (let i = 0; i < buildingsToClean.length; i += 1) {
      for (let j = i + 1; j < buildingsToClean.length; j += 1) {
        const a = buildingsToClean[i];
        const b = buildingsToClean[j];
        const hit = sceneIntersection(a, b);
        if (!hit.area) continue;

        const areaA = sceneBuildingArea(a);
        const areaB = sceneBuildingArea(b);
        const smallerArea = Math.min(areaA, areaB);
        if (hit.area / smallerArea < 0.12) continue;

        const big = areaA >= areaB ? a : b;
        const small = big === a ? b : a;
        const be = sceneEdges(big);
        const se = sceneEdges(small);
        const bigCx = big.x;
        const bigCz = big.z;
        const trimX = hit.w / Math.max(0.1, big.w);
        const trimZ = hit.d / Math.max(0.1, big.d);

        if (trimX <= trimZ) {
          if (small.x < bigCx) be.left = Math.min(be.right - 1.2, se.right + pad);
          else be.right = Math.max(be.left + 1.2, se.left - pad);
        } else if (small.z < bigCz) {
          be.top = Math.min(be.bottom - 1.2, se.bottom + pad);
        } else {
          be.bottom = Math.max(be.top + 1.2, se.top - pad);
        }
        updateSceneBuildingFromEdges(big, be);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return buildingsToClean;
}

const CAMPUS = { width: 92, depth: 130 };

const BUILDING_ACCENT_OPTIONS = ['#617180', '#687985', '#72808b', '#697987', '#737c88', '#8a7b67', '#64798a', '#667983'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

const MODES = [
  { id: 'health', label: '設備狀態', icon: Activity },
  { id: 'signal', label: '訊號熱區', icon: Wifi },
  { id: 'traffic', label: '用戶流量', icon: Gauge },
  { id: 'planning', label: '樓層規劃', icon: Layers },
  { id: 'cabling', label: '實體線路', icon: Cable },
];

const HEALTH = {
  online: { label: '正常', color: '#b9f6ca', dark: '#15803d' },
  warning: { label: '警告', color: '#ffe08a', dark: '#a16207' },
  offline: { label: '故障', color: '#ff8a80', dark: '#b91c1c' },
};

const SIGNAL = {
  good: { label: '良好', color: '#93e6c3', dark: '#047857' },
  fair: { label: '偏弱', color: '#f7d56f', dark: '#9a6b00' },
  poor: { label: '訊號差', color: '#fb8b4b', dark: '#c2410c' },
  outage: { label: '斷線區', color: '#ef5a63', dark: '#b91c1c' },
};

const TRAFFIC = {
  low: { label: '低', color: '#9ee8d0', dark: '#0f766e' },
  medium: { label: '中', color: '#f1c94a', dark: '#8a6500' },
  high: { label: '高', color: '#ff8a3d', dark: '#c2410c' },
  critical: { label: '壅塞', color: '#d9465f', dark: '#9f1239' },
};

const CABLING = {
  tray: { label: '走廊線槽', color: '#7a8790' },
  fiber: { label: '跨棟光纖', color: '#7c3aed' },
  riser: { label: '垂直管道', color: '#2563eb' },
  copper: { label: 'Cat6 支線', color: '#14b8a6' },
  selected: { label: '選取路徑', color: '#f59e0b' },
};

let buildings = buildingsData;
let heatZones = heatZonesData;
let devices = devicesData;
let networkLinks = createDefaultNetworkLinks(devicesData, buildingsData);

function App() {
  const [mode, setMode] = useState('signal');
  const [showPlan, setShowPlan] = useState(true);
  const [showDevices, setShowDevices] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showCabling, setShowCabling] = useState(false);
  const [heightScale, setHeightScale] = useState(1);
  const [selectedEntity, setSelectedEntity] = useState(heatZones[0]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const [cameraPreset, setCameraPreset] = useState({ name: 'home', tick: 0 });
  const [showWizard, setShowWizard] = useState(false);
  const [showSchoolEditor, setShowSchoolEditor] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [aiBackend, setAiBackend] = useState('gemma');
  const [schools, setSchools] = useState(() => {
    const loaded = loadSchools();
    const savedId = localStorage.getItem('campus3d_current') || 'default';
    const current = loaded.find((s) => s.id === savedId) ?? DEFAULT_SCHOOL;
    buildings = current.buildings;
    devices = current.devices;
    heatZones = current.heatZones;
    networkLinks = current.networkLinks || normalizeNetworkLinks([], current.devices || [], current.buildings || []);
    return loaded;
  });
  const [currentSchoolId, setCurrentSchoolId] = useState(() => localStorage.getItem('campus3d_current') || 'default');
  const [planUrl, setPlanUrl] = useState(() => {
    const savedId = localStorage.getItem('campus3d_current') || 'default';
    if (savedId === 'default') return '/school-plan.jpg';
    return localStorage.getItem(`campus3d_img_${savedId}`) || '/school-plan.jpg';
  });
  const [showHints, setShowHints] = useState(false);
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);
  const [networkImportError, setNetworkImportError] = useState('');
  const [networkImportMessage, setNetworkImportMessage] = useState('');

  const currentSchool = schools.find((s) => s.id === currentSchoolId) ?? DEFAULT_SCHOOL;

  function switchSchool(id) {
    const school = schools.find((s) => s.id === id);
    if (!school) return;
    buildings = school.buildings;
    devices = school.devices;
    heatZones = school.heatZones;
    networkLinks = school.networkLinks || normalizeNetworkLinks([], school.devices || [], school.buildings || []);
    setCurrentSchoolId(id);
    setPlanUrl(school.planUrl || '/school-plan.jpg');
    setSceneVersion((v) => v + 1);
    setSelectedEntity(null);
    setShowSchoolPicker(false);
    try { localStorage.setItem('campus3d_current', id); } catch {}
  }

  function deleteSchool(id) {
    if (id === 'default') return;
    const school = schools.find((item) => item.id === id);
    const ok = window.confirm(`確定刪除「${school?.name || '此學校'}」？刪除後可重新匯入。`);
    if (!ok) return;

    const next = schools.filter((s) => s.id !== id);
    setSchools(next);
    saveSchools(next);
    try { localStorage.removeItem(`campus3d_img_${id}`); } catch {}

    if (currentSchoolId === id) {
      const fallback = next.find((s) => s.id === 'default') ?? DEFAULT_SCHOOL;
      buildings = fallback.buildings;
      devices = fallback.devices;
      heatZones = fallback.heatZones;
      networkLinks = fallback.networkLinks || normalizeNetworkLinks([], fallback.devices || [], fallback.buildings || []);
      setCurrentSchoolId('default');
      setPlanUrl(fallback.planUrl || '/school-plan.jpg');
      setSelectedEntity(null);
      setSceneVersion((v) => v + 1);
      try { localStorage.setItem('campus3d_current', 'default'); } catch {}
    }
  }

  function handleSchoolEditSave(editedSchool, newPlanDataUrl) {
    if (!editedSchool || editedSchool.id === 'default') return;
    const updatedBuildings = normalizeEditedBuildings(editedSchool.buildings || []);
    const updatedDevices = editedSchool.devices || [];
    const updatedSchool = {
      ...editedSchool,
      name: editedSchool.name?.trim() || '未命名學校',
      buildings: updatedBuildings,
      devices: updatedDevices,
      heatZones: editedSchool.heatZones || [],
      networkLinks: normalizeNetworkLinks(editedSchool.networkLinks || [], updatedDevices, updatedBuildings),
      planUrl: newPlanDataUrl || editedSchool.planUrl || null,
    };
    const next = schools.map((school) => (school.id === updatedSchool.id ? updatedSchool : school));
    buildings = updatedSchool.buildings;
    devices = updatedSchool.devices;
    heatZones = updatedSchool.heatZones;
    networkLinks = updatedSchool.networkLinks;
    setSchools(next);
    saveSchools(next);
    if (newPlanDataUrl) saveSchoolImage(updatedSchool.id, newPlanDataUrl);
    setPlanUrl(updatedSchool.planUrl || '/school-plan.jpg');
    setSelectedEntity(null);
    setSceneVersion((value) => value + 1);
    setShowSchoolEditor(false);
  }

  function handleWizardApply(newBuildings, newPlanUrl, schoolName) {
    const id = `school-${Date.now()}`;
    const cleanedBuildings = sanitizeSceneBuildings(newBuildings);
    const newSchool = {
      id,
      name: schoolName?.trim() || '未命名學校',
      buildings: cleanedBuildings,
      devices: [],
      heatZones: [],
      networkLinks: [],
      planUrl: newPlanUrl || null,
    };
    buildings = newSchool.buildings;
    devices = newSchool.devices;
    heatZones = newSchool.heatZones;
    networkLinks = newSchool.networkLinks;
    const next = [...schools, newSchool];
    setSchools(next);
    saveSchools(next);
    saveSchoolImage(id, newPlanUrl);
    setCurrentSchoolId(id);
    try { localStorage.setItem('campus3d_current', id); } catch {}
    if (newPlanUrl) setPlanUrl(newPlanUrl);
    setSceneVersion((v) => v + 1);
    setShowWizard(false);
    setSelectedEntity(null);
  }

  function applyNetworkRecords(records, messagePrefix = '已匯入') {
    if (!records.length) throw new Error('沒有讀到任何線路資料');
    const nextDevices = mergeDevicesFromNetworkRecords(devices, records, buildings);
    const nextLinks = normalizeNetworkLinks(records, nextDevices, buildings);
    const updatedSchool = {
      ...currentSchool,
      buildings,
      devices: nextDevices,
      heatZones,
      networkLinks: nextLinks,
    };
    const nextSchools = schools.map((school) => (school.id === currentSchoolId ? updatedSchool : school));
    devices = nextDevices;
    networkLinks = nextLinks;
    setSchools(nextSchools);
    saveSchools(nextSchools);
    setMode('cabling');
    setShowCabling(true);
    setSelectedEntity(nextDevices.find((device) => device.id === records[0]?.deviceId) || nextDevices.find((device) => device.id === nextLinks[0]?.deviceId) || null);
    setSceneVersion((value) => value + 1);
    setNetworkImportMessage(`${messagePrefix} ${records.length} 筆線路資料，現在學校共有 ${nextDevices.length} 台設備`);
  }

  async function handleNetworkImport(file) {
    if (!file) return;
    setNetworkImportError('');
    setNetworkImportMessage('');
    try {
      const text = await readTextFile(file);
      const records = parseNetworkLinksText(text, file.name);
      applyNetworkRecords(records, '已匯入');
    } catch (error) {
      setNetworkImportError(error.message || '線路資料匯入失敗');
    }
  }

  function handleLoadSampleNetworkData() {
    setNetworkImportError('');
    setNetworkImportMessage('');
    try {
      const records = createVisibleSampleNetworkRecords(devices, buildings);
      applyNetworkRecords(records, '已載入範例');
    } catch (error) {
      setNetworkImportError(error.message || '範例線路載入失敗');
    }
  }

  const metrics = useMemo(() => {
    const offline = devices.filter((device) => device.status === 'offline').length;
    const warning = devices.filter((device) => device.status === 'warning').length;
    const online = devices.filter((device) => device.status === 'online').length;
    const issueZones = heatZones.filter((zone) => zone.signal === 'poor' || zone.signal === 'outage').length;
    const highTraffic = heatZones.filter((zone) => zone.traffic === 'high' || zone.traffic === 'critical').length;
    return { online, warning, offline, issueZones, highTraffic };
  }, [sceneVersion]);
  const networkStats = useMemo(() => {
    const mapped = networkLinks.filter((link) => devices.some((device) => device.id === link.deviceId)).length;
    const fiber = networkLinks.filter((link) => link.medium === 'fiber').length;
    const offline = networkLinks.filter((link) => link.status === 'offline').length;
    return { mapped, fiber, offline };
  }, [sceneVersion]);
  const activeBuildingId = getActiveBuildingId(selectedEntity?.id);

  useEffect(() => {
    setSelectedFloor(getInitialFloorForEntity(selectedEntity));
  }, [selectedEntity]);

  return (
    <main className="app-shell">
      <section className="viewport-panel">
        <div className="scene-toolbar" aria-label="3D 視角控制">
          <button className="icon-button" type="button" title="重設視角" onClick={() => setCameraPreset({ name: 'home', tick: Date.now() })}>
            <RotateCcw size={18} />
          </button>
          <button className="icon-button" type="button" title="俯視" onClick={() => setCameraPreset({ name: 'top', tick: Date.now() })}>
            <MapIcon size={18} />
          </button>
          <button className="icon-button" type="button" title="東側透視" onClick={() => setCameraPreset({ name: 'east', tick: Date.now() })}>
            <Maximize2 size={18} />
          </button>
          <button className={`icon-button ${showPlan ? 'is-active' : ''}`} type="button" title="底圖" onClick={() => setShowPlan((value) => !value)}>
            {showPlan ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <div className="toolbar-divider" />
          <button className={`icon-button ${showHints ? 'is-active' : ''}`} type="button" title="鍵盤快捷鍵" onClick={() => setShowHints((v) => !v)}>
            <Keyboard size={18} />
          </button>
        </div>

        {showHints && (
          <div className="kbd-hints" role="tooltip" aria-label="鍵盤快捷鍵">
            <p className="kbd-title">鍵盤快捷鍵</p>
            <div className="kbd-grid">
              <div className="kbd-row">
                <span className="kbd-group">
                  <kbd>W</kbd><kbd>S</kbd>
                  <span>俯仰</span>
                </span>
                <span className="kbd-group">
                  <kbd>A</kbd><kbd>D</kbd>
                  <span>旋轉</span>
                </span>
              </div>
              <div className="kbd-row">
                <span className="kbd-group">
                  <kbd>Q</kbd><kbd>+</kbd>
                  <span>放大</span>
                </span>
                <span className="kbd-group">
                  <kbd>E</kbd><kbd>-</kbd>
                  <span>縮小</span>
                </span>
              </div>
              <div className="kbd-row">
                <span className="kbd-group">
                  <kbd>I</kbd><kbd>K</kbd>
                  <span>前進 / 後退</span>
                </span>
                <span className="kbd-group">
                  <kbd>J</kbd><kbd>L</kbd>
                  <span>左移 / 右移</span>
                </span>
              </div>
              <div className="kbd-row kbd-row--note">
                <span>方向鍵 ↑↓←→ 同 WASD</span>
              </div>
              <div className="kbd-row kbd-row--note">
                <span>Shift 加速 · 滑鼠拖曳旋轉 · 滾輪縮放</span>
              </div>
            </div>
          </div>
        )}

        <CampusScene
          mode={mode}
          showPlan={showPlan}
          showDevices={showDevices}
          showHeatmap={showHeatmap}
          showCabling={showCabling || mode === 'cabling'}
          heightScale={heightScale}
          selectedEntity={selectedEntity}
          selectedId={selectedEntity?.id}
          selectedFloor={selectedFloor}
          cameraPreset={cameraPreset}
          sceneVersion={sceneVersion}
          planUrl={planUrl}
          showDefaultFeatures={currentSchoolId === 'default'}
          onSelect={setSelectedEntity}
          onHover={setHoveredEntity}
          onFloorSelect={setSelectedFloor}
        />

        {hoveredEntity ? (
          <div className="hover-chip">
            <span>{hoveredEntity.label || hoveredEntity.name}</span>
            <small>{entitySubtitle(hoveredEntity)}</small>
          </div>
        ) : null}

        <div className="mode-strip" role="tablist" aria-label="資料模式">
          {MODES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`mode-button ${mode === item.id ? 'is-active' : ''}`}
                onClick={() => setMode(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="control-panel">
        <header className="panel-header">
          <div className="panel-header-main">
            <button className="school-switch-btn" type="button" onClick={() => setShowSchoolPicker((v) => !v)}>
              <Building2 size={13} />
              <span>{currentSchool.name}</span>
              <ChevronDown size={12} style={{ transform: showSchoolPicker ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />
            </button>
            <h1>WiFi 3D 監控圖</h1>
          </div>
          <div className="panel-header-actions">
            <button type="button" className="icon-button" title="匯入新學校" onClick={() => setShowWizard(true)}>
              <FolderOpen size={17} />
            </button>
            <span className="live-badge">Live Demo</span>
          </div>
        </header>

        {showSchoolPicker && (
          <div className="school-picker">
            <p className="school-picker-title">選擇學校</p>
            {schools.map((school) => (
              <div key={school.id} className={`school-item ${school.id === currentSchoolId ? 'is-active' : ''}`}>
                <button className="school-item-btn" type="button" onClick={() => switchSchool(school.id)}>
                  {school.name}
                </button>
                {school.id !== 'default' && (
                  <button className="school-item-del" type="button" aria-label="刪除" onClick={() => deleteSchool(school.id)}>
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            <button className="school-add-btn" type="button" onClick={() => { setShowSchoolPicker(false); setShowWizard(true); }}>
              <FolderOpen size={14} /> 匯入新學校
            </button>
          </div>
        )}

        <section className="metric-grid" aria-label="監控摘要">
          <Metric label="正常設備" value={metrics.online} tone="green" />
          <Metric label="警告設備" value={metrics.warning} tone="amber" />
          <Metric label="故障設備" value={metrics.offline} tone="red" />
          <Metric label="問題區域" value={metrics.issueZones + metrics.highTraffic} tone="orange" />
        </section>

        {currentSchoolId !== 'default' && (
          <section className="panel-section school-manage-panel">
            <div className="section-title">
              <FolderOpen size={17} />
              <h2>目前學校</h2>
            </div>
            <p className="school-manage-name">{currentSchool.name}</p>
            <div className="school-manage-actions">
              <button type="button" className="school-edit-btn" onClick={() => setShowSchoolEditor(true)}>
                編輯
              </button>
              <button type="button" className="school-reimport-btn" onClick={() => setShowWizard(true)}>
                重新匯入
              </button>
              <button type="button" className="school-delete-current" onClick={() => deleteSchool(currentSchoolId)}>
                刪除學校
              </button>
            </div>
          </section>
        )}

        <section className="panel-section">
          <div className="section-title">
            <Building2 size={17} />
            <h2>圖層</h2>
          </div>
          <div className="toggle-grid">
            <Toggle checked={showDevices} label="AP / switch" onChange={setShowDevices} />
            <Toggle checked={showHeatmap} label="熱區" onChange={setShowHeatmap} />
            <Toggle checked={showCabling || mode === 'cabling'} label="線槽 / 線路" onChange={setShowCabling} />
          </div>
          <label className="range-field">
            <span>建築高度</span>
            <input
              type="range"
              min="0.7"
              max="1.6"
              step="0.1"
              value={heightScale}
              onChange={(event) => setHeightScale(Number(event.target.value))}
            />
            <b>{heightScale.toFixed(1)}x</b>
          </label>
        </section>

        <section className="panel-section network-data-panel">
          <div className="section-title">
            <Cable size={17} />
            <h2>實體線路資料</h2>
          </div>
          <div className="network-stat-grid">
            <Detail label="已對應" value={`${networkStats.mapped}`} />
            <Detail label="光纖" value={`${networkStats.fiber}`} />
            <Detail label="異常線路" value={`${networkStats.offline}`} />
          </div>
          <div className="network-action-row">
            <label className="network-import-btn">
              <Upload size={16} />
              <span>匯入 CSV / JSON</span>
              <input
                type="file"
                accept=".csv,.json,application/json,text/csv"
                data-testid="network-import-input"
                onChange={(event) => handleNetworkImport(event.target.files?.[0])}
              />
            </label>
            <button className="network-sample-btn" type="button" onClick={handleLoadSampleNetworkData}>
              <Plus size={16} />
              <span>載入範例</span>
            </button>
          </div>
          <p className="network-import-hint">自動化測試資料只在測試瀏覽器內；要在目前畫面看差異，可按「載入範例」。欄位可含 deviceId、type、name、building、floor、x、z、switchId、switchPort、patchPanel、patchPort、vlan、cableId、medium、fiberCore、uplinkTo、status、note。</p>
          {networkImportMessage && <p className="network-import-ok">{networkImportMessage}</p>}
          {networkImportError && <p className="network-import-error">{networkImportError}</p>}
        </section>

        <section className="panel-section">
          <div className="section-title">
            <Building2 size={17} />
            <h2>建築物</h2>
          </div>
          <div className="building-list">
            {buildings.map((building) => {
              const status = buildingStatus(building.id);
              const deviceCount = devices.filter((device) => device.building === building.id).length;
              return (
                <button
                  className={`building-row ${activeBuildingId === building.id ? 'is-active' : ''}`}
                  key={building.id}
                  type="button"
                  onClick={() => setSelectedEntity(building)}
                >
                  <span className="building-swatch" style={{ background: HEALTH[status].color }} />
                  <span className="building-copy">
                    <strong>{building.name}</strong>
                    <small>{buildingLevelSummary(building)} · {deviceCount} 台設備 · {HEALTH[status].label}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <DetailPanel entity={selectedEntity} selectedFloor={selectedFloor} />

        <section className="panel-section">
          <div className="section-title">
            <Wifi size={17} />
            <h2>AP / Switch</h2>
          </div>
          <div className="device-list">
            {devices.map((device) => (
              <button
                className={`device-row ${selectedEntity?.id === device.id ? 'is-active' : ''}`}
                key={device.id}
                type="button"
                onClick={() => setSelectedEntity(device)}
              >
                <span className="device-icon" style={{ '--dot': statusColor(device.status, mode, device) }}>
                  {device.type === 'ap' ? <Wifi size={15} /> : <Server size={15} />}
                </span>
                <span className="device-copy">
                  <strong>{device.name}</strong>
                  <small>{device.floor} · {device.id}</small>
                </span>
                <span className="device-load">{device.users}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-title">
            <AlertTriangle size={17} />
            <h2>區域熱點</h2>
          </div>
          <div className="zone-list">
            {heatZones.map((zone) => (
              <button
                className={`zone-row ${selectedEntity?.id === zone.id ? 'is-active' : ''}`}
                key={zone.id}
                type="button"
                onClick={() => setSelectedEntity(zone)}
              >
                <span className="zone-swatch" style={{ background: zoneColor(zone, mode) }} />
                <span>
                  <strong>{zone.label}</strong>
                  <small>{SIGNAL[zone.signal].label} · {TRAFFIC[zone.traffic].label}流量</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <AIPanel backend={aiBackend} setBackend={setAiBackend} />
        <Legend mode={mode} />
      </aside>

      {showSchoolEditor && currentSchoolId !== 'default' && (
        <SchoolEditor
          school={currentSchool}
          onClose={() => setShowSchoolEditor(false)}
          onSave={handleSchoolEditSave}
        />
      )}

      {showWizard && (
        <ImportWizard onClose={() => setShowWizard(false)} onApply={handleWizardApply} />
      )}
    </main>
  );
}

function SchoolEditor({ school, onClose, onSave }) {
  const previewRef = useRef(null);
  const dragActionRef = useRef(null);
  const [draft, setDraft] = useState(() => ({
    ...school,
    buildings: (school.buildings || []).map((building) => ({
      ...building,
      roomsText: Object.entries(building.rooms || {})
        .map(([floor, rooms]) => `${floor}F：${Array.isArray(rooms) ? rooms.join('、') : ''}`)
        .join('\n'),
    })),
  }));
  const [newPlanUrl, setNewPlanUrl] = useState(null);
  const [fileError, setFileError] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState(() => school.buildings?.[0]?.id || null);
  const [dragAction, setDragAction] = useState(null);

  useEffect(() => {
    if (selectedBuildingId && !draft.buildings.some((building) => building.id === selectedBuildingId)) {
      setSelectedBuildingId(draft.buildings[0]?.id || null);
    }
  }, [draft.buildings, selectedBuildingId]);

  useEffect(() => {
    if (!dragAction) return undefined;
    function handleMove(event) {
      movePreviewDrag(event);
    }
    function handleEnd() {
      endPreviewDrag();
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [dragAction]);

  function updateBuilding(id, field, value) {
    setDraft((current) => ({
      ...current,
      buildings: current.buildings.map((building) => (building.id === id ? { ...building, [field]: value } : building)),
    }));
  }

  function patchBuilding(id, patch) {
    setDraft((current) => ({
      ...current,
      buildings: current.buildings.map((building) => (building.id === id ? { ...building, ...patch } : building)),
    }));
  }

  function updateNumericBuilding(id, field, value) {
    const number = Number(value);
    updateBuilding(id, field, Number.isFinite(number) ? number : 0);
  }

  function addBuilding() {
    setDraft((current) => {
      const nextBuilding = createBlankBuilding(current.buildings.length);
      setSelectedBuildingId(nextBuilding.id);
      return {
        ...current,
        buildings: [...current.buildings, nextBuilding],
      };
    });
  }

  function removeBuilding(id) {
    setDraft((current) => ({
      ...current,
      buildings: current.buildings.filter((building) => building.id !== id),
    }));
  }

  function parseRooms(text) {
    const rooms = {};
    String(text || '').split('\n').forEach((line) => {
      const [floorRaw, roomsRaw = ''] = line.split(/[:：]/);
      const floor = Number(String(floorRaw).replace(/F|樓/g, '').trim());
      if (!Number.isFinite(floor) || floor < 1) return;
      rooms[floor] = roomsRaw.split('、').map((item) => item.trim()).filter(Boolean);
    });
    return rooms;
  }

  async function updatePlanFile(file) {
    setFileError('');
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setNewPlanUrl(dataUrl);
      setDraft((current) => ({ ...current, planUrl: dataUrl }));
    } catch (error) {
      setFileError(error.message || '底圖讀取失敗');
    }
  }

  function save() {
    const buildingsForSave = draft.buildings.map(({ roomsText, ...building }) => ({
      ...building,
      floors: Math.max(1, Number(building.floors) || 1),
      basements: Math.max(0, Number(building.basements) || 0),
      rooms: parseRooms(roomsText),
    }));
    onSave({ ...draft, buildings: buildingsForSave }, newPlanUrl);
  }

  function previewStyle(building) {
    const left = ((Number(building.x) - Number(building.w) / 2) / CAMPUS.width + 0.5) * 100;
    const top = ((Number(building.z) - Number(building.d) / 2) / CAMPUS.depth + 0.5) * 100;
    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${(Number(building.w) / CAMPUS.width) * 100}%`,
      height: `${(Number(building.d) / CAMPUS.depth) * 100}%`,
      borderColor: building.accent || '#2bb8a5',
      background: `${building.accent || '#2bb8a5'}4d`,
    };
  }

  function pointerToCampus(event) {
    const rect = previewRef.current.getBoundingClientRect();
    const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const nz = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    return {
      x: Math.round(((nx - 0.5) * CAMPUS.width) * 10) / 10,
      z: Math.round(((nz - 0.5) * CAMPUS.depth) * 10) / 10,
    };
  }

  function clampBuildingEdges(left, right, top, bottom) {
    const minSize = 1.2;
    left = clamp(left, -CAMPUS.width / 2, CAMPUS.width / 2 - minSize);
    right = clamp(right, left + minSize, CAMPUS.width / 2);
    top = clamp(top, -CAMPUS.depth / 2, CAMPUS.depth / 2 - minSize);
    bottom = clamp(bottom, top + minSize, CAMPUS.depth / 2);
    return {
      x: Math.round(((left + right) / 2) * 10) / 10,
      z: Math.round(((top + bottom) / 2) * 10) / 10,
      w: Math.round((right - left) * 10) / 10,
      d: Math.round((bottom - top) * 10) / 10,
    };
  }

  function beginPreviewDrag(event, building, handle = 'move') {
    event.preventDefault();
    event.stopPropagation();
    setSelectedBuildingId(building.id);
    const point = pointerToCampus(event);
    const action = {
      id: building.id,
      handle,
      startPointer: point,
      start: {
        x: Number(building.x) || 0,
        z: Number(building.z) || 0,
        w: Math.max(1.2, Number(building.w) || 1.2),
        d: Math.max(1.2, Number(building.d) || 1.2),
      },
    };
    dragActionRef.current = action;
    setDragAction(action);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function movePreviewDrag(event) {
    const action = dragActionRef.current || dragAction;
    if (!action) return;
    const point = pointerToCampus(event);
    const dx = point.x - action.startPointer.x;
    const dz = point.z - action.startPointer.z;
    const start = action.start;

    if (action.handle === 'move') {
      patchBuilding(action.id, {
        x: Math.round(clamp(start.x + dx, -CAMPUS.width / 2 + start.w / 2, CAMPUS.width / 2 - start.w / 2) * 10) / 10,
        z: Math.round(clamp(start.z + dz, -CAMPUS.depth / 2 + start.d / 2, CAMPUS.depth / 2 - start.d / 2) * 10) / 10,
      });
      return;
    }

    let left = start.x - start.w / 2;
    let right = start.x + start.w / 2;
    let top = start.z - start.d / 2;
    let bottom = start.z + start.d / 2;
    if (action.handle.includes('w')) left = point.x;
    if (action.handle.includes('e')) right = point.x;
    if (action.handle.includes('n')) top = point.z;
    if (action.handle.includes('s')) bottom = point.z;
    patchBuilding(action.id, clampBuildingEdges(left, right, top, bottom));
  }

  function endPreviewDrag() {
    dragActionRef.current = null;
    setDragAction(null);
  }

  const selectedBuilding = draft.buildings.find((building) => building.id === selectedBuildingId);

  return (
    <div className="editor-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="school-editor-modal" role="dialog" aria-modal="true" aria-label="編輯目前學校">
        <header className="editor-header">
          <div>
            <p className="editor-eyebrow">目前學校</p>
            <h2>編輯學校與建築設定</h2>
          </div>
          <button type="button" className="icon-button" aria-label="關閉" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="editor-body">
          <section className="editor-section editor-school-section">
            <label className="editor-field editor-field-wide">
              <span>學校名稱</span>
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="editor-upload">
              <Upload size={18} />
              <span>{newPlanUrl ? '已更新底圖' : '更新底圖'}</span>
              <small>JPG / PNG</small>
              <input type="file" accept="image/*" onChange={(event) => updatePlanFile(event.target.files?.[0])} />
            </label>
            {fileError && <p className="editor-error">{fileError}</p>}
          </section>

          <section className="editor-preview-section">
            <div className="editor-preview-head">
              <div>
                <h3>底圖與建築預覽</h3>
                <p>點選建築框後可拖曳移動，拉白色控制點可調整大小；下方數值會同步更新。</p>
              </div>
              <span>{draft.buildings.length} 棟</span>
            </div>
            <div
              className="editor-map-preview"
              ref={previewRef}
              onPointerMove={movePreviewDrag}
              onPointerUp={endPreviewDrag}
              onPointerCancel={endPreviewDrag}
              onMouseMove={movePreviewDrag}
              onMouseUp={endPreviewDrag}
            >
              {draft.planUrl ? <img src={draft.planUrl} alt="目前學校底圖" draggable="false" /> : null}
              <div className="editor-map-grid" />
              {draft.buildings.map((building) => {
                const selected = building.id === selectedBuildingId;
                return (
                  <div
                    key={building.id}
                    className={`editor-building-box${selected ? ' is-selected' : ''}`}
                    style={previewStyle(building)}
                    onPointerDown={(event) => beginPreviewDrag(event, building, 'move')}
                    onMouseDown={(event) => beginPreviewDrag(event, building, 'move')}
                    role="button"
                    tabIndex={0}
                  >
                    <strong>{building.name || '未命名建築'}</strong>
                    <small>{building.floors}F · {building.w} x {building.d}</small>
                    {selected && ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                      <span
                        key={handle}
                        className={`editor-resize-handle handle-${handle}`}
                        onPointerDown={(event) => beginPreviewDrag(event, building, handle)}
                        onMouseDown={(event) => beginPreviewDrag(event, building, handle)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
            {selectedBuilding && (
              <p className="editor-preview-selected">目前選取：<strong>{selectedBuilding.name}</strong>，X {selectedBuilding.x} / Z {selectedBuilding.z} / W {selectedBuilding.w} / D {selectedBuilding.d}</p>
            )}
          </section>

          <section className="editor-section">
            <div className="editor-section-head">
              <div>
                <h3>建築物設定</h3>
                <p>可在上方圖面拖拉，或在這裡精準輸入 X / Z / W / D。</p>
              </div>
              <button type="button" className="editor-add-btn" onClick={addBuilding}><Plus size={15} /> 新增建築</button>
            </div>

            <div className="editor-building-list">
              {draft.buildings.map((building, index) => (
                <article key={building.id} className={`editor-building-card${building.id === selectedBuildingId ? ' is-selected' : ''}`} onClick={() => setSelectedBuildingId(building.id)}>
                  <div className="editor-building-main">
                    <label className="editor-field editor-field-name">
                      <span>建築名稱</span>
                      <input value={building.name} onChange={(event) => updateBuilding(building.id, 'name', event.target.value)} />
                    </label>
                    <label className="editor-field editor-field-color">
                      <span>顏色</span>
                      <select value={building.accent || BUILDING_ACCENT_OPTIONS[0]} onChange={(event) => updateBuilding(building.id, 'accent', event.target.value)}>
                        {BUILDING_ACCENT_OPTIONS.map((color) => <option key={color} value={color}>{color}</option>)}
                      </select>
                    </label>
                    <button type="button" className="editor-remove-btn" title="移除建築" onClick={(event) => { event.stopPropagation(); removeBuilding(building.id); }}><Trash2 size={16} /></button>
                  </div>

                  <div className="editor-grid-fields">
                    <label className="editor-field"><span>X</span><input type="number" step="0.5" value={building.x} onChange={(event) => updateNumericBuilding(building.id, 'x', event.target.value)} /></label>
                    <label className="editor-field"><span>Z</span><input type="number" step="0.5" value={building.z} onChange={(event) => updateNumericBuilding(building.id, 'z', event.target.value)} /></label>
                    <label className="editor-field"><span>W</span><input type="number" min="1.2" step="0.5" value={building.w} onChange={(event) => updateNumericBuilding(building.id, 'w', event.target.value)} /></label>
                    <label className="editor-field"><span>D</span><input type="number" min="1.2" step="0.5" value={building.d} onChange={(event) => updateNumericBuilding(building.id, 'd', event.target.value)} /></label>
                    <label className="editor-field"><span>樓層</span><input type="number" min="1" max="20" value={building.floors} onChange={(event) => updateNumericBuilding(building.id, 'floors', event.target.value)} /></label>
                    <label className="editor-field"><span>地下</span><input type="number" min="0" max="5" value={building.basements || 0} onChange={(event) => updateNumericBuilding(building.id, 'basements', event.target.value)} /></label>
                  </div>

                  <label className="editor-field editor-room-field">
                    <span>房間 / 空間</span>
                    <textarea
                      value={building.roomsText || ''}
                      placeholder="1F：101、102\n2F：201、202"
                      onChange={(event) => updateBuilding(building.id, 'roomsText', event.target.value)}
                    />
                  </label>
                </article>
              ))}
              {!draft.buildings.length && <p className="editor-empty">目前沒有建築資料，可先新增一棟建築。</p>}
            </div>
          </section>
        </div>

        <footer className="editor-footer">
          <button type="button" className="editor-cancel-btn" onClick={onClose}>取消</button>
          <button type="button" className="editor-save-btn" onClick={save}><Check size={16} /> 儲存更新</button>
        </footer>
      </div>
    </div>
  );
}


function CampusScene({
  mode,
  showPlan,
  showDevices,
  showHeatmap,
  showCabling,
  heightScale,
  selectedEntity,
  selectedId,
  selectedFloor,
  cameraPreset,
  sceneVersion,
  planUrl,
  showDefaultFeatures,
  onSelect,
  onHover,
  onFloorSelect,
}) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const contentRef = useRef(null);
  const interactiveRef = useRef([]);
  const animationRef = useRef(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const walkKeysRef = useRef(new Set());

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f7f8f5');
    scene.fog = new THREE.Fog('#f7f8f5', 115, 210);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    camera.position.set(72, 80, 96);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 28;
    controls.maxDistance = 190;
    controls.target.set(0, 0, 6);

    const hemisphere = new THREE.HemisphereLight('#ffffff', '#b7c0bd', 1.8);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight('#ffffff', 2.4);
    sun.position.set(52, 86, 42);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 180;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    scene.add(sun);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const width = Math.max(rect.width, 320);
      const height = Math.max(rect.height, 320);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener('resize', resize);

    const fwdVec = new THREE.Vector3();
    const rightVec = new THREE.Vector3();

    const animate = () => {
      controls.update();

      const wk = walkKeysRef.current;
      if (wk.size > 0) {
        const speed = 0.22;
        camera.getWorldDirection(fwdVec);
        fwdVec.y = 0;
        if (fwdVec.lengthSq() > 0.001) fwdVec.normalize();
        rightVec.crossVectors(fwdVec, new THREE.Vector3(0, 1, 0)).normalize();

        const delta = new THREE.Vector3();
        if (wk.has('i')) delta.addScaledVector(fwdVec, speed);
        if (wk.has('k')) delta.addScaledVector(fwdVec, -speed);
        if (wk.has('j')) delta.addScaledVector(rightVec, -speed);
        if (wk.has('l')) delta.addScaledVector(rightVec, speed);
        camera.position.add(delta);
        controls.target.add(delta);
      }

      renderer.render(scene, camera);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
      controls.dispose();
      renderer.dispose();
      disposeObject(scene);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (contentRef.current) {
      scene.remove(contentRef.current);
      disposeObject(contentRef.current);
    }

    const content = new THREE.Group();
    interactiveRef.current = [];

    addGround(content, showPlan, planUrl);
    if (showDefaultFeatures) addCampusFeatures(content);

    if (showHeatmap) {
      heatZones.forEach((zone) => addHeatZone(content, zone, mode, selectedId, interactiveRef.current));
    }

    const activeBuildingId = getActiveBuildingId(selectedId);
    buildings.forEach((building) => addBuilding(content, building, mode, heightScale, selectedId, activeBuildingId, showDevices || showCabling, selectedFloor, interactiveRef.current));

    if (showCabling) {
      addCableInfrastructure(content, mode, selectedId, heightScale, interactiveRef.current);
    }

    if (showDevices) {
      devices.forEach((device) => addDevice(content, device, mode, selectedId, heightScale, interactiveRef.current));
    }

    scene.add(content);
    contentRef.current = content;
  }, [mode, showPlan, showDevices, showHeatmap, showCabling, heightScale, selectedId, selectedFloor, sceneVersion, planUrl, showDefaultFeatures]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !selectedEntity) return;
    if (!selectedEntity.floors && selectedEntity.type !== 'ap' && selectedEntity.type !== 'switch') return;

    const target = selectedEntity.floors
      ? getBuildingFocus(selectedEntity, heightScale)
      : getDeviceFocus(selectedEntity, heightScale);

    flyCameraTo(camera, controls, target.position, target.lookAt);
  }, [selectedEntity, heightScale]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const presets = {
      home: { position: [72, 80, 96], target: [0, 0, 6] },
      top: { position: [0, 146, 0.01], target: [0, 0, 0] },
      east: { position: [112, 56, 4], target: [4, 0, 2] },
    };

    const preset = presets[cameraPreset.name] || presets.home;
    camera.position.set(...preset.position);
    controls.target.set(...preset.target);
    controls.update();
  }, [cameraPreset]);

  useEffect(() => {
    const canvas = canvasRef.current;

    const pick = (event, shouldSelect = false) => {
      const camera = cameraRef.current;
      if (!camera) return null;
      const rect = canvas.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      if (selectedEntity?.floors && !event.buttons) {
        const nextFloor = floorFromPointer(event, rect, selectedEntity.floors);
        if (nextFloor !== selectedFloor) onFloorSelect(nextFloor);
      }
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hits = raycasterRef.current.intersectObjects(interactiveRef.current, true);
      const hit = hits.find((item) => item.object.userData?.entity);
      const entity = hit?.object.userData?.entity || null;
      canvas.style.cursor = entity ? 'pointer' : 'grab';
      onHover(entity);
      if (shouldSelect && entity) onSelect(entity);
      return entity;
    };

    const handleMove = (event) => {
      if (walkKeysRef.current.size > 0) return;
      pick(event, false);
    };
    const handleLeave = () => {
      canvas.style.cursor = 'grab';
      onHover(null);
    };
    const handleClick = (event) => pick(event, true);

    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerleave', handleLeave);
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerleave', handleLeave);
      canvas.removeEventListener('click', handleClick);
    };
  }, [onFloorSelect, onHover, onSelect, selectedEntity, selectedFloor]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls || isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const shift = event.shiftKey ? 1.8 : 1;
      const yawStep = 0.085 * shift;
      const pitchStep = 0.055 * shift;
      const zoomStep = event.shiftKey ? 0.82 : 0.9;

      if (key === 'a' || event.key === 'ArrowLeft') {
        event.preventDefault();
        orbitCamera(camera, controls, yawStep, 0);
      } else if (key === 'd' || event.key === 'ArrowRight') {
        event.preventDefault();
        orbitCamera(camera, controls, -yawStep, 0);
      } else if (key === 'w' || event.key === 'ArrowUp') {
        event.preventDefault();
        orbitCamera(camera, controls, 0, -pitchStep);
      } else if (key === 's' || event.key === 'ArrowDown') {
        event.preventDefault();
        orbitCamera(camera, controls, 0, pitchStep);
      } else if (key === '=' || key === '+' || key === 'q') {
        event.preventDefault();
        zoomCamera(camera, controls, zoomStep);
      } else if (key === '-' || key === '_' || key === 'e') {
        event.preventDefault();
        zoomCamera(camera, controls, 1 / zoomStep);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const WALK_KEYS = new Set(['i', 'j', 'k', 'l']);
    const onDown = (e) => {
      const k = e.key.toLowerCase();
      if (WALK_KEYS.has(k)) { e.preventDefault(); walkKeysRef.current.add(k); }
    };
    const onUp = (e) => walkKeysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  return <canvas ref={canvasRef} className="campus-canvas" aria-label="壽山高中 3D 校園 WiFi 監控場景" />;
}

function addGround(group, showPlan, planUrl = '/school-plan.jpg') {
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(CAMPUS.width + 8, CAMPUS.depth + 8),
    new THREE.MeshStandardMaterial({ color: '#e7ece6', roughness: 0.88 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.08;
  base.receiveShadow = true;
  group.add(base);

  const grid = new THREE.GridHelper(132, 22, '#9aa8a2', '#c9d1ca');
  grid.position.y = 0.01;
  grid.material.opacity = 0.22;
  grid.material.transparent = true;
  group.add(grid);

  const points = [
    [-43, 0.05, -58],
    [37, 0.05, -58],
    [47, 0.05, -46],
    [47, 0.05, 61],
    [7, 0.05, 61],
    [2, 0.05, 57],
    [-47, 0.05, 57],
    [-47, 0.05, -20],
    [-41, 0.05, -58],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const border = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: '#8b4b4f', linewidth: 2 }),
  );
  group.add(border);

  if (showPlan) {
    new THREE.TextureLoader().load(planUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      const map = new THREE.Mesh(
        new THREE.PlaneGeometry(CAMPUS.width, CAMPUS.depth),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.52, depthWrite: false }),
      );
      map.rotation.x = -Math.PI / 2;
      map.position.y = 0.015;
      map.renderOrder = 1;
      group.add(map);
    });
  }
}

function addCampusFeatures(group) {
  addField(group, { x: 0, z: -14, w: 19, d: 15, color: '#dfe8df', label: '排球場' });
  addCourt(group, { x: -8, z: -52, w: 16, d: 9, label: '籃球場' });
  addCourt(group, { x: 8, z: -52, w: 16, d: 9, label: '籃球場' });
  addField(group, { x: 40, z: -16, w: 5, d: 28, color: '#e6ebdf', label: '棒球練習場' });

  const track = new THREE.Mesh(
    new THREE.RingGeometry(10.5, 18.5, 96),
    new THREE.MeshBasicMaterial({ color: '#d9e4dc', transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  );
  track.rotation.x = -Math.PI / 2;
  track.scale.x = 0.78;
  track.position.set(0, 0.04, -13);
  group.add(track);

  const trackLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(makeEllipsePoints(0, -13, 14.2, 24.5, 96)),
    new THREE.LineBasicMaterial({ color: '#53605d', transparent: true, opacity: 0.55 }),
  );
  trackLine.position.y = 0.08;
  group.add(trackLine);
}

function addField(group, { x, z, w, d, color, label }) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.045, z);
  group.add(mesh);
  group.add(createLabel(label, [x, 0.5, z], [8, 2.2, 1], '#31403c', 'rgba(255,255,255,0.56)'));
}

function addCourt(group, { x, z, w, d, label }) {
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ color: '#eaded9', transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  court.rotation.x = -Math.PI / 2;
  court.position.set(x, 0.05, z);
  group.add(court);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.03, d)),
    new THREE.LineBasicMaterial({ color: '#9b5a59', transparent: true, opacity: 0.72 }),
  );
  edge.position.set(x, 0.08, z);
  group.add(edge);
  group.add(createLabel(label, [x, 0.55, z], [7.2, 2, 1], '#4e312d', 'rgba(255,255,255,0.5)'));
}

function addBuilding(group, building, mode, heightScale, selectedId, activeBuildingId, showDevices, selectedFloor, interactive) {
  const status = buildingStatus(building.id);
  const isActive = activeBuildingId === building.id;
  const highlightedFloor = isActive && selectedFloor ? Math.min(building.floors, Math.max(1, selectedFloor)) : null;
  const xray = isActive && showDevices;
  const floorHeight = 1.85;
  const h = Math.max(2.7, building.floors * floorHeight * heightScale);
  const color = mode === 'health' && status !== 'online' ? HEALTH[status].color : '#d8dee2';
  const bodyOpacity = xray ? 0.42 : 1;
  const roofOpacity = xray ? 0.58 : 1;
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: bodyOpacity < 1,
    opacity: bodyOpacity,
    depthWrite: bodyOpacity === 1,
    roughness: 0.72,
    metalness: 0.03,
    emissive: isActive ? '#6fcdb7' : '#000000',
    emissiveIntensity: isActive ? 0.18 : 0,
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(building.w, h, building.d), material);
  mesh.position.set(building.x, h / 2, building.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.entity = building;
  interactive.push(mesh);
  group.add(mesh);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(building.w + 0.3, 0.18, building.d + 0.3),
    new THREE.MeshStandardMaterial({
      color: isActive ? '#2bb8a5' : building.accent,
      transparent: roofOpacity < 1,
      opacity: roofOpacity,
      depthWrite: roofOpacity === 1,
      roughness: 0.65,
    }),
  );
  roof.position.set(building.x, h + 0.1, building.z);
  roof.castShadow = true;
  roof.userData.entity = building;
  interactive.push(roof);
  group.add(roof);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(building.w + 0.04, h + 0.04, building.d + 0.04)),
    new THREE.LineBasicMaterial({ color: '#58646d', transparent: true, opacity: 0.42 }),
  );
  edges.position.copy(mesh.position);
  group.add(edges);

  if (isActive || mode === 'planning') {
    addFloorStructure(group, building, floorHeight * heightScale, h, isActive, highlightedFloor);
  } else {
    addFacadeWindows(group, building, floorHeight * heightScale);
  }
  addRoomLabels(group, building, floorHeight * heightScale, isActive, interactive, highlightedFloor, isActive);
  if (isActive) addRoofDashboard(group, building, h, highlightedFloor, status);
  if (isActive) addBuildingFocusFrame(group, building, h);
  const nameLabel = createLabel(
    building.name,
    [building.x, h + 2.2, building.z],
    [Math.min(13, building.w + 3), isActive ? 2.5 : 2.0, 1],
    isActive ? '#1f3138' : '#4a6068',
    isActive ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)',
  );
  group.add(nameLabel);
}

function addBuildingFocusFrame(group, building, height) {
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(building.w + 1.2, height + 0.8, building.d + 1.2)),
    new THREE.LineBasicMaterial({ color: '#20c4a9', transparent: true, opacity: 0.92 }),
  );
  frame.position.set(building.x, height / 2 + 0.35, building.z);
  group.add(frame);
}

function addRoofDashboard(group, building, height, highlightedFloor, status) {
  const floor = highlightedFloor || building.floors;
  const buildingDevices = devices.filter((device) => device.building === building.id);
  const floorDevices = buildingDevices.filter((device) => parseDeviceFloor(device.floor) === floor);
  const faultCount = buildingDevices.filter((device) => device.status === 'offline').length;
  const roomCount = building.rooms?.[floor]?.length || 0;
  const deckWidth = Math.max(7, Math.min(building.w * 0.72, 20));
  const deckDepth = Math.max(3.5, Math.min(building.d * 0.42, 8));
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(deckWidth, 0.1, deckDepth),
    new THREE.MeshBasicMaterial({
      color: HEALTH[status]?.color || '#b7f5df',
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  deck.position.set(building.x, height + 0.36, building.z);
  deck.renderOrder = 14;
  group.add(deck);

  const labelText = `${floor}F | ${roomCount} 間 | AP ${floorDevices.length} | 故障 ${faultCount}`;
  const label = createLabel(labelText, [building.x, height + 1.25, building.z], [Math.max(7, Math.min(deckWidth + 2.5, 18)), 1.08, 1], '#12312e', 'rgba(232,255,246,0.9)');
  label.renderOrder = 18;
  group.add(label);
}

function addFloorStructure(group, building, floorStep, height, isSelected, highlightedFloor) {
  const lineMaterial = new THREE.LineBasicMaterial({
    color: isSelected ? '#2bb8a5' : '#ffffff',
    transparent: true,
    opacity: isSelected ? 0.92 : 0.72,
  });

  for (let floor = 1; floor < building.floors; floor += 1) {
    const y = floor * floorStep;
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(building.x - building.w / 2 - 0.03, y, building.z - building.d / 2 - 0.03),
        new THREE.Vector3(building.x + building.w / 2 + 0.03, y, building.z - building.d / 2 - 0.03),
        new THREE.Vector3(building.x + building.w / 2 + 0.03, y, building.z + building.d / 2 + 0.03),
        new THREE.Vector3(building.x - building.w / 2 - 0.03, y, building.z + building.d / 2 + 0.03),
      ]),
      lineMaterial,
    );
    group.add(outline);
  }

  const slabMaterial = new THREE.MeshBasicMaterial({
    color: isSelected ? '#74e0ca' : '#f3faf7',
    transparent: true,
    opacity: isSelected ? 0.48 : 0.34,
    depthWrite: false,
  });

  for (let floor = 1; floor <= building.floors; floor += 1) {
    const y = Math.max(0.42, floor * floorStep - 0.05);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(building.w + 0.16, 0.04, building.d + 0.16), slabMaterial);
    slab.position.set(building.x, y, building.z);
    group.add(slab);
  }

  if (highlightedFloor) {
    const floorY = (highlightedFloor - 0.5) * floorStep;
    const highlight = new THREE.Mesh(
      new THREE.BoxGeometry(building.w + 0.52, floorStep * 0.72, building.d + 0.52),
      new THREE.MeshBasicMaterial({
        color: '#2bb8a5',
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    highlight.position.set(building.x, floorY, building.z);
    highlight.renderOrder = 6;
    group.add(highlight);

    const ring = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(building.w + 0.6, floorStep * 0.78, building.d + 0.6)),
      new THREE.LineBasicMaterial({ color: '#14b8a6', transparent: true, opacity: 0.95 }),
    );
    ring.position.copy(highlight.position);
    ring.renderOrder = 7;
    group.add(ring);
  }

  addFacadeWindows(group, building, floorStep);
  addFloorLabels(group, building, floorStep, height);
}

function addFloorLabels(group, building, floorStep, height) {
  const labelX = building.x - building.w / 2 + Math.min(2, building.w * 0.18);
  const labelZ = building.z + building.d / 2 + 0.96;

  for (let floor = 1; floor <= building.floors; floor += 1) {
    const y = (floor - 0.5) * floorStep;
    const label = createLabel(`${floor}F`, [labelX, y, labelZ], [3.1, 0.96, 1], '#17252a', 'rgba(255,255,255,0.86)');
    group.add(label);
  }

  if (building.basements) {
    const baseLabel = createLabel('B1', [labelX + 3.1, 0.44, labelZ], [2.55, 0.8, 1], '#5b3c35', 'rgba(255,239,220,0.9)');
    group.add(baseLabel);
  }

  const sideX = building.x + building.w / 2 + 0.62;
  const sideZ = building.z + building.d / 2 - Math.min(2, building.d * 0.18);
  const topLabel = createLabel(buildingLevelSummary(building), [sideX, Math.max(1.2, height - 0.65), sideZ], [3.6, 0.86, 1], '#223137', 'rgba(255,255,255,0.76)');
  group.add(topLabel);

  if (building.d >= 12) {
    const cornerX = building.x + building.w / 2 + 0.86;
    const cornerZ = building.z + building.d / 2 - Math.min(1.6, building.d * 0.12);
    for (let floor = 1; floor <= building.floors; floor += 1) {
      const y = (floor - 0.5) * floorStep;
      const label = createLabel(`${floor}F`, [cornerX, y, cornerZ], [2.65, 0.84, 1], '#17252a', 'rgba(255,255,255,0.8)');
      group.add(label);
    }
  }
}

function addRoomLabels(group, building, floorStep, showRooms, interactive, highlightedFloor, isActive) {
  if (!showRooms || !building.rooms) return;

  const longAxis = building.w >= building.d ? 'x' : 'z';
  const color = '#26383d';
  const floorEntries = Object.entries(building.rooms)
    .map(([floor, rooms]) => [Number(floor), rooms])
    .sort(([a], [b]) => a - b);

  floorEntries.forEach(([floor, rooms]) => {
    const y = (floor - 0.5) * floorStep - 0.34;
    const count = rooms.length;
    const usable = longAxis === 'x' ? building.w * 0.72 : building.d * 0.72;
    const step = count <= 1 ? 0 : usable / (count - 1);
    const start = -usable / 2;

    rooms.forEach((room, index) => {
      const isCurrent = highlightedFloor === floor;
      const offset = start + step * index;
      const position = longAxis === 'x'
        ? [building.x + offset, y, building.z + building.d / 2 + 1.45]
        : [building.x + building.w / 2 + 1.4, y, building.z + offset];
      const scaleBoost = isCurrent ? 1.2 : 1;
      const scale = String(room).length >= 5
        ? [3.15 * scaleBoost, 0.76 * scaleBoost, 1]
        : [2.42 * scaleBoost, 0.72 * scaleBoost, 1];
      const label = createLabel(room, position, scale, color, isCurrent ? 'rgba(217,255,242,0.95)' : 'rgba(255,255,255,0.86)');
      label.material.opacity = isActive && highlightedFloor && !isCurrent ? 0.44 : 1;
      label.renderOrder = isCurrent ? 20 : 9;
      label.userData.entity = building;
      interactive.push(label);
      group.add(label);
    });
  });
}

function addFacadeWindows(group, building, floorStep) {
  const windowMaterial = new THREE.MeshBasicMaterial({
    color: '#eef6f1',
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mullionMaterial = new THREE.MeshBasicMaterial({
    color: '#6f8087',
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const southColumns = Math.max(2, Math.min(8, Math.floor(building.w / 5)));
  const eastColumns = Math.max(2, Math.min(7, Math.floor(building.d / 6)));

  for (let floor = 1; floor <= building.floors; floor += 1) {
    const y = (floor - 0.52) * floorStep;
    addWindowRow(group, {
      count: southColumns,
      centerX: building.x,
      start: building.x - building.w * 0.36,
      span: building.w * 0.72,
      y,
      z: building.z + building.d / 2 + 0.055,
      width: Math.min(2.1, building.w / (southColumns * 1.75)),
      horizontal: true,
      windowMaterial,
      mullionMaterial,
    });

    addWindowRow(group, {
      count: eastColumns,
      centerX: building.z,
      start: building.z - building.d * 0.34,
      span: building.d * 0.68,
      y,
      x: building.x + building.w / 2 + 0.055,
      width: Math.min(2, building.d / (eastColumns * 1.75)),
      horizontal: false,
      windowMaterial,
      mullionMaterial,
    });
  }
}

function addWindowRow(group, options) {
  const gap = options.count === 1 ? 0 : options.span / (options.count - 1);
  for (let index = 0; index < options.count; index += 1) {
    const offset = options.start + gap * index;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(options.width, 0.42), options.windowMaterial);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(options.width, 0.07), options.mullionMaterial);
    stripe.position.y = 0.16;
    pane.add(stripe);

    if (options.horizontal) {
      pane.position.set(offset, options.y, options.z);
    } else {
      pane.position.set(options.x, options.y, offset);
      pane.rotation.y = Math.PI / 2;
    }
    group.add(pane);
  }
}

function getActiveBuildingId(selectedId) {
  if (!selectedId) return null;
  const building = buildings.find((item) => item.id === selectedId);
  if (building) return building.id;
  const device = devices.find((item) => item.id === selectedId);
  if (device?.building && device.building !== 'outdoor') return device.building;
  return null;
}

function getInitialFloorForEntity(entity) {
  if (!entity) return null;
  if (entity.floors) return entity.floors;
  if (entity.type === 'ap' || entity.type === 'switch') {
    const floor = parseDeviceFloor(entity.floor);
    return floor > 0 ? floor : null;
  }
  return null;
}

function floorFromPointer(event, rect, floors) {
  const ratio = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  return Math.min(floors, Math.max(1, Math.floor(ratio * floors) + 1));
}

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
}

function orbitCamera(camera, controls, yaw, pitch) {
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta += yaw;
  spherical.phi = Math.min(Math.PI * 0.48, Math.max(0.24, spherical.phi + pitch));
  offset.setFromSpherical(spherical);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

function zoomCamera(camera, controls, scale) {
  const offset = camera.position.clone().sub(controls.target);
  const nextDistance = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * scale));
  offset.setLength(nextDistance);
  camera.position.copy(controls.target).add(offset);
  controls.update();
}

function getBuildingFocus(building, heightScale) {
  const height = Math.max(2.7, building.floors * 1.85 * heightScale);
  const span = Math.max(building.w, building.d);
  const distance = Math.max(24, span * 1.18);
  const lookAt = new THREE.Vector3(building.x, height * 0.48, building.z);
  const position = new THREE.Vector3(building.x + distance * 0.52, height + 15, building.z + distance * 0.88);
  return { position, lookAt };
}

function getDeviceFocus(device, heightScale) {
  const position = getDeviceRenderPosition(device, heightScale);
  const building = buildings.find((item) => item.id === device.building);
  const span = building ? Math.max(building.w, building.d) : 18;
  const distance = Math.max(22, span * 0.72);
  const lookAt = new THREE.Vector3(position.x, position.y, position.z);
  return {
    lookAt,
    position: new THREE.Vector3(position.x + distance * 0.55, position.y + 10, position.z + distance * 0.72),
  };
}

function flyCameraTo(camera, controls, position, lookAt) {
  cancelAnimationFrame(camera.userData.focusAnimation);
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const duration = 520;
  const start = performance.now();

  const step = (time) => {
    const progress = Math.min(1, (time - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    camera.position.lerpVectors(startPosition, position, eased);
    controls.target.lerpVectors(startTarget, lookAt, eased);
    controls.update();
    if (progress < 1) camera.userData.focusAnimation = requestAnimationFrame(step);
  };

  camera.userData.focusAnimation = requestAnimationFrame(step);
}

function getDeviceRenderPosition(device, heightScale) {
  const building = buildings.find((item) => item.id === device.building);
  if (!building || device.building === 'outdoor') return { x: device.x, y: 1.6, z: device.z, leader: false };

  const floorStep = 1.85 * heightScale;
  const floorNumber = parseDeviceFloor(device.floor);
  const maxHeight = Math.max(2.7, building.floors * floorStep);
  const y = floorNumber <= 0
    ? 0.45
    : Math.min(maxHeight - 0.42, Math.max(0.85, (floorNumber - 0.5) * floorStep));

  const minX = building.x - building.w / 2;
  const maxX = building.x + building.w / 2;
  const minZ = building.z - building.d / 2;
  const maxZ = building.z + building.d / 2;
  const inside = device.x > minX && device.x < maxX && device.z > minZ && device.z < maxZ;
  if (!inside) return { x: device.x, y, z: device.z, leader: false };

  const distances = [
    { side: 'west', value: device.x - minX },
    { side: 'east', value: maxX - device.x },
    { side: 'north', value: device.z - minZ },
    { side: 'south', value: maxZ - device.z },
  ].sort((a, b) => a.value - b.value);
  const side = distances[0].side;
  const margin = 1.35;
  const clampedX = Math.min(maxX - 0.8, Math.max(minX + 0.8, device.x));
  const clampedZ = Math.min(maxZ - 0.8, Math.max(minZ + 0.8, device.z));

  if (side === 'west') return { x: minX - margin, y, z: clampedZ, leader: true };
  if (side === 'east') return { x: maxX + margin, y, z: clampedZ, leader: true };
  if (side === 'north') return { x: clampedX, y, z: minZ - margin, leader: true };
  return { x: clampedX, y, z: maxZ + margin, leader: true };
}

function parseDeviceFloor(floor) {
  if (!floor) return 1;
  if (String(floor).toUpperCase().startsWith('B')) return 0;
  const match = String(floor).match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function addHeatZone(group, zone, mode, selectedId, interactive) {
  const color = zoneColor(zone, mode);
  const opacity = mode === 'planning' ? 0.22 : selectedId === zone.id ? 0.68 : 0.48;
  const geometry = zone.type === 'circle' ? new THREE.CircleGeometry(1, 80) : new THREE.PlaneGeometry(zone.w, zone.d);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  if (zone.type === 'circle') mesh.scale.set(zone.rx, zone.rz, 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(zone.x, 0.19, zone.z);
  mesh.renderOrder = 4;
  mesh.userData.entity = zone;
  interactive.push(mesh);
  group.add(mesh);

  const ringGeometry = zone.type === 'circle'
    ? new THREE.RingGeometry(0.97, 1, 80)
    : new THREE.EdgesGeometry(new THREE.BoxGeometry(zone.w, 0.03, zone.d));
  const ring = zone.type === 'circle'
    ? new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide }))
    : new THREE.LineSegments(ringGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  if (zone.type === 'circle') {
    ring.scale.set(zone.rx, zone.rz, 1);
    ring.rotation.x = -Math.PI / 2;
  }
  ring.position.set(zone.x, 0.25, zone.z);
  ring.userData.entity = zone;
  interactive.push(ring);
  group.add(ring);

  if (selectedId === zone.id) {
    const beacon = new THREE.Mesh(
      zone.type === 'circle' ? new THREE.CylinderGeometry(1, 1, 5.2, 72, 1, true) : new THREE.BoxGeometry(zone.w, 5.2, zone.d),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
    );
    if (zone.type === 'circle') beacon.scale.set(zone.rx, 1, zone.rz);
    beacon.position.set(zone.x, 2.8, zone.z);
    group.add(beacon);
  }

  group.add(createLabel(zone.label, [zone.x, 1.05, zone.z], [Math.min(14, (zone.w || zone.rx) + 4), 2.2, 1], '#17252a'));
}

function cableColorForLink(link, selected, fallbackStatus) {
  const status = link?.status || fallbackStatus;
  if (status === 'offline') return HEALTH.offline.color;
  if (status === 'warning') return HEALTH.warning.color;
  if (selected) return CABLING.selected.color;
  return link?.medium === 'fiber' ? CABLING.fiber.color : CABLING.copper.color;
}

function addCableInfrastructure(group, mode, selectedId, heightScale, interactive) {
  const floorStep = 1.85 * heightScale;
  const activeBuildingId = getActiveBuildingId(selectedId);
  const selectedDevice = devices.find((device) => device.id === selectedId);
  const coreDevice = devices.find((device) => device.type === 'switch' && /core|核心/i.test(`${device.id} ${device.name}`))
    || devices.find((device) => device.type === 'switch')
    || devices[0];
  const corePoint = coreDevice ? getDeviceRenderPosition(coreDevice, heightScale) : { x: 0, y: 0.25, z: 0 };

  buildings.forEach((building) => {
    const isActive = activeBuildingId === building.id || mode === 'cabling';
    addBuildingCableTrays(group, building, floorStep, isActive, selectedId);
    addBuildingRiser(group, building, floorStep, isActive);

    const riser = getRiserPoint(building, 1, floorStep);
    if (coreDevice && building.id !== coreDevice.building) {
      const highlighted = selectedDevice?.building === building.id || selectedId === building.id;
      addCableTube(group, [
        new THREE.Vector3(corePoint.x, 0.22, corePoint.z),
        new THREE.Vector3(corePoint.x, 0.22, riser.z),
        new THREE.Vector3(riser.x, 0.22, riser.z),
        new THREE.Vector3(riser.x, riser.y, riser.z),
      ], highlighted ? CABLING.selected.color : CABLING.fiber.color, highlighted ? 0.13 : 0.08, highlighted ? 0.92 : 0.42, highlighted ? 48 : 16);
    }
  });

  devices.forEach((device) => {
    if (!device.building || device.building === 'outdoor') return;
    const building = buildings.find((item) => item.id === device.building);
    if (!building) return;
    const selected = selectedId === device.id || selectedId === building.id;
    addDeviceCableDrop(group, building, device, floorStep, heightScale, selected, interactive);
  });

  if (coreDevice) {
    const position = getDeviceRenderPosition(coreDevice, heightScale);
    const coreNode = createCableNode(CABLING.fiber.color, selectedId === coreDevice.id ? 0.72 : 0.5);
    coreNode.position.set(position.x, position.y + 0.55, position.z);
    coreNode.userData.entity = coreDevice;
    interactive.push(coreNode);
    group.add(coreNode);
    const label = createLabel('Core / MDF', [position.x, position.y + 2.05, position.z], [4.7, 1, 1], '#2d165c', 'rgba(244,238,255,0.9)');
    label.renderOrder = 42;
    group.add(label);
  }
}

function addBuildingCableTrays(group, building, floorStep, isActive, selectedId) {
  const floorsToDraw = Array.from({ length: building.floors }, (_, index) => index + 1);
  const opacity = isActive ? 0.72 : 0.32;
  floorsToDraw.forEach((floor) => {
    const side = getCableTraySide(building, floor, floorStep);
    addLadderTray(group, side, isActive ? CABLING.tray.color : '#8b989c', opacity, isActive ? 28 : 12);
    if ((isActive && floor === Math.min(building.floors, 2)) || selectedId === building.id) {
      const center = midpoint(side.a, side.b);
      const label = createLabel('走廊線槽', [center.x, center.y + 0.48, center.z], [4.2, 0.82, 1], '#29363b', 'rgba(255,255,255,0.76)');
      label.renderOrder = 30;
      group.add(label);
    }
  });
}

function addBuildingRiser(group, building, floorStep, isActive) {
  const bottom = getRiserPoint(building, 1, floorStep);
  const top = getRiserPoint(building, building.floors, floorStep);
  bottom.y = 0.24;
  top.y += 0.72;
  addCableTube(group, [new THREE.Vector3(bottom.x, bottom.y, bottom.z), new THREE.Vector3(top.x, top.y, top.z)], CABLING.riser.color, isActive ? 0.085 : 0.055, isActive ? 0.72 : 0.38, isActive ? 32 : 14);

  if (isActive) {
    for (let floor = 1; floor <= building.floors; floor += 1) {
      const point = getRiserPoint(building, floor, floorStep);
      const idf = createCableNode(CABLING.riser.color, 0.52, 0.52);
      idf.position.set(point.x, point.y, point.z);
      group.add(idf);
      if (floor === 1 || floor === building.floors) {
        const label = createLabel(floor === 1 ? 'MDF/IDF' : `${floor}F IDF`, [point.x, point.y + 0.8, point.z], [3.8, 0.82, 1], '#163265', 'rgba(232,241,255,0.82)');
        label.renderOrder = 34;
        group.add(label);
      }
    }
  }
}

function addDeviceCableDrop(group, building, device, floorStep, heightScale, selected, interactive) {
  const floor = Math.max(1, parseDeviceFloor(device.floor));
  const devicePoint = getDeviceRenderPosition(device, heightScale);
  const trayPoint = getNearestTrayPoint(building, floor, floorStep, devicePoint);
  const link = getNetworkLinkForDevice(device.id);
  const faulted = device.status === 'offline' || link?.status === 'offline';
  const color = cableColorForLink(link, selected, device.status);
  const opacity = selected || faulted ? 0.95 : 0.46;
  const radius = selected || faulted ? 0.075 : 0.045;
  const branch = addCableTube(group, [
    new THREE.Vector3(trayPoint.x, trayPoint.y, trayPoint.z),
    new THREE.Vector3(devicePoint.x, trayPoint.y, devicePoint.z),
    new THREE.Vector3(devicePoint.x, devicePoint.y - 0.35, devicePoint.z),
  ], color, radius, opacity, selected ? 52 : 26);
  branch.userData.entity = device;
  interactive.push(branch);

  if (selected) {
    const riser = getRiserPoint(building, floor, floorStep);
    addCableTube(group, [
      new THREE.Vector3(riser.x, riser.y, riser.z),
      new THREE.Vector3(trayPoint.x, trayPoint.y, trayPoint.z),
    ], CABLING.selected.color, 0.08, 0.96, 54);
    const pathLabel = link?.switchPort ? `${device.id} · ${link.switchPort}` : `${device.id} 線路`;
    const label = createLabel(pathLabel, [devicePoint.x, devicePoint.y + 2.25, devicePoint.z], [5.8, 1, 1], '#7a3f00', 'rgba(255,244,218,0.92)');
    label.renderOrder = 56;
    group.add(label);
  }
}

function getCableTraySide(building, floor, floorStep) {
  const y = Math.max(0.62, (floor - 0.5) * floorStep + 0.24);
  const offset = 0.68;
  const inset = 0.92;
  if (building.w >= building.d) {
    const z = building.z + building.d / 2 + offset;
    return {
      axis: 'x',
      a: new THREE.Vector3(building.x - building.w / 2 + inset, y, z),
      b: new THREE.Vector3(building.x + building.w / 2 - inset, y, z),
      perp: new THREE.Vector3(0, 0, 1),
    };
  }
  const x = building.x + building.w / 2 + offset;
  return {
    axis: 'z',
    a: new THREE.Vector3(x, y, building.z - building.d / 2 + inset),
    b: new THREE.Vector3(x, y, building.z + building.d / 2 - inset),
    perp: new THREE.Vector3(1, 0, 0),
  };
}

function getRiserPoint(building, floor, floorStep) {
  const tray = getCableTraySide(building, floor, floorStep);
  return tray.a.clone();
}

function getNearestTrayPoint(building, floor, floorStep, point) {
  const tray = getCableTraySide(building, floor, floorStep);
  if (tray.axis === 'x') {
    return new THREE.Vector3(clamp(point.x, Math.min(tray.a.x, tray.b.x), Math.max(tray.a.x, tray.b.x)), tray.a.y, tray.a.z);
  }
  return new THREE.Vector3(tray.a.x, tray.a.y, clamp(point.z, Math.min(tray.a.z, tray.b.z), Math.max(tray.a.z, tray.b.z)));
}

function addLadderTray(group, tray, color, opacity, renderOrder) {
  const separation = 0.42;
  const railOffset = tray.perp.clone().multiplyScalar(separation / 2);
  const a1 = tray.a.clone().add(railOffset);
  const b1 = tray.b.clone().add(railOffset);
  const a2 = tray.a.clone().sub(railOffset);
  const b2 = tray.b.clone().sub(railOffset);
  addCableTube(group, [a1, b1], color, 0.025, opacity, renderOrder);
  addCableTube(group, [a2, b2], color, 0.025, opacity, renderOrder);

  const length = tray.a.distanceTo(tray.b);
  const rungCount = Math.max(2, Math.floor(length / 2.6));
  for (let index = 0; index <= rungCount; index += 1) {
    const t = index / rungCount;
    const center = tray.a.clone().lerp(tray.b, t);
    addCableTube(group, [center.clone().add(railOffset), center.clone().sub(railOffset)], color, 0.018, opacity * 0.88, renderOrder);
  }
}

function addCableTube(group, points, color, radius = 0.05, opacity = 0.7, renderOrder = 20) {
  const path = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.08);
  const geometry = new THREE.TubeGeometry(path, Math.max(2, points.length * 8), radius, 8, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = renderOrder;
  group.add(mesh);
  return mesh;
}

function createCableNode(color, opacity = 0.55, size = 0.74) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(size, size * 0.68, size),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }),
  );
}

function midpoint(a, b) {
  return new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

function addDevice(group, device, mode, selectedId, heightScale, interactive) {
  const position = getDeviceRenderPosition(device, heightScale);
  const color = statusColor(device.status, mode, device);
  const selected = selectedId === device.id;
  const isFault = device.status === 'offline';

  const marker = new THREE.Group();
  marker.position.set(position.x, position.y, position.z);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, isFault ? 1.65 : 1.2, 14),
    new THREE.MeshStandardMaterial({ color: isFault ? '#b91c1c' : '#4f5b5e', roughness: 0.6 }),
  );
  stem.position.y = isFault ? -0.96 : -0.75;
  marker.add(stem);

  if (device.type === 'ap') {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(selected || isFault ? 0.86 : 0.68, 28, 20),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: isFault ? 0.58 : 0.26, roughness: 0.45 }),
    );
    sphere.userData.entity = device;
    interactive.push(sphere);
    marker.add(sphere);

    [0.9, 1.45].forEach((radius, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.035, 10, 64),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: index === 0 ? 0.72 : 0.42 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.userData.entity = device;
      interactive.push(ring);
      marker.add(ring);
    });
  } else {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(selected || isFault ? 1.55 : 1.25, selected || isFault ? 1.05 : 0.85, selected || isFault ? 1.35 : 1.1),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: isFault ? 0.48 : 0.16, roughness: 0.5 }),
    );
    box.userData.entity = device;
    interactive.push(box);
    marker.add(box);
    for (let i = 0; i < 4; i += 1) {
      const port = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.08, 0.05),
        new THREE.MeshBasicMaterial({ color: '#17252a' }),
      );
      port.position.set(-0.36 + i * 0.24, 0.08, -0.58);
      marker.add(port);
    }
  }

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(selected || isFault ? 2.15 : 1.68, isFault ? 0.08 : 0.055, 12, 72),
    new THREE.MeshBasicMaterial({ color: isFault ? HEALTH.offline.color : loadColor(device.users, device.mbps), transparent: true, opacity: selected || isFault ? 0.92 : 0.55 }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.95;
  halo.userData.entity = device;
  interactive.push(halo);
  marker.add(halo);

  if (isFault) {
    const alarm = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 4.2, 36, 1, true),
      new THREE.MeshBasicMaterial({ color: HEALTH.offline.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    alarm.position.y = 0.92;
    alarm.userData.entity = device;
    interactive.push(alarm);
    marker.add(alarm);
  }

  const labelText = isFault ? `${device.id} 故障` : `${device.id} · ${device.floor}`;
  const label = createLabel(labelText, [0, 1.35, 0], [isFault ? 6.2 : 5.2, 1.15, 1], isFault ? '#7f1d1d' : '#17252a', isFault ? 'rgba(255,230,230,0.9)' : 'rgba(255,255,255,0.76)');
  label.userData.entity = device;
  interactive.push(label);
  marker.add(label);

  marker.traverse((child) => {
    child.renderOrder = isFault ? 36 : 30;
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material) => {
      material.depthTest = false;
      material.depthWrite = false;
    });
  });

  if (position.leader) {
    const leader = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(device.x, position.y - 0.95, device.z),
        new THREE.Vector3(position.x, position.y - 0.95, position.z),
      ]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: isFault ? 0.88 : 0.45, depthTest: false, depthWrite: false }),
    );
    leader.renderOrder = isFault ? 34 : 24;
    group.add(leader);
  }

  group.add(marker);
}

function createLabel(text, position, scale = [8, 2, 1], color = '#17252a', bg = 'rgba(255,255,255,0.7)') {
  const texture = createTextTexture(text, color, bg);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.position.set(...position);
  sprite.scale.set(...scale);
  sprite.renderOrder = 8;
  return sprite;
}

function createTextTexture(text, color, bg) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 56;
  ctx.font = `700 ${fontSize}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width + 56);
  canvas.height = 96;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = bg;
  roundedRect(ctx, 0, 8, canvas.width, canvas.height - 16, 16);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontSize}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}

function makeEllipsePoints(cx, cz, rx, rz, segments) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector3(cx + Math.cos(angle) * rx, 0, cz + Math.sin(angle) * rz);
  });
}

function buildingStatus(buildingId) {
  const owned = devices.filter((device) => device.building === buildingId);
  if (owned.some((device) => device.status === 'offline')) return 'offline';
  if (owned.some((device) => device.status === 'warning')) return 'warning';
  return 'online';
}

function statusColor(status, mode, device) {
  if (mode === 'traffic') return loadColor(device.users, device.mbps);
  return HEALTH[status]?.color || HEALTH.online.color;
}

function loadColor(users, mbps) {
  if (users >= 110 || mbps >= 850) return TRAFFIC.critical.color;
  if (users >= 70 || mbps >= 550) return TRAFFIC.high.color;
  if (users >= 35 || mbps >= 260) return TRAFFIC.medium.color;
  return TRAFFIC.low.color;
}

function zoneColor(zone, mode) {
  if (mode === 'traffic') return TRAFFIC[zone.traffic].color;
  if (mode === 'health' && zone.signal === 'outage') return HEALTH.offline.color;
  if (mode === 'planning') return '#9fb0b7';
  return SIGNAL[zone.signal].color;
}

function buildingLevelSummary(building) {
  return building.basements ? `B1 + ${building.floors}F` : `${building.floors}F`;
}

function entitySubtitle(entity) {
  if (!entity) return '';
  if (entity.type === 'ap' || entity.type === 'switch') return `${HEALTH[entity.status].label} · ${entity.users} users · ${entity.mbps} Mbps`;
  if (entity.signal) return `${SIGNAL[entity.signal].label} · ${entity.users} users · ${entity.mbps} Mbps`;
  if (entity.floors) return `${buildingLevelSummary(entity)} · ${buildingStatus(entity.id) === 'online' ? '設備正常' : HEALTH[buildingStatus(entity.id)].label}`;
  return '';
}

function DetailPanel({ entity, selectedFloor }) {
  if (!entity) return null;

  const isDevice = entity.type === 'ap' || entity.type === 'switch';
  const isZone = Boolean(entity.signal);
  const color = isDevice ? statusColor(entity.status, 'health', entity) : isZone ? zoneColor(entity, 'signal') : '#9fb0b7';
  const deviceLink = isDevice ? getNetworkLinkForDevice(entity.id) : null;

  return (
    <section className="detail-panel">
      <div className="detail-heading">
        <span className="detail-dot" style={{ background: color }} />
        <div>
          <p>{isDevice ? entity.id : isZone ? '熱區' : '建築'}</p>
          <h2>{entity.name || entity.label}</h2>
        </div>
      </div>

      {isDevice ? (
        <>
          <div className="detail-grid">
            <Detail label="狀態" value={HEALTH[entity.status].label} />
            <Detail label="樓層" value={entity.floor} />
            <Detail label="用戶" value={entity.users} />
            <Detail label="流量" value={`${entity.mbps} Mbps`} />
            <Detail label="頻道" value={entity.channel} wide />
          </div>
          <NetworkPathCard device={entity} link={deviceLink} />
        </>
      ) : null}

      {isZone ? (
        <>
          <div className="detail-grid">
            <Detail label="訊號" value={SIGNAL[entity.signal].label} />
            <Detail label="流量" value={TRAFFIC[entity.traffic].label} />
            <Detail label="用戶" value={entity.users} />
            <Detail label="吞吐" value={`${entity.mbps} Mbps`} />
          </div>
          <p className="detail-note">{entity.note}</p>
        </>
      ) : null}

      {entity.floors ? (
        <>
          <div className="detail-grid">
            <Detail label="樓層" value={buildingLevelSummary(entity)} />
            <Detail label="目前樓層" value={selectedFloor ? `${selectedFloor}F` : '-'} />
            <Detail label="設備狀態" value={HEALTH[buildingStatus(entity.id)].label} />
          </div>
          <RoomStack building={entity} selectedFloor={selectedFloor} />
        </>
      ) : null}
    </section>
  );
}

function NetworkPathCard({ device, link }) {
  if (!link) {
    return <p className="network-path-empty">尚未匯入此設備的實體線路對照。</p>;
  }

  const route = [link.uplinkTo || 'Core/MDF', link.switchId, link.switchPort, link.patchPanel, link.patchPort, device.id]
    .filter(Boolean)
    .join(' → ');

  return (
    <div className="network-path-card">
      <div className="network-path-title">
        <Cable size={15} />
        <span>實體線路</span>
        <b>{mediaLabel(link.medium)}</b>
      </div>
      <div className="network-path-grid">
        <Detail label="Switch" value={compactPair(link.switchId, link.switchPort)} />
        <Detail label="Patch" value={compactPair(link.patchPanel, link.patchPort)} />
        <Detail label="VLAN" value={link.vlan || '-'} />
        <Detail label="線號" value={link.cableId || '-'} />
        <Detail label="光纖芯" value={link.fiberCore || '-'} />
        <Detail label="狀態" value={HEALTH[link.status]?.label || link.status || '-'} />
      </div>
      <p className="network-route">{route}</p>
      {link.note ? <p className="network-note">{link.note}</p> : null}
    </div>
  );
}

function compactPair(primary, secondary) {
  const parts = [primary, secondary].filter(Boolean);
  return parts.length ? parts.join(' / ') : '-';
}

function mediaLabel(medium) {
  return medium === 'fiber' ? '光纖' : 'Cat6';
}

function getNetworkLinkForDevice(deviceId) {
  return networkLinks.find((link) => link.deviceId === deviceId) || null;
}

function RoomStack({ building, selectedFloor }) {
  if (!building.rooms) return null;
  return (
    <div className="room-stack">
      {Object.entries(building.rooms)
        .map(([floor, rooms]) => [Number(floor), rooms])
        .sort(([a], [b]) => b - a)
        .map(([floor, rooms]) => (
          <div className={`room-row ${selectedFloor === floor ? 'is-active' : ''}`} key={floor}>
            <span>{floor}F</span>
            <p>{rooms.join(' · ')}</p>
          </div>
        ))}
    </div>
  );
}

function Detail({ label, value, wide = false }) {
  return (
    <div className={`detail-item ${wide ? 'is-wide' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Toggle({ checked, label, onChange }) {
  return (
    <button className={`toggle-button ${checked ? 'is-on' : ''}`} type="button" onClick={() => onChange(!checked)}>
      <span className="toggle-track">
        <span />
      </span>
      <b>{label}</b>
    </button>
  );
}

function Legend({ mode }) {
  const items = mode === 'traffic'
    ? Object.values(TRAFFIC)
    : mode === 'health'
      ? Object.values(HEALTH)
      : mode === 'cabling'
        ? Object.values(CABLING)
        : Object.values(SIGNAL);
  const title = mode === 'traffic'
    ? '流量顏色'
    : mode === 'health'
      ? '設備顏色'
      : mode === 'cabling'
        ? '線路圖例'
        : '訊號顏色';
  return (
    <section className="legend-panel">
      <div className="section-title">
        <Users size={17} />
        <h2>{title}</h2>
      </div>
      <div className="legend-items">
        {items.map((item) => (
          <span className="legend-item" key={item.label}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function AIPanel({ backend, setBackend }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');

  async function analyze() {
    setLoading(true); setErr(''); setText('');
    const devLines = devices.map((d) =>
      `• ${d.id}（${d.name}）: ${HEALTH[d.status].label}，${d.floor}，${d.users} users，${d.mbps} Mbps`,
    ).join('\n');
    const zoneLines = heatZones.map((z) =>
      `• ${z.label}: 訊號${SIGNAL[z.signal].label}，流量${TRAFFIC[z.traffic].label}，${z.users} users — ${z.note}`,
    ).join('\n');
    const prompt = `你是壽山高中 WiFi 網路管理 AI 助理。請分析以下設備與熱區狀態，用繁體中文回覆，500字以內，條列清楚。

【AP / Switch 狀態】
${devLines}

【WiFi 熱區狀況】
${zoneLines}

請提供：
1. 🚨 需立即處理的問題（若有）
2. ⚠️ 建議改善事項
3. ✅ 整體評估`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend, prompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setText(data.text);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel-section ai-panel">
      <div className="section-title">
        <Cpu size={17} />
        <h2>AI 網路分析</h2>
      </div>
      <div className="ai-controls">
        <select value={backend} onChange={(e) => setBackend(e.target.value)}>
          <option value="gemma">Gemma 4（本地）</option>
          <option value="claude">Claude API</option>
        </select>
        <button type="button" className="ai-analyze-btn" onClick={analyze} disabled={loading}>
          {loading ? '分析中…' : '開始分析'}
        </button>
      </div>
      {loading && <p className="ai-status">AI 分析中，請稍候…</p>}
      {err && <p className="ai-status is-error">{err}</p>}
      {text && <pre className="ai-result">{text}</pre>}
    </section>
  );
}

export default App;
