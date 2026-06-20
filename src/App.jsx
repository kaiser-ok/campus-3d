import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  Building2,
  Cable,
  Check,
  ChevronDown,
  ClipboardList,
  Cpu,
  Download,
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
import xikunSchool from './data/xikunSchool.js';
import { createUe5Scene, downloadUe5Scene } from './ue5Scene.js';

const DEFAULT_SCHOOL = {
  id: 'default',
  name: '壽山高中',
  buildings: buildingsData,
  devices: devicesData,
  heatZones: heatZonesData,
  networkLinks: createDefaultNetworkLinks(devicesData, buildingsData),
  planUrl: '/school-plan.jpg',
};

const BUILTIN_SCHOOLS = [DEFAULT_SCHOOL, xikunSchool];
const BUILTIN_SCHOOL_IDS = new Set(BUILTIN_SCHOOLS.map((school) => school.id));
const BUILTIN_OVERRIDES_KEY = 'campus3d_builtin_overrides';

function isBuiltInSchool(id) {
  return BUILTIN_SCHOOL_IDS.has(id);
}

function schoolStoragePayload({ id, name, buildings, devices, heatZones, networkLinks, meta }) {
  return { id, name, buildings, devices, heatZones, networkLinks, meta };
}

function loadBuiltInOverrides() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BUILTIN_OVERRIDES_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function applyBuiltInOverride(school, overrides) {
  const override = overrides?.[school.id] || null;
  const storedPlanUrl = localStorage.getItem(`campus3d_img_${school.id}`);
  return {
    ...school,
    ...(override || {}),
    id: school.id,
    planUrl: storedPlanUrl || override?.planUrl || school.planUrl || null,
  };
}

function saveBuiltInSchoolOverride(school) {
  try {
    const overrides = loadBuiltInOverrides();
    overrides[school.id] = schoolStoragePayload(school);
    localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.warn('[campus3d] 內建學校校正儲存失敗', e);
  }
}

function removeBuiltInSchoolOverride(id) {
  try {
    const overrides = loadBuiltInOverrides();
    delete overrides[id];
    localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides));
    localStorage.removeItem(`campus3d_img_${id}`);
  } catch (e) {
    console.warn('[campus3d] 內建學校校正重設失敗', e);
  }
}

function loadSchools() {
  try {
    const stored = JSON.parse(localStorage.getItem('campus3d_schools') || '[]');
    const overrides = loadBuiltInOverrides();
    const builtInSchools = BUILTIN_SCHOOLS.map((school) => normalizeSchoolGeometry(applyBuiltInOverride(school, overrides)));
    const importedSchools = stored
      .filter((school) => !isBuiltInSchool(school.id))
      .map((s) => normalizeSchoolGeometry({
        ...s,
        planUrl: localStorage.getItem(`campus3d_img_${s.id}`) || null,
      }));
    return [...builtInSchools, ...importedSchools];
  } catch {
    return BUILTIN_SCHOOLS.map(normalizeSchoolGeometry);
  }
}

function saveSchools(schools) {
  try {
    const payload = schools
      .filter((s) => !isBuiltInSchool(s.id))
      .map(schoolStoragePayload);
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
    const name = getRecordValue(record, ['name', 'deviceName', 'device_name', '名稱']) || current?.name || id;
    const location = getRecordValue(record, ['location', 'installLocation', 'install_location', '位置', '安裝地點']) || current?.location || '';
    const room = getRecordValue(record, ['room', 'roomName', 'room_name', 'space', 'spaceName', 'space_name', 'classroom', 'classroomId', '教室', '空間', '位置空間']) || current?.room || inferRoomNameFromText(`${location} ${name} ${id}`);
    const floor = getRecordValue(record, ['floor', '樓層']) || current?.floor || '1F';
    const placement = getRecordValue(record, ['placement', 'place', 'mount', 'positionMode', '放置方式', '安裝位置']) || current?.placement || defaultDevicePlacement(type);
    const roomPosition = buildingInfo && room ? roomPositionForDevice(buildingInfo, floor, room, type, placement, index) : null;
    const offset = (index % 5) - 2;
    const fallbackX = roomPosition?.x ?? (buildingInfo ? buildingInfo.x + clamp(offset * 1.8, -buildingInfo.w / 3, buildingInfo.w / 3) : 0);
    const fallbackZ = roomPosition?.z ?? (buildingInfo ? buildingInfo.z + clamp(Math.floor(index / 5) * 1.7, -buildingInfo.d / 3, buildingInfo.d / 3) : 0);
    const patch = {
      id,
      type: current?.type || type,
      name,
      building,
      x: Number.isFinite(parsedX) ? parsedX : roomPosition?.x ?? current?.x ?? Math.round(fallbackX * 10) / 10,
      z: Number.isFinite(parsedZ) ? parsedZ : roomPosition?.z ?? current?.z ?? Math.round(fallbackZ * 10) / 10,
      floor,
      room,
      placement,
      status: normalizeStatus(getRecordValue(record, ['status', '狀態']) || current?.status || 'online'),
      users: Number(getRecordValue(record, ['users', 'clientCount', 'clients', '用戶'])) || current?.users || 0,
      mbps: Number(getRecordValue(record, ['mbps', 'traffic', 'throughput', '流量'])) || current?.mbps || 0,
      channel: getRecordValue(record, ['channel', '頻道']) || current?.channel || '-',
      location,
      assetTag: getRecordValue(record, ['assetTag', 'asset_tag', 'asset', '財產編號', '財編']) || current?.assetTag || '',
      serialNumber: getRecordValue(record, ['serialNumber', 'serial_number', 'serial', 'sn', '序號']) || current?.serialNumber || '',
      model: getRecordValue(record, ['model', '型號']) || current?.model || '',
      vendor: getRecordValue(record, ['vendor', 'manufacturer', 'brand', '廠牌', '廠商']) || current?.vendor || '',
      purchaseDate: getRecordValue(record, ['purchaseDate', 'purchase_date', '採購日期', '採購日', '購置日期']) || current?.purchaseDate || '',
      warrantyUntil: getRecordValue(record, ['warrantyUntil', 'warranty_until', 'warranty', '保固到期', '保固迄日', '保固']) || current?.warrantyUntil || '',
      fundingSource: getRecordValue(record, ['fundingSource', 'funding_source', 'funding', '經費來源', '計畫名稱', '計畫']) || current?.fundingSource || '',
      custodian: getRecordValue(record, ['custodian', 'keeper', '保管人']) || current?.custodian || '',
      lifecycleStatus: getRecordValue(record, ['lifecycleStatus', 'lifecycle_status', 'lifecycle', '資產狀態', '使用狀態']) || current?.lifecycleStatus || '',
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

function defaultDevicePlacement(type) {
  return type === 'ap' ? 'room-center' : 'corridor-edge';
}

function normalizeRoomToken(value = '') {
  return String(value).replace(/[^A-Z0-9一-鿿]/gi, '').toUpperCase();
}

function roomPositionForDevice(building, floorValue, roomValue, type = 'ap', placement = '', index = 0) {
  const floor = Math.max(1, parseDeviceFloor(floorValue) || 1);
  const rooms = building.rooms?.[floor] || [];
  const roomKey = normalizeRoomToken(roomValue);
  const matchedIndex = rooms.findIndex((room) => normalizeRoomToken(room).includes(roomKey) || roomKey.includes(normalizeRoomToken(room)));
  const count = Math.max(1, rooms.length || 1);
  const roomIndex = matchedIndex >= 0 ? matchedIndex : index % count;
  const along = (roomIndex + 0.5) / count;
  const edgeMode = isEdgePlacement({ type, placement });
  const crossOffset = edgeMode ? 0.38 : 0;

  if (building.w >= building.d) {
    return {
      x: Number((building.x - building.w / 2 + building.w * along).toFixed(1)),
      z: Number((building.z + building.d * crossOffset).toFixed(1)),
    };
  }

  return {
    x: Number((building.x + building.w * crossOffset).toFixed(1)),
    z: Number((building.z - building.d / 2 + building.d * along).toFixed(1)),
  };
}

function isEdgePlacement(device) {
  const placement = String(device?.placement || '').toLowerCase();
  if (/room|center|inside|middle|教室|空間|置中|室內/.test(placement)) return false;
  if (/edge|corridor|tray|wall|走廊|線槽|邊|牆/.test(placement)) return true;
  return device?.type !== 'ap';
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
      users: 35,
      mbps: 180,
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
  const normalizedDevices = normalizeBuiltInTestDeviceMetrics(school.id, normalizeSceneDevices(school.devices || [], normalizedBuildings), school.meta);
  const enrichedBuildings = enrichBuildingRoomsWithDevices(normalizedBuildings, normalizedDevices);
  return {
    ...school,
    buildings: enrichedBuildings,
    devices: normalizedDevices,
    heatZones: Array.isArray(school.heatZones) ? school.heatZones : [],
    networkLinks: normalizeNetworkLinks(school.networkLinks || [], normalizedDevices, enrichedBuildings),
  };
}

function normalizeSceneDevices(rawDevices = [], buildingList = []) {
  if (!Array.isArray(rawDevices)) return [];
  return rawDevices.map((device, index) => {
    const type = device.type || (/switch|sw|交換器/i.test(`${device.id || ''} ${device.name || ''}`) ? 'switch' : 'ap');
    const building = buildingList.find((item) => item.id === device.building);
    const room = device.room || inferRoomNameFromText(`${device.location || ''} ${device.name || ''} ${device.id || ''}`);
    const placement = device.placement || defaultDevicePlacement(type);
    const roomPosition = building && room && (!Number.isFinite(Number(device.x)) || !Number.isFinite(Number(device.z)))
      ? roomPositionForDevice(building, device.floor || '1F', room, type, placement, index)
      : null;
    return {
      ...device,
      type,
      room,
      placement,
      x: Number.isFinite(Number(device.x)) ? Number(device.x) : roomPosition?.x ?? device.x,
      z: Number.isFinite(Number(device.z)) ? Number(device.z) : roomPosition?.z ?? device.z,
    };
  });
}

function enrichBuildingRoomsWithDevices(buildingList = [], deviceList = []) {
  const namesByBuilding = new Map();
  deviceList.forEach((device) => {
    if (!device.building || !device.room) return;
    const key = roomMatchKey(device.room);
    if (!key) return;
    const byRoom = namesByBuilding.get(device.building) || new Map();
    const current = byRoom.get(key);
    if (!current || String(device.room).length > String(current).length) byRoom.set(key, device.room);
    namesByBuilding.set(device.building, byRoom);
  });

  return buildingList.map((building) => {
    const byRoom = namesByBuilding.get(building.id);
    if (!byRoom || !building.rooms) return building;
    const rooms = Object.fromEntries(Object.entries(building.rooms).map(([floor, items]) => [
      floor,
      (Array.isArray(items) ? items : []).map((room) => {
        const key = roomMatchKey(room);
        const enriched = key ? byRoom.get(key) : null;
        return enriched && String(enriched).length > String(room).length ? enriched : room;
      }),
    ]));
    return { ...building, rooms };
  });
}

function normalizeBuiltInTestDeviceMetrics(schoolId, deviceList = [], meta = {}) {
  if (schoolId !== 'xikun-jhs') return deviceList;
  if (meta?.manualDeviceMetrics) return deviceList;
  return deviceList.map((device, index) => {
    if (device.type !== 'ap') return device;
    const locationText = `${device.location || ''} ${device.room || ''} ${device.name || ''}`;
    const busy = /A2[4-9]|B1[8-9]|C14|D2[2-4]|D3[01]|E2[0-5]/.test(locationText);
    return {
      ...device,
      users: busy ? 30 + (index % 6) : 8 + (index % 20),
      mbps: busy ? 112 + (index % 12) * 7 : 32 + (index % 12) * 5,
    };
  });
}

function roomMatchKey(value = '') {
  const code = String(value).match(/([A-Z])\s*-?\s*(\d{1,3})/i);
  if (code) return `${code[1].toUpperCase()}${String(Number(code[2])).padStart(2, '0')}`;
  return normalizeRoomToken(value);
}

function inferRoomNameFromText(text = '') {
  const value = String(text || '');
  const code = value.match(/([A-Z])\s*-?\s*(\d{1,3})\s*([\u4e00-\u9fffA-Za-z（）()_-]{0,12})/i);
  const namedPattern = /(前走廊|後走廊|走廊|機房|辦公室|導師辦公室|導辦|教媒中心|總務處|學務處|教務處|會計室|多功能教室|自然教室|族語教室|電腦教室|實驗室|閱讀區|圖書館|活動中心|體育館|川堂|公托|幼兒園|警衛室|司令臺|球場)/;
  const named = value.match(namedPattern)?.[1] || '';
  if (code) {
    const roomCode = `${code[1].toUpperCase()}${String(Number(code[2])).padStart(2, '0')}`;
    const suffix = String(code[3] || '').replace(/[-_]/g, '').trim();
    const roomName = suffix && !/^[A-Z0-9]+$/i.test(suffix) ? suffix : named;
    return roomName && !roomCode.includes(roomName) ? `${roomCode} ${roomName}` : roomCode;
  }
  return named;
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
const BUILDING_FLOOR_HEIGHT = 2.55;
const LABEL_REFERENCE_DISTANCE = 78;
const LABEL_MIN_SCALE = 0.28;
const LABEL_MAX_SCALE = 1.08;
const LABEL_TEXTURE_SCALE = 3;
const LABEL_WORLD_POSITION = new THREE.Vector3();

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
  { id: 'asset', label: '資產檢視', icon: ClipboardList },
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

const AP_LOAD_LIMITS = {
  mediumUsers: 15,
  mediumMbps: 50,
  highUsers: 30,
  highMbps: 100,
  criticalUsers: 60,
  criticalMbps: 250,
};

const ASSET = {
  ok: { label: '保固內', color: '#93e6c3', dark: '#047857' },
  aging: { label: '已過保', color: '#f7d56f', dark: '#9a6b00' },
  eol: { label: '待汰換 / 報廢', color: '#ff8a80', dark: '#b91c1c' },
  unknown: { label: '無資產資料', color: '#aebfc7', dark: '#52616b' },
};

const ASSET_EOL_YEARS = 7;
const ASSET_AGING_YEARS = 4;
const MS_PER_YEAR = 31557600000;

function toneClass(prefix, key, fallback = 'default') {
  return `${prefix} tone-${String(key || fallback).replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}`;
}

function previewHandlePoints(box) {
  const midX = box.x + box.width / 2;
  const midY = box.y + box.height / 2;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return [
    { handle: 'nw', x: box.x, y: box.y },
    { handle: 'n', x: midX, y: box.y },
    { handle: 'ne', x: right, y: box.y },
    { handle: 'e', x: right, y: midY },
    { handle: 'se', x: right, y: bottom },
    { handle: 's', x: midX, y: bottom },
    { handle: 'sw', x: box.x, y: bottom },
    { handle: 'w', x: box.x, y: midY },
  ];
}

function parseAssetDate(value) {
  if (!value) return null;
  const date = new Date(String(value).trim().replace(/\//g, '-'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function assetState(device) {
  if (/報廢|汰換|淘汰|retired|eol/i.test(String(device?.lifecycleStatus || ''))) return 'eol';
  const now = Date.now();
  const purchase = parseAssetDate(device?.purchaseDate);
  const ageYears = purchase ? (now - purchase.getTime()) / MS_PER_YEAR : null;
  const warranty = parseAssetDate(device?.warrantyUntil);
  if (warranty) {
    if (warranty.getTime() >= now) return 'ok';
    return ageYears != null && ageYears >= ASSET_EOL_YEARS ? 'eol' : 'aging';
  }
  if (ageYears != null) {
    if (ageYears >= ASSET_EOL_YEARS) return 'eol';
    return ageYears >= ASSET_AGING_YEARS ? 'aging' : 'ok';
  }
  return 'unknown';
}

function deviceHasAssetData(device) {
  return Boolean(device?.assetTag || device?.serialNumber || device?.vendor || device?.purchaseDate || device?.warrantyUntil || device?.fundingSource || device?.custodian || device?.lifecycleStatus);
}

const CABLING = {
  tray: { label: '走廊線槽', color: '#7a8790' },
  fiber: { label: '跨棟光纖', color: '#7c3aed' },
  riser: { label: '垂直管道', color: '#2563eb' },
  copper: { label: 'Cat6 支線', color: '#14b8a6' },
  floorSwitch: { label: '樓層服務 Switch', color: '#2563eb' },
  edgeSwitch: { label: '教室 / 邊緣 Switch', color: '#38bdf8' },
  selected: { label: '選取路徑', color: '#f59e0b' },
};

const DEFAULT_SCENE_OPACITY = {
  plan: 0.52,
  building: 1,
  devices: 1,
  cabling: 1,
};

function loadSceneOpacity(key, fallback) {
  const saved = Number(localStorage.getItem(`campus3d_opacity_${key}`));
  return Number.isFinite(saved) ? clamp(saved, 0.12, 1) : fallback;
}

let buildings = buildingsData;
let heatZones = heatZonesData;
let devices = devicesData;
let networkLinks = createDefaultNetworkLinks(devicesData, buildingsData);

function App() {
  const [mode, setMode] = useState('signal');
  const [showPlan, setShowPlan] = useState(true);
  const [showDevices, setShowDevices] = useState(true);
  const [showCurrentFloorOnly, setShowCurrentFloorOnly] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showCabling, setShowCabling] = useState(false);
  const [heightScale, setHeightScale] = useState(1);
  const [labelScale, setLabelScale] = useState(() => {
    const saved = Number(localStorage.getItem('campus3d_label_scale'));
    return Number.isFinite(saved) && saved > 0 ? clamp(saved, 0.55, 1.45) : 1;
  });
  const [sceneOpacity, setSceneOpacity] = useState(() => ({
    plan: loadSceneOpacity('plan', DEFAULT_SCENE_OPACITY.plan),
    building: loadSceneOpacity('building', DEFAULT_SCENE_OPACITY.building),
    devices: loadSceneOpacity('devices', DEFAULT_SCENE_OPACITY.devices),
    cabling: loadSceneOpacity('cabling', DEFAULT_SCENE_OPACITY.cabling),
  }));
  const [selectedEntity, setSelectedEntity] = useState(heatZones[0]);
  const [deviceGroupOpen, setDeviceGroupOpen] = useState({ alerts: true, ap: false, switch: false, server: false, other: false });
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const [cameraPreset, setCameraPreset] = useState({ name: 'home', tick: 0 });
  const [showWizard, setShowWizard] = useState(false);
  const [showSchoolEditor, setShowSchoolEditor] = useState(false);
  const [showDataManager, setShowDataManager] = useState(false);
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
    return loadSchools().find((school) => school.id === savedId)?.planUrl ?? null;
  });
  const [showHints, setShowHints] = useState(false);
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);
  const [networkImportError, setNetworkImportError] = useState('');
  const [networkImportMessage, setNetworkImportMessage] = useState('');
  const [pixelStreamingUrl, setPixelStreamingUrl] = useState(() => (
    localStorage.getItem('campus3d_pixel_streaming_url') || 'http://127.0.0.1/'
  ));

  const currentSchool = schools.find((s) => s.id === currentSchoolId) ?? DEFAULT_SCHOOL;
  const currentIsBuiltIn = isBuiltInSchool(currentSchoolId);
  const ue5Scene = useMemo(() => createUe5Scene({
    ...currentSchool,
    buildings,
    devices,
    heatZones,
    networkLinks,
  }), [currentSchool, sceneVersion]);
  const ue5StaticSceneUrl = `/ue5/${currentSchool.id}-campus-scene.json`;

  function switchSchool(id) {
    const school = schools.find((s) => s.id === id);
    if (!school) return;
    buildings = school.buildings;
    devices = school.devices;
    heatZones = school.heatZones;
    networkLinks = school.networkLinks || normalizeNetworkLinks([], school.devices || [], school.buildings || []);
    setCurrentSchoolId(id);
    setPlanUrl(school.planUrl ?? null);
    setSceneVersion((v) => v + 1);
    setSelectedEntity(null);
    setSelectedRoom(null);
    setShowSchoolPicker(false);
    try { localStorage.setItem('campus3d_current', id); } catch {}
  }

  function deleteSchool(id) {
    if (isBuiltInSchool(id)) return;
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
      setPlanUrl(fallback.planUrl ?? null);
      setSelectedEntity(null);
      setSelectedRoom(null);
      setSceneVersion((v) => v + 1);
      try { localStorage.setItem('campus3d_current', 'default'); } catch {}
    }
  }

  function resetBuiltInSchool(id) {
    if (!isBuiltInSchool(id)) return;
    const baseSchool = BUILTIN_SCHOOLS.find((school) => school.id === id);
    if (!baseSchool) return;
    const ok = window.confirm(`恢復「${baseSchool.name}」的內建建築位置與底圖？`);
    if (!ok) return;
    removeBuiltInSchoolOverride(id);
    const restoredSchool = normalizeSchoolGeometry(baseSchool);
    const next = schools.map((school) => (school.id === id ? restoredSchool : school));
    setSchools(next);
    if (currentSchoolId === id) {
      buildings = restoredSchool.buildings;
      devices = restoredSchool.devices;
      heatZones = restoredSchool.heatZones;
      networkLinks = restoredSchool.networkLinks || normalizeNetworkLinks([], restoredSchool.devices || [], restoredSchool.buildings || []);
      setPlanUrl(restoredSchool.planUrl ?? null);
      setSelectedEntity(null);
      setSelectedRoom(null);
      setSceneVersion((value) => value + 1);
    }
  }

  function handleSchoolEditSave(editedSchool, newPlanDataUrl) {
    if (!editedSchool) return;
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
    if (newPlanDataUrl) saveSchoolImage(updatedSchool.id, newPlanDataUrl);
    if (isBuiltInSchool(updatedSchool.id)) saveBuiltInSchoolOverride(updatedSchool);
    else saveSchools(next);
    setPlanUrl(updatedSchool.planUrl ?? null);
    setSelectedEntity(null);
    setSelectedRoom(null);
    setSceneVersion((value) => value + 1);
    setShowSchoolEditor(false);
  }

  function persistCurrentSchool(updatedSchool) {
    const nextSchools = schools.map((school) => (school.id === updatedSchool.id ? updatedSchool : school));
    setSchools(nextSchools);
    if (isBuiltInSchool(updatedSchool.id)) saveBuiltInSchoolOverride(updatedSchool);
    else saveSchools(nextSchools);
  }

  function handleDataManagerSave(nextDevices, nextLinks) {
    const normalizedDevices = normalizeSceneDevices(nextDevices, buildings);
    const normalizedLinks = normalizeNetworkLinks(nextLinks, normalizedDevices, buildings);
    const updatedSchool = {
      ...currentSchool,
      buildings,
      devices: normalizedDevices,
      heatZones,
      networkLinks: normalizedLinks,
      meta: {
        ...(currentSchool.meta || {}),
        manualDeviceMetrics: true,
        dataManagedAt: new Date().toISOString(),
      },
    };
    devices = normalizedDevices;
    networkLinks = normalizedLinks;
    persistCurrentSchool(updatedSchool);
    setSelectedEntity(null);
    setSelectedRoom(null);
    setSceneVersion((value) => value + 1);
    setNetworkImportMessage(`已儲存 ${normalizedDevices.length} 台設備與 ${normalizedLinks.length} 筆拓樸線路`);
    setShowDataManager(false);
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
    setSelectedRoom(null);
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
    devices = nextDevices;
    networkLinks = nextLinks;
    persistCurrentSchool(updatedSchool);
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

  function handleDownloadUe5Scene() {
    downloadUe5Scene(ue5Scene, `${currentSchool.id}-campus-scene.json`);
  }

  useEffect(() => {
    try { localStorage.setItem('campus3d_pixel_streaming_url', pixelStreamingUrl); } catch {}
  }, [pixelStreamingUrl]);

  function updateSceneOpacity(key, value) {
    const nextValue = clamp(Number(value) || DEFAULT_SCENE_OPACITY[key] || 1, 0.12, 1);
    setSceneOpacity((current) => ({ ...current, [key]: nextValue }));
    try { localStorage.setItem(`campus3d_opacity_${key}`, String(nextValue)); } catch {}
  }

  const metrics = useMemo(() => {
    const offline = devices.filter((device) => device.status === 'offline').length;
    const warning = devices.filter((device) => device.status === 'warning').length;
    const online = devices.filter((device) => device.status === 'online').length;
    const issueZones = heatZones.filter((zone) => zone.signal === 'poor' || zone.signal === 'outage').length;
    const highTraffic = heatZones.filter((zone) => zone.traffic === 'high' || zone.traffic === 'critical').length;
    return { online, warning, offline, issueZones, highTraffic };
  }, [sceneVersion]);
  const problemItems = useMemo(() => {
    const nameFor = (id) => buildings.find((b) => b.id === id)?.name || (id === 'outdoor' ? '戶外' : id || '-');
    const items = [];
    devices.forEach((device) => {
      const place = `${nameFor(device.building)} · ${device.floor || '-'}`;
      if (device.status === 'offline') {
        items.push({ severity: device.type === 'ap' ? 1 : 0, tag: '故障', tone: 'offline', entity: device, title: device.name, place });
      } else if (device.status === 'warning') {
        items.push({ severity: 2, tag: '警告', tone: 'warning', entity: device, title: device.name, place });
      } else if (isCrowdedAp(device)) {
        items.push({ severity: 3, tag: '過載', tone: 'load', entity: device, title: device.name, place: `${place} · ${device.users} 人` });
      }
    });
    heatZones.forEach((zone) => {
      if (zone.signal === 'outage' || zone.signal === 'poor') {
        items.push({ severity: 4, tag: SIGNAL[zone.signal].label, tone: 'signal', entity: zone, title: zone.label, place: '訊號熱區' });
      } else if (zone.traffic === 'critical' || zone.traffic === 'high') {
        items.push({ severity: 5, tag: `${TRAFFIC[zone.traffic].label}流量`, tone: 'load', entity: zone, title: zone.label, place: `${zone.users} users` });
      }
    });
    return items.sort((a, b) => a.severity - b.severity);
  }, [sceneVersion]);
  const problemCycleRef = useRef({});
  function cycleProblemSelection(kind) {
    const pool = kind === 'offline'
      ? devices.filter((device) => device.status === 'offline')
      : kind === 'warning'
        ? devices.filter((device) => device.status === 'warning')
        : heatZones.filter((zone) => zone.signal === 'poor' || zone.signal === 'outage' || zone.traffic === 'high' || zone.traffic === 'critical');
    if (!pool.length) return;
    const index = ((problemCycleRef.current[kind] ?? -1) + 1) % pool.length;
    problemCycleRef.current[kind] = index;
    handleSelectEntity(pool[index]);
  }
  const networkStats = useMemo(() => {
    const mapped = networkLinks.filter((link) => devices.some((device) => device.id === link.deviceId)).length;
    const fiber = networkLinks.filter((link) => link.medium === 'fiber').length;
    const offline = networkLinks.filter((link) => link.status === 'offline').length;
    return { mapped, fiber, offline };
  }, [sceneVersion]);
  const activeBuildingId = getActiveBuildingId(selectedEntity?.id);
  const activeSelectedRoom = selectedRoom?.buildingId === activeBuildingId ? selectedRoom : null;

  function setViewPreset(name) {
    setCameraPreset({ name, tick: Date.now() });
  }

  function handleSelectEntity(entity) {
    setSelectedEntity(entity);
  }

  function handleFloorSelect(floor) {
    setSelectedFloor(floor);
    setSelectedRoom(null);
    if (selectedEntity?.floors) setHoveredEntity(selectedEntity);
  }

  function handleRoomSelect(floor, room) {
    if (!selectedEntity?.floors || !room) return;
    const nextFloor = Math.max(1, Number(floor) || 1);
    setSelectedFloor(nextFloor);
    setSelectedRoom({ buildingId: selectedEntity.id, floor: nextFloor, room });
  }

  useEffect(() => {
    const initialFloor = getInitialFloorForEntity(selectedEntity);
    setSelectedFloor(initialFloor);
    if (selectedEntity?.type === 'ap' || selectedEntity?.type === 'switch' || selectedEntity?.type === 'server') {
      setSelectedRoom(selectedEntity.room ? { buildingId: selectedEntity.building, floor: initialFloor, room: selectedEntity.room } : null);
    } else {
      setSelectedRoom(null);
    }
  }, [selectedEntity]);

  useEffect(() => {
    try {
      localStorage.setItem('campus3d_label_scale', String(labelScale));
    } catch {}
  }, [labelScale]);

  return (
    <main className="app-shell">
      <section className="viewport-panel">
        <div className="scene-toolbar" aria-label="3D 視角控制">
          <button className="icon-button" type="button" title="重設視角" onClick={() => setViewPreset('home')}>
            <RotateCcw size={18} />
          </button>
          <button className="icon-button" type="button" title="俯視" onClick={() => setViewPreset('top')}>
            <MapIcon size={18} />
          </button>
          <button className="icon-button" type="button" title="東側透視" onClick={() => setViewPreset('east')}>
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

        <div className="touch-view-pad" aria-label="3D 四角視角切換">
          <button className="icon-button" type="button" title="西北視角" aria-label="西北視角" onClick={() => setViewPreset('northWest')}>
            <ArrowUpLeft size={20} />
          </button>
          <button className="icon-button" type="button" title="東北視角" aria-label="東北視角" onClick={() => setViewPreset('northEast')}>
            <ArrowUpRight size={20} />
          </button>
          <button className="icon-button" type="button" title="西南視角" aria-label="西南視角" onClick={() => setViewPreset('southWest')}>
            <ArrowDownLeft size={20} />
          </button>
          <button className="icon-button" type="button" title="東南視角" aria-label="東南視角" onClick={() => setViewPreset('southEast')}>
            <ArrowDownRight size={20} />
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
                <span>Shift 加速 · 數字鍵切樓層 · Shift + 滾輪切樓層</span>
              </div>
            </div>
          </div>
        )}

        <CampusScene
          mode={mode}
          showPlan={showPlan}
          showDevices={showDevices}
          showCurrentFloorOnly={showCurrentFloorOnly}
          showHeatmap={showHeatmap}
          showCabling={showCabling || mode === 'cabling'}
          heightScale={heightScale}
          labelScale={labelScale}
          sceneOpacity={sceneOpacity}
          selectedEntity={selectedEntity}
          selectedId={selectedEntity?.id}
          selectedFloor={selectedFloor}
          selectedRoom={activeSelectedRoom}
          cameraPreset={cameraPreset}
          sceneVersion={sceneVersion}
          planUrl={planUrl}
          showDefaultFeatures={currentSchoolId === 'default'}
          onSelect={handleSelectEntity}
          onHover={setHoveredEntity}
          onFloorSelect={handleFloorSelect}
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
              <ChevronDown size={12} className={`chevron-icon ${showSchoolPicker ? 'is-open' : ''}`} />
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
                {!isBuiltInSchool(school.id) && (
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
          <Metric label="警告設備" value={metrics.warning} tone="amber" onClick={metrics.warning ? () => cycleProblemSelection('warning') : undefined} />
          <Metric label="故障設備" value={metrics.offline} tone="red" onClick={metrics.offline ? () => cycleProblemSelection('offline') : undefined} />
          <Metric label="問題區域" value={metrics.issueZones + metrics.highTraffic} tone="orange" onClick={metrics.issueZones + metrics.highTraffic ? () => cycleProblemSelection('zones') : undefined} />
        </section>

        <section className="panel-section problem-panel" aria-label="待處理問題">
          <div className="section-title">
            <AlertTriangle size={17} />
            <h2>待處理問題</h2>
            <span className={`problem-count ${problemItems.length ? 'has-issues' : ''}`}>{problemItems.length}</span>
          </div>
          {problemItems.length ? (
            <div className="problem-list">
              {problemItems.slice(0, 12).map((item) => (
                <button
                  key={`${item.entity.id}-${item.tag}`}
                  type="button"
                  className={`problem-row tone-${item.tone} ${selectedEntity?.id === item.entity.id ? 'is-active' : ''}`}
                  onClick={() => handleSelectEntity(item.entity)}
                >
                  <span className="problem-tag">{item.tag}</span>
                  <span className="problem-copy">
                    <strong>{item.title}</strong>
                    <small>{item.place}</small>
                  </span>
                </button>
              ))}
              {problemItems.length > 12 ? (
                <p className="problem-more">還有 {problemItems.length - 12} 項，可點上方指標卡逐一巡視。</p>
              ) : null}
            </div>
          ) : (
            <p className="problem-empty">目前沒有待處理問題。</p>
          )}
        </section>

        <section className="panel-section school-manage-panel">
          <div className="section-title">
            <FolderOpen size={17} />
            <h2>目前學校</h2>
          </div>
          <p className="school-manage-name">{currentSchool.name}</p>
          {currentIsBuiltIn && <p className="school-manage-note">內建資料，可編輯建築位置；修改會儲存在本機瀏覽器。</p>}
          <div className={`school-manage-actions ${currentIsBuiltIn ? 'is-built-in' : ''}`}>
            <button type="button" className="school-edit-btn" onClick={() => setShowSchoolEditor(true)}>
              編輯建築位置
            </button>
            {currentIsBuiltIn ? (
              <button type="button" className="school-reimport-btn" onClick={() => resetBuiltInSchool(currentSchoolId)}>
                恢復內建
              </button>
            ) : (
              <>
                <button type="button" className="school-reimport-btn" onClick={() => setShowWizard(true)}>
                  重新匯入
                </button>
                <button type="button" className="school-delete-current" onClick={() => deleteSchool(currentSchoolId)}>
                  刪除學校
                </button>
              </>
            )}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-title">
            <Building2 size={17} />
            <h2>圖層</h2>
          </div>
          <div className="toggle-grid">
            <Toggle checked={showDevices} label="AP / switch" onChange={setShowDevices} />
            <Toggle checked={showCurrentFloorOnly} label="只看目前樓層" onChange={setShowCurrentFloorOnly} />
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
          <label className="range-field">
            <span>Label 字體</span>
            <input
              type="range"
              min="0.6"
              max="1.4"
              step="0.05"
              value={labelScale}
              onChange={(event) => setLabelScale(Number(event.target.value))}
            />
            <b>{Math.round(labelScale * 100)}%</b>
          </label>
          <label className="range-field">
            <span>底圖透明度</span>
            <input
              type="range"
              min="0.12"
              max="1"
              step="0.04"
              value={sceneOpacity.plan}
              onChange={(event) => updateSceneOpacity('plan', event.target.value)}
            />
            <b>{Math.round(sceneOpacity.plan * 100)}%</b>
          </label>
          <label className="range-field">
            <span>建築透明度</span>
            <input
              type="range"
              min="0.12"
              max="1"
              step="0.04"
              value={sceneOpacity.building}
              onChange={(event) => updateSceneOpacity('building', event.target.value)}
            />
            <b>{Math.round(sceneOpacity.building * 100)}%</b>
          </label>
          <label className="range-field">
            <span>設備透明度</span>
            <input
              type="range"
              min="0.12"
              max="1"
              step="0.04"
              value={sceneOpacity.devices}
              onChange={(event) => updateSceneOpacity('devices', event.target.value)}
            />
            <b>{Math.round(sceneOpacity.devices * 100)}%</b>
          </label>
          <label className="range-field">
            <span>線路透明度</span>
            <input
              type="range"
              min="0.12"
              max="1"
              step="0.04"
              value={sceneOpacity.cabling}
              onChange={(event) => updateSceneOpacity('cabling', event.target.value)}
            />
            <b>{Math.round(sceneOpacity.cabling * 100)}%</b>
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
            <button className="network-manage-btn" type="button" onClick={() => setShowDataManager(true)}>
              <Pencil size={16} />
              <span>管理資料</span>
            </button>
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
          <p className="network-import-hint">自動化測試資料只在測試瀏覽器內；要在目前畫面看差異，可按「載入範例」。欄位可含 deviceId、type、name、building、floor、room、placement、x、z、switchId、switchPort、patchPanel、patchPort、vlan、cableId、medium、fiberCore、uplinkTo、status、note。placement 可用 room-center / corridor-edge。資產欄位可含 assetTag（財產編號）、serialNumber（序號）、model、vendor（廠牌）、purchaseDate（採購日期）、warrantyUntil（保固到期）、fundingSource（經費來源）、custodian（保管人）、lifecycleStatus（使用狀態）。</p>
          {networkImportMessage && <p className="network-import-ok">{networkImportMessage}</p>}
          {networkImportError && <p className="network-import-error">{networkImportError}</p>}
        </section>

        <section className="panel-section ue5-poc-panel">
          <div className="section-title">
            <Server size={17} />
            <h2>UE5 PoC</h2>
          </div>
          <div className="ue5-stat-grid">
            <Detail label="建物" value={`${ue5Scene.summary.buildings}`} />
            <Detail label="房間" value={`${ue5Scene.summary.rooms}`} />
            <Detail label="設備" value={`${ue5Scene.summary.devices}`} />
          </div>
          <label className="ue5-url-field">
            <span>Pixel Streaming URL</span>
            <input
              value={pixelStreamingUrl}
              onChange={(event) => setPixelStreamingUrl(event.target.value)}
              placeholder="http://127.0.0.1/"
            />
          </label>
          <div className="ue5-action-row">
            <a className="ue5-link-btn" href={ue5StaticSceneUrl} target="_blank" rel="noreferrer">
              <FolderOpen size={15} />
              <span>靜態 JSON</span>
            </a>
            <button className="ue5-link-btn" type="button" onClick={handleDownloadUe5Scene}>
              <Download size={15} />
              <span>下載目前 JSON</span>
            </button>
          </div>
          <div className="ue5-stream-frame">
            <iframe title="UE5 Pixel Streaming PoC" src={pixelStreamingUrl} />
          </div>
          <p className="ue5-note">UE5 端先讀取 JSON 建場景；Pixel Streaming 啟動後可直接嵌入此處。若尚未啟動 Signalling Server，iframe 會顯示連線失敗屬正常。</p>
        </section>

        <section className="panel-section">
          <div className="section-title">
            <Building2 size={17} />
            <h2>建築物</h2>
          </div>
          <div className="building-list">
            {buildings.map((building) => {
              const status = buildingStatus(building.id);
              const deviceSummary = buildingDeviceSummary(building.id);
              const rowClass = [
                'building-row',
                activeBuildingId === building.id ? 'is-active' : '',
                status !== 'online' ? 'has-alert' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  className={rowClass}
                  key={building.id}
                  type="button"
                  onClick={() => handleSelectEntity(building)}
                >
                  <span className={toneClass('building-swatch', status)} />
                  <span className="building-copy">
                    <strong>{building.name}</strong>
                    <small>{buildingLevelSummary(building)} · {deviceSummary} · {HEALTH[status].label}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <DetailPanel entity={selectedEntity} selectedFloor={selectedFloor} selectedRoom={activeSelectedRoom} selectedId={selectedEntity?.id} mode={mode} onFloorSelect={handleFloorSelect} onRoomSelect={handleRoomSelect} onSelectDevice={handleSelectEntity} />

        <section className="panel-section">
          <div className="section-title">
            <Wifi size={17} />
            <h2>設備清單</h2>
          </div>
          <DeviceGroupList
            groups={createDeviceGroups(devices)}
            mode={mode}
            openState={deviceGroupOpen}
            selectedId={selectedEntity?.id}
            onToggle={(groupId) => setDeviceGroupOpen((state) => ({ ...state, [groupId]: !state[groupId] }))}
            onSelect={handleSelectEntity}
          />
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
                onClick={() => handleSelectEntity(zone)}
              >
                <span className={toneClass('zone-swatch', zoneTone(zone, mode))} />
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

      {showSchoolEditor && (
        <SchoolEditor
          school={currentSchool}
          onClose={() => setShowSchoolEditor(false)}
          onSave={handleSchoolEditSave}
        />
      )}

      {showDataManager && (
        <DataManager
          school={currentSchool}
          buildings={buildings}
          onClose={() => setShowDataManager(false)}
          onSave={handleDataManagerSave}
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

  function previewBox(building) {
    const x = ((Number(building.x) - Number(building.w) / 2) / CAMPUS.width + 0.5) * 100;
    const y = ((Number(building.z) - Number(building.d) / 2) / CAMPUS.depth + 0.5) * 100;
    return {
      x,
      y,
      width: (Number(building.w) / CAMPUS.width) * 100,
      height: (Number(building.d) / CAMPUS.depth) * 100,
      accent: building.accent || '#2bb8a5',
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
              <svg className="editor-preview-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="建築位置預覽">
                {draft.buildings.map((building) => {
                  const selected = building.id === selectedBuildingId;
                  const box = previewBox(building);
                  const handles = selected ? previewHandlePoints(box) : [];
                  return (
                    <g
                      key={building.id}
                      className={`editor-building-svg${selected ? ' is-selected' : ''}`}
                      onPointerDown={(event) => beginPreviewDrag(event, building, 'move')}
                      onMouseDown={(event) => beginPreviewDrag(event, building, 'move')}
                    >
                      <rect x={box.x} y={box.y} width={box.width} height={box.height} fill={box.accent} fillOpacity="0.3" stroke={box.accent} />
                      <text x={box.x + box.width / 2} y={box.y + box.height / 2 - 1} textAnchor="middle" dominantBaseline="middle">{building.name || '未命名建築'}</text>
                      <text x={box.x + box.width / 2} y={box.y + box.height / 2 + 5} textAnchor="middle" dominantBaseline="middle" className="editor-building-svg-meta">{building.floors}F</text>
                      {handles.map((point) => (
                        <circle
                          key={point.handle}
                          className="editor-resize-svg-handle"
                          cx={point.x}
                          cy={point.y}
                          r="1.6"
                          onPointerDown={(event) => beginPreviewDrag(event, building, point.handle)}
                          onMouseDown={(event) => beginPreviewDrag(event, building, point.handle)}
                        />
                      ))}
                    </g>
                  );
                })}
              </svg>
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


function DataManager({ school, buildings: buildingList, onClose, onSave }) {
  const [activeTab, setActiveTab] = useState('devices');
  const [draftDevices, setDraftDevices] = useState(() => normalizeSceneDevices(school.devices || [], buildingList));
  const [draftLinks, setDraftLinks] = useState(() => normalizeNetworkLinks(school.networkLinks || [], school.devices || [], buildingList));
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const deviceIdSet = useMemo(() => new Set(draftDevices.map((device) => device.id)), [draftDevices]);

  function uniqueDeviceId(prefix) {
    let index = draftDevices.length + 1;
    let id = `${prefix}-${String(index).padStart(2, '0')}`;
    while (deviceIdSet.has(id)) {
      index += 1;
      id = `${prefix}-${String(index).padStart(2, '0')}`;
    }
    return id;
  }

  function updateDevice(index, field, value) {
    setDraftDevices((current) => {
      const previousId = current[index]?.id;
      const nextValue = ['x', 'z', 'users', 'mbps'].includes(field) ? Number(value) || 0 : value;
      const next = current.map((device, itemIndex) => (itemIndex === index ? { ...device, [field]: nextValue } : device));
      if (field === 'id' && previousId && value && previousId !== value) {
        setDraftLinks((links) => links.map((link) => ({
          ...link,
          deviceId: link.deviceId === previousId ? value : link.deviceId,
          switchId: link.switchId === previousId ? value : link.switchId,
          uplinkTo: link.uplinkTo === previousId ? value : link.uplinkTo,
        })));
      }
      return next;
    });
  }

  function addDevice(type = 'ap') {
    const building = buildingList[0] || { id: 'outdoor', x: 0, z: 0 };
    const id = uniqueDeviceId(type === 'switch' ? 'SW' : type === 'server' ? 'SV' : 'AP');
    setDraftDevices((current) => [
      ...current,
      {
        id,
        type,
        name: id,
        building: building.id,
        x: Number(building.x) || 0,
        z: Number(building.z) || 0,
        floor: '1F',
        room: '',
        placement: type === 'ap' ? 'room-center' : 'corridor-edge',
        status: 'online',
        users: 0,
        mbps: 0,
        channel: '',
        role: type === 'switch' ? '交換器' : type === 'server' ? '伺服器' : '無線 AP',
      },
    ]);
  }

  function removeDevice(id) {
    setDraftDevices((current) => current.filter((device) => device.id !== id));
    setDraftLinks((current) => current.filter((link) => link.deviceId !== id && link.switchId !== id));
  }

  function updateLink(index, field, value) {
    setDraftLinks((current) => current.map((link, itemIndex) => (
      itemIndex === index ? normalizeNetworkLink({ ...link, [field]: value }, index) : link
    )));
  }

  function addLink() {
    const candidates = draftDevices.filter((device) => device.type === 'ap' || device.type === 'switch');
    const device = candidates.find((item) => !draftLinks.some((link) => link.deviceId === item.id)) || candidates[0];
    if (!device) return;
    setDraftLinks((current) => [
      ...current,
      normalizeNetworkLink({
        id: `net-${device.id}`,
        deviceId: device.id,
        switchId: draftDevices.find((item) => item.type === 'switch')?.id || '',
        switchPort: '',
        medium: device.type === 'switch' ? 'fiber' : 'cat6',
        status: device.status || 'online',
      }, current.length),
    ]);
  }

  function removeLink(index) {
    setDraftLinks((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function importData(file) {
    if (!file) return;
    setImportError('');
    setImportMessage('');
    try {
      const text = await readTextFile(file);
      const parsed = JSON.parse(text);
      const importedDevices = Array.isArray(parsed) ? parsed : parsed.devices;
      const importedLinks = parsed.networkLinks || parsed.links || parsed.topology;
      if (activeTab === 'devices' && Array.isArray(importedDevices)) {
        const nextDevices = normalizeSceneDevices(importedDevices, buildingList);
        setDraftDevices(nextDevices);
        if (Array.isArray(importedLinks)) setDraftLinks(normalizeNetworkLinks(importedLinks, nextDevices, buildingList));
        setImportMessage(`已載入 ${nextDevices.length} 台設備`);
        return;
      }
      if (activeTab === 'links' && Array.isArray(importedLinks)) {
        const nextLinks = normalizeNetworkLinks(importedLinks, draftDevices, buildingList);
        setDraftLinks(nextLinks);
        setImportMessage(`已載入 ${nextLinks.length} 筆拓樸線路`);
        return;
      }
      throw new Error(activeTab === 'devices' ? 'JSON 需包含 devices 陣列' : 'JSON 需包含 networkLinks / links 陣列');
    } catch (error) {
      if (activeTab === 'links') {
        try {
          const text = await readTextFile(file);
          const records = parseNetworkLinksText(text, file.name);
          const nextLinks = normalizeNetworkLinks(records, draftDevices, buildingList);
          setDraftLinks(nextLinks);
          setImportMessage(`已載入 ${nextLinks.length} 筆拓樸線路`);
          return;
        } catch {}
      }
      setImportError(error.message || '資料匯入失敗');
    }
  }

  function exportData() {
    const payload = {
      schoolId: school.id,
      schoolName: school.name,
      exportedAt: new Date().toISOString(),
      devices: draftDevices,
      networkLinks: draftLinks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${school.id || 'school'}-devices-topology.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function save() {
    onSave(draftDevices, draftLinks);
  }

  return (
    <div className="editor-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="data-manager-modal" role="dialog" aria-modal="true" aria-label="設備與拓樸資料管理">
        <header className="editor-header">
          <div>
            <p className="editor-eyebrow">localStorage data</p>
            <h2>設備與拓樸資料管理</h2>
          </div>
          <button type="button" className="icon-button" aria-label="關閉" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="data-manager-toolbar">
          <div className="data-tabs" role="tablist" aria-label="資料類型">
            <button type="button" className={activeTab === 'devices' ? 'is-active' : ''} onClick={() => setActiveTab('devices')}>設備 {draftDevices.length}</button>
            <button type="button" className={activeTab === 'links' ? 'is-active' : ''} onClick={() => setActiveTab('links')}>拓樸線路 {draftLinks.length}</button>
          </div>
          <div className="data-actions">
            <label className="data-file-btn">
              <Upload size={15} />
              <span>匯入</span>
              <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => importData(event.target.files?.[0])} />
            </label>
            <button type="button" className="data-outline-btn" onClick={exportData}><Download size={15} /> 匯出</button>
            {activeTab === 'devices' ? (
              <button type="button" className="data-primary-btn" onClick={() => addDevice('ap')}><Plus size={15} /> 新增 AP</button>
            ) : (
              <button type="button" className="data-primary-btn" onClick={addLink}><Plus size={15} /> 新增線路</button>
            )}
          </div>
        </div>

        {(importMessage || importError) && (
          <div className="data-import-status">
            {importMessage && <p className="network-import-ok">{importMessage}</p>}
            {importError && <p className="network-import-error">{importError}</p>}
          </div>
        )}

        <div className="data-manager-body">
          {activeTab === 'devices' ? (
            <div className="data-table-wrap">
              <table className="data-table data-device-table">
                <thead>
                  <tr>
                    <th>類型</th>
                    <th>ID / 名稱</th>
                    <th>位置</th>
                    <th>狀態</th>
                    <th>用戶 / 流量</th>
                    <th>放置</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draftDevices.map((device, index) => (
                    <tr key={`${device.id}-${index}`}>
                      <td>
                        <select value={device.type || 'ap'} onChange={(event) => updateDevice(index, 'type', event.target.value)}>
                          <option value="ap">AP</option>
                          <option value="switch">Switch</option>
                          <option value="server">Server</option>
                          <option value="device">其他</option>
                        </select>
                      </td>
                      <td>
                        <input value={device.id || ''} onChange={(event) => updateDevice(index, 'id', event.target.value)} />
                        <input value={device.name || ''} onChange={(event) => updateDevice(index, 'name', event.target.value)} />
                      </td>
                      <td>
                        <select value={device.building || ''} onChange={(event) => updateDevice(index, 'building', event.target.value)}>
                          <option value="outdoor">戶外</option>
                          {buildingList.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
                        </select>
                        <div className="data-inline-fields">
                          <input value={device.floor || ''} onChange={(event) => updateDevice(index, 'floor', event.target.value)} placeholder="樓層" />
                          <input value={device.room || ''} onChange={(event) => updateDevice(index, 'room', event.target.value)} placeholder="Room" />
                        </div>
                        <div className="data-inline-fields">
                          <input type="number" value={device.x ?? 0} onChange={(event) => updateDevice(index, 'x', event.target.value)} />
                          <input type="number" value={device.z ?? 0} onChange={(event) => updateDevice(index, 'z', event.target.value)} />
                        </div>
                      </td>
                      <td>
                        <select value={device.status || 'online'} onChange={(event) => updateDevice(index, 'status', event.target.value)}>
                          <option value="online">正常</option>
                          <option value="warning">警告</option>
                          <option value="offline">故障</option>
                        </select>
                      </td>
                      <td>
                        <div className="data-inline-fields">
                          <input type="number" min="0" value={device.users ?? 0} onChange={(event) => updateDevice(index, 'users', event.target.value)} />
                          <input type="number" min="0" value={device.mbps ?? 0} onChange={(event) => updateDevice(index, 'mbps', event.target.value)} />
                        </div>
                      </td>
                      <td>
                        <select value={device.placement || defaultDevicePlacement(device.type)} onChange={(event) => updateDevice(index, 'placement', event.target.value)}>
                          <option value="room-center">教室置中</option>
                          <option value="corridor-edge">走廊線槽</option>
                          <option value="wall-edge">牆邊</option>
                        </select>
                      </td>
                      <td><button type="button" className="data-remove-btn" onClick={() => removeDevice(device.id)}><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table data-link-table">
                <thead>
                  <tr>
                    <th>設備</th>
                    <th>上聯 Switch / Port</th>
                    <th>配線</th>
                    <th>媒介 / 狀態</th>
                    <th>備註</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draftLinks.map((link, index) => (
                    <tr key={`${link.deviceId}-${index}`}>
                      <td>
                        <select value={link.deviceId || ''} onChange={(event) => updateLink(index, 'deviceId', event.target.value)}>
                          {draftDevices.filter((device) => device.type === 'ap' || device.type === 'switch').map((device) => (
                            <option key={device.id} value={device.id}>{device.id}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select value={link.switchId || ''} onChange={(event) => updateLink(index, 'switchId', event.target.value)}>
                          <option value="">未指定</option>
                          {draftDevices.filter((device) => device.type === 'switch').map((device) => (
                            <option key={device.id} value={device.id}>{device.id}</option>
                          ))}
                        </select>
                        <input value={link.switchPort || ''} onChange={(event) => updateLink(index, 'switchPort', event.target.value)} placeholder="Gi1/0/24" />
                      </td>
                      <td>
                        <input value={link.patchPanel || ''} onChange={(event) => updateLink(index, 'patchPanel', event.target.value)} placeholder="Patch panel" />
                        <input value={link.patchPort || ''} onChange={(event) => updateLink(index, 'patchPort', event.target.value)} placeholder="Patch port" />
                        <input value={link.cableId || ''} onChange={(event) => updateLink(index, 'cableId', event.target.value)} placeholder="線號" />
                      </td>
                      <td>
                        <select value={link.medium || 'cat6'} onChange={(event) => updateLink(index, 'medium', event.target.value)}>
                          <option value="cat6">Cat6</option>
                          <option value="fiber">光纖</option>
                        </select>
                        <select value={link.status || 'online'} onChange={(event) => updateLink(index, 'status', event.target.value)}>
                          <option value="online">正常</option>
                          <option value="warning">警告</option>
                          <option value="offline">故障</option>
                        </select>
                        <input value={link.vlan || ''} onChange={(event) => updateLink(index, 'vlan', event.target.value)} placeholder="VLAN" />
                      </td>
                      <td>
                        <input value={link.uplinkTo || ''} onChange={(event) => updateLink(index, 'uplinkTo', event.target.value)} placeholder="上聯" />
                        <input value={link.note || ''} onChange={(event) => updateLink(index, 'note', event.target.value)} placeholder="備註" />
                      </td>
                      <td><button type="button" className="data-remove-btn" onClick={() => removeLink(index)}><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="editor-footer">
          <p className="data-manager-note">目前版本儲存在瀏覽器 localStorage；正式系統可再改接 server API / database。</p>
          <button type="button" className="editor-cancel-btn" onClick={onClose}>取消</button>
          <button type="button" className="editor-save-btn" onClick={save}><Check size={16} /> 儲存資料</button>
        </footer>
      </div>
    </div>
  );
}


function CampusScene({
  mode,
  showPlan,
  showDevices,
  showCurrentFloorOnly,
  showHeatmap,
  showCabling,
  heightScale,
  labelScale,
  sceneOpacity,
  selectedEntity,
  selectedId,
  selectedFloor,
  selectedRoom,
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
  const pointerDragRef = useRef({ button: null, startX: 0, startY: 0, moved: false, suppressClick: false });
  const labelScaleRef = useRef(labelScale);
  const lastFlyRef = useRef({ entity: selectedEntity, heightScale });
  const [viewLevel, setViewLevel] = useState('overview');
  const viewLevelRef = useRef('overview');

  useEffect(() => {
    labelScaleRef.current = labelScale;
    if (contentRef.current && cameraRef.current) rescaleSceneLabels(contentRef.current, cameraRef.current, labelScale);
  }, [labelScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f7f8f5');
    scene.fog = new THREE.Fog('#f7f8f5', 150, 290);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    camera.position.set(72, 80, 96);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = envTexture;
    scene.environmentIntensity = 0.3;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 28;
    controls.maxDistance = 190;
    controls.target.set(0, 0, 6);
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

    const cancelFocusAnimation = () => {
      cancelAnimationFrame(camera.userData.focusAnimation);
      camera.userData.focusAnimation = 0;
    };
    const preventCanvasContextMenu = (event) => event.preventDefault();
    controls.addEventListener('start', cancelFocusAnimation);
    canvas.addEventListener('contextmenu', preventCanvasContextMenu);

    const hemisphere = new THREE.HemisphereLight('#ffffff', '#d5ddd8', 0.4);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight('#fff7ea', 1.25);
    sun.position.set(52, 86, 42);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 260;
    sun.shadow.camera.left = -110;
    sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 110;
    sun.shadow.camera.bottom = -110;
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.35;
    scene.add(sun);

    const composer = new EffectComposer(
      renderer,
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
    );
    const aoPass = new N8AOPass(scene, camera, 1, 1);
    aoPass.configuration.gammaCorrection = false;
    aoPass.configuration.halfRes = true;
    aoPass.configuration.aoRadius = 4;
    aoPass.configuration.distanceFalloff = 4;
    aoPass.configuration.intensity = 3.2;
    composer.addPass(aoPass);
    composer.addPass(new OutputPass());

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const width = Math.max(rect.width, 320);
      const height = Math.max(rect.height, 320);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener('resize', resize);

    const fwdVec = new THREE.Vector3();
    const rightVec = new THREE.Vector3();

    const animate = () => {
      controls.update();

      const nextViewLevel = getViewLevel(camera.position.distanceTo(controls.target));
      if (nextViewLevel !== viewLevelRef.current) {
        viewLevelRef.current = nextViewLevel;
        setViewLevel(nextViewLevel);
      }

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

      if (contentRef.current) rescaleSceneLabels(contentRef.current, camera, labelScaleRef.current, performance.now());
      composer.render();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('contextmenu', preventCanvasContextMenu);
      controls.removeEventListener('start', cancelFocusAnimation);
      cancelAnimationFrame(animationRef.current);
      controls.dispose();
      composer.dispose();
      envTexture.dispose();
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

    addGround(content, showPlan, planUrl, sceneOpacity.plan);
    if (showDefaultFeatures) addCampusFeatures(content);

    const activeBuildingId = getActiveBuildingId(selectedId);
    const activeBuilding = buildings.find((building) => building.id === activeBuildingId) || null;
    const sceneView = activeBuildingId && viewLevel !== 'overview' ? 'focus' : viewLevel;

    if (showHeatmap) {
      heatZones
        .filter((zone) => shouldRenderHeatZone(zone, sceneView, activeBuilding, selectedId))
        .forEach((zone) => addHeatZone(content, zone, mode, selectedId, interactiveRef.current, sceneView, activeBuilding));
    }

    buildings.forEach((building) => addBuilding(content, building, mode, heightScale, selectedId, activeBuildingId, showDevices || showCabling, selectedFloor, selectedRoom, interactiveRef.current, sceneView, sceneOpacity.building));

    if (showCabling && sceneView !== 'overview') {
      addCableInfrastructure(content, mode, selectedId, activeBuildingId, selectedFloor, selectedRoom, showCurrentFloorOnly, heightScale, interactiveRef.current, sceneOpacity.cabling);
    }

    if (showDevices) {
      devices
        .filter((device) => shouldRenderDevice(device, sceneView, activeBuildingId, selectedId))
        .filter((device) => shouldRenderDeviceForScope(device, showCurrentFloorOnly, activeBuildingId, selectedFloor, selectedRoom, selectedId))
        .forEach((device) => addDevice(content, device, mode, selectedId, heightScale, interactiveRef.current, sceneView, activeBuildingId, selectedFloor, selectedRoom, showCurrentFloorOnly, sceneOpacity.devices));
    }

    scene.add(content);
    contentRef.current = content;
  }, [mode, showPlan, showDevices, showCurrentFloorOnly, showHeatmap, showCabling, heightScale, labelScale, sceneOpacity, selectedId, selectedFloor, selectedRoom, sceneVersion, planUrl, showDefaultFeatures, viewLevel]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const lastFly = lastFlyRef.current;
    const flyTriggerChanged = lastFly.entity !== selectedEntity || lastFly.heightScale !== heightScale;
    lastFlyRef.current = { entity: selectedEntity, heightScale };
    if (!flyTriggerChanged) return;
    if (!camera || !controls || !selectedEntity) return;
    const isDevice = selectedEntity.type === 'ap' || selectedEntity.type === 'switch' || selectedEntity.type === 'server';
    if (!selectedEntity.floors && !isDevice && !selectedEntity.signal) return;

    const target = selectedEntity.floors
      ? getBuildingFocus(selectedEntity, heightScale)
      : isDevice
        ? getDeviceFocus(selectedEntity, heightScale)
        : getZoneFocus(selectedEntity);

    flyCameraTo(camera, controls, target.position, target.lookAt);
  }, [selectedEntity, heightScale]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const preset = getCampusCameraPreset(cameraPreset.name);
    camera.position.set(...preset.position);
    controls.target.set(...preset.target);
    controls.update();
  }, [cameraPreset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const setCursor = (cursor) => {
      canvas.classList.toggle('is-picking', cursor === 'pointer');
      canvas.classList.toggle('is-grabbing', cursor === 'grabbing');
    };

    const pick = (event, shouldSelect = false) => {
      const camera = cameraRef.current;
      if (!camera) return null;
      const rect = canvas.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      let isFloorHoveringSelectedBuilding = false;
      if (selectedEntity?.floors && !event.buttons) {
        const nextFloor = floorFromPointer(event, rect, selectedEntity, camera, heightScale, selectedFloor);
        isFloorHoveringSelectedBuilding = Boolean(nextFloor);
        if (nextFloor && nextFloor !== selectedFloor) onFloorSelect(nextFloor);
      }
      const hits = raycasterRef.current.intersectObjects(interactiveRef.current, true);
      const hit = hits.find((item) => item.object.userData?.entity);
      let entity = hit?.object.userData?.entity || null;
      if (!shouldSelect && isFloorHoveringSelectedBuilding) {
        entity = hoverEntityForSelectedBuilding(entity, selectedEntity);
      }
      setCursor(entity ? 'pointer' : 'grab');
      onHover(entity);
      if (shouldSelect && entity) onSelect(entity);
      return entity;
    };

    const handlePointerDown = (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      pointerDragRef.current = {
        button: event.button,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        suppressClick: pointerDragRef.current.suppressClick,
      };
      if (event.button === 2) setCursor('grabbing');
    };

    const handleMove = (event) => {
      const drag = pointerDragRef.current;
      if (drag.button !== null && event.buttons) {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
      }
      if (walkKeysRef.current.size > 0 || event.buttons || event.shiftKey) return;
      pick(event, false);
    };
    const handlePointerUp = (event) => {
      const drag = pointerDragRef.current;
      if (drag.button === event.button) {
        drag.suppressClick = drag.moved || event.button !== 0;
        drag.button = null;
      }
      setCursor('grab');
    };
    const handleLeave = () => {
      setCursor('grab');
      onHover(null);
    };
    const handleClick = (event) => {
      const drag = pointerDragRef.current;
      if (event.button !== 0 || drag.suppressClick) {
        drag.suppressClick = false;
        return;
      }
      pick(event, true);
    };
    const handleAuxClick = (event) => {
      if (event.button !== 0) event.preventDefault();
    };

    const handleWheel = (event) => {
      if (!selectedEntity?.floors || !event.shiftKey) return;
      const floors = Math.max(1, Number(selectedEntity.floors) || 1);
      const current = clamp(Number(selectedFloor) || getInitialFloorForEntity(selectedEntity) || floors, 1, floors);
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextFloor = clamp(current + direction, 1, floors);
      if (nextFloor === current) return;
      event.preventDefault();
      onFloorSelect(nextFloor);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handleLeave);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('auxclick', handleAuxClick);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handleLeave);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('auxclick', handleAuxClick);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [heightScale, onFloorSelect, onHover, onSelect, selectedEntity, selectedFloor]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls || isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const floorHotkey = floorHotkeyFromEvent(event, selectedEntity);
      if (floorHotkey) {
        event.preventDefault();
        onFloorSelect(floorHotkey);
        onHover(selectedEntity);
        return;
      }

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
  }, [onFloorSelect, onHover, selectedEntity]);

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

function addGround(group, showPlan, planUrl = '/school-plan.jpg', planOpacity = DEFAULT_SCENE_OPACITY.plan) {
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

  if (showPlan && planUrl) {
    new THREE.TextureLoader().load(planUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      const map = new THREE.Mesh(
        new THREE.PlaneGeometry(CAMPUS.width, CAMPUS.depth),
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.94,
          metalness: 0,
          transparent: true,
          opacity: clamp(planOpacity, 0.12, 1),
          depthWrite: false,
        }),
      );
      map.rotation.x = -Math.PI / 2;
      map.position.y = 0.015;
      map.renderOrder = 1;
      map.receiveShadow = true;
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
    new THREE.MeshStandardMaterial({ color: '#d9e4dc', roughness: 0.92, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  );
  track.rotation.x = -Math.PI / 2;
  track.scale.x = 0.78;
  track.position.set(0, 0.04, -13);
  track.receiveShadow = true;
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
    new THREE.MeshStandardMaterial({ color, roughness: 0.92, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.045, z);
  mesh.receiveShadow = true;
  group.add(mesh);
  group.add(createLabel(`場地｜${label}`, [x, 0.5, z], [8.8, 2.2, 1], '#31403c', 'rgba(245,255,250,0.7)'));
}

function addCourt(group, { x, z, w, d, label }) {
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: '#eaded9', roughness: 0.92, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  court.rotation.x = -Math.PI / 2;
  court.position.set(x, 0.05, z);
  court.receiveShadow = true;
  group.add(court);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.03, d)),
    new THREE.LineBasicMaterial({ color: '#9b5a59', transparent: true, opacity: 0.72 }),
  );
  edge.position.set(x, 0.08, z);
  group.add(edge);
  group.add(createLabel(`場地｜${label}`, [x, 0.55, z], [8.2, 2, 1], '#4e312d', 'rgba(255,248,243,0.72)'));
}

function addBuilding(group, building, mode, heightScale, selectedId, activeBuildingId, showDevices, selectedFloor, selectedRoom, interactive, sceneView = 'campus', opacityScale = 1) {
  const status = buildingStatus(building.id);
  const isActive = activeBuildingId === building.id;
  const isOverview = sceneView === 'overview';
  const isFocusOther = sceneView === 'focus' && activeBuildingId && !isActive;
  const highlightedFloor = isActive && selectedFloor ? Math.min(building.floors, Math.max(1, selectedFloor)) : null;
  const highlightedRoom = isActive && highlightedFloor && selectedRoom?.buildingId === building.id && selectedRoom.floor === highlightedFloor ? selectedRoom.room : null;
  const xray = isActive && showDevices && !isOverview;
  const floorHeight = BUILDING_FLOOR_HEIGHT;
  const h = Math.max(2.7, building.floors * floorHeight * heightScale);
  const color = mode === 'health' && status !== 'online' ? HEALTH[status].color : '#d8dee2';
  const bodyOpacity = clamp((isFocusOther ? 0.16 : xray ? 0.48 : 1) * opacityScale, 0.06, 1);
  const roofOpacity = clamp((isFocusOther ? 0.22 : xray ? 0.58 : 1) * opacityScale, 0.08, 1);
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: bodyOpacity < 1,
    opacity: bodyOpacity,
    depthWrite: bodyOpacity === 1,
    roughness: 0.72,
    metalness: 0.03,
    emissive: isActive ? '#2f9c86' : '#000000',
    emissiveIntensity: isActive ? 0.34 : 0,
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(building.w, h, building.d), material);
  mesh.position.set(building.x, h / 2, building.z);
  mesh.castShadow = bodyOpacity > 0.5;
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
  roof.castShadow = roofOpacity > 0.5;
  roof.userData.entity = building;
  interactive.push(roof);
  group.add(roof);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(building.w + 0.04, h + 0.04, building.d + 0.04)),
    new THREE.LineBasicMaterial({
      color: isActive ? '#0f6e5d' : '#58646d',
      transparent: true,
      opacity: isFocusOther ? 0.1 : isActive ? 0.92 : 0.42,
    }),
  );
  edges.position.copy(mesh.position);
  group.add(edges);

  const showFloorDetails = !isFocusOther && !isOverview && (isActive || mode === 'planning' || sceneView === 'detail');
  if (showFloorDetails) {
    addFloorStructure(group, building, floorHeight * heightScale, h, isActive, highlightedFloor, highlightedRoom);
  } else if (!isFocusOther) {
    addFacadeWindows(group, building, floorHeight * heightScale);
  }

  const showRoomLabels = !isOverview && !isFocusOther && (isActive || (sceneView === 'detail' && mode === 'planning'));
  addRoomLabels(group, building, floorHeight * heightScale, showRoomLabels, interactive, highlightedFloor, highlightedRoom, isActive);
  if (isOverview) addBuildingOverviewBadge(group, building, h, status);
  if (mode !== 'planning') addBuildingAlertBeacon(group, building, h, mode, heightScale, isFocusOther, interactive);
  if (isActive) addRoofDashboard(group, building, h, highlightedFloor, status);
  if (isActive) addBuildingFocusFrame(group, building, h);
  if (!isFocusOther) {
    const nameLabel = createLabel(
      building.name,
      [building.x, h + 2.2, building.z],
      [Math.min(16, building.w + 4.5), isActive ? 2.5 : 2.0, 1],
      isActive ? '#1f3138' : '#4a6068',
      isActive ? 'rgba(232,248,255,0.94)' : isOverview ? 'rgba(232,248,255,0.72)' : 'rgba(232,248,255,0.62)',
    );
    group.add(nameLabel);
  }
}

function addBuildingOverviewBadge(group, building, height, status) {
  const owned = devices.filter((device) => device.building === building.id);
  const issues = owned.filter((device) => device.status === 'offline' || device.status === 'warning').length;
  const badgeWidth = Math.max(6.5, Math.min(14, building.w * 0.54 + 3));
  const badgeDepth = Math.max(2.6, Math.min(5.4, building.d * 0.34 + 1.2));
  const badgeColor = status === 'offline' ? HEALTH.offline.color : status === 'warning' ? HEALTH.warning.color : HEALTH.online.color;
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(badgeWidth, 0.1, badgeDepth),
    new THREE.MeshBasicMaterial({ color: badgeColor, transparent: true, opacity: 0.72, depthWrite: false }),
  );
  plate.position.set(building.x, height + 0.36, building.z);
  plate.renderOrder = 12;
  group.add(plate);

  const labelText = `${HEALTH[status].label} · ${owned.length} 台${issues ? ` · ${issues} 警` : ''}`;
  const label = createLabel(labelText, [building.x, height + 1.18, building.z], [badgeWidth + 1.8, 1.02, 1], '#12312e', 'rgba(248,255,251,0.88)');
  label.renderOrder = 18;
  group.add(label);
}
function buildingAlertCounts(buildingId) {
  const owned = devices.filter((device) => device.building === buildingId);
  return {
    offline: owned.filter((device) => device.status === 'offline').length,
    warning: owned.filter((device) => device.status === 'warning').length,
    eol: owned.filter((device) => assetState(device) === 'eol').length,
  };
}

function campusMaxBuildingHeight(heightScale) {
  return buildings.reduce((max, building) => (
    Math.max(max, Math.max(2.7, (Number(building.floors) || 1) * BUILDING_FLOOR_HEIGHT * heightScale))
  ), 2.7);
}

function addBuildingAlertBeacon(group, building, height, mode, heightScale, isFocusOther, interactive) {
  const counts = buildingAlertCounts(building.id);
  const isAssetMode = mode === 'asset';
  const primary = isAssetMode ? counts.eol : counts.offline;
  const secondary = isAssetMode ? 0 : counts.warning;
  if (!primary && !secondary) return;

  const color = primary ? HEALTH.offline.color : HEALTH.warning.color;
  const topY = campusMaxBuildingHeight(heightScale) + 5.5;
  const pillarHeight = Math.max(2.4, topY - height);
  const dimFactor = isFocusOther ? 0.4 : 1;

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.42, pillarHeight, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 * dimFactor, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.set(building.x, height + pillarHeight / 2, building.z);
  pillar.renderOrder = 26;
  if (primary) pillar.userData.pulseRange = { min: 0.22 * dimFactor, max: 0.62 * dimFactor, phase: (building.x + building.z) * 0.35 };
  pillar.userData.entity = building;
  interactive.push(pillar);
  group.add(pillar);

  const tip = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.78),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 * dimFactor, depthWrite: false }),
  );
  tip.position.set(building.x, topY + 0.4, building.z);
  tip.renderOrder = 27;
  if (primary) tip.userData.pulseRange = { min: 0.55 * dimFactor, max: 0.95 * dimFactor, phase: (building.x + building.z) * 0.35 };
  tip.userData.entity = building;
  interactive.push(tip);
  group.add(tip);

  const labelText = isAssetMode
    ? `${primary} 台待汰換`
    : [primary ? `${primary} 故障` : '', secondary ? `${secondary} 警告` : ''].filter(Boolean).join(' · ');
  const labelBg = primary ? 'rgba(255,235,235,0.94)' : 'rgba(255,248,228,0.94)';
  const labelColor = primary ? '#7f1d1d' : '#7c5800';
  const label = createLabel(labelText, [building.x, topY + 1.9, building.z], [Math.max(5.4, labelText.length * 0.62), 1.18, 1], labelColor, labelBg);
  label.renderOrder = 40;
  label.material.opacity = dimFactor;
  label.userData.entity = building;
  interactive.push(label);
  group.add(label);
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

function addFloorStructure(group, building, floorStep, height, isSelected, highlightedFloor, highlightedRoom = null) {
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

  for (let floor = 1; floor <= building.floors; floor += 1) {
    const isCurrentFloor = !highlightedFloor || highlightedFloor === floor;
    const y = Math.max(0.42, floor * floorStep - 0.05);
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(building.w + 0.16, 0.04, building.d + 0.16),
      new THREE.MeshBasicMaterial({
        color: isCurrentFloor ? (isSelected ? '#74e0ca' : '#f3faf7') : '#dfe7e5',
        transparent: true,
        opacity: highlightedFloor ? (isCurrentFloor ? 0.42 : 0.06) : isSelected ? 0.36 : 0.26,
        depthWrite: false,
      }),
    );
    slab.position.set(building.x, y, building.z);
    slab.renderOrder = isCurrentFloor ? 7 : 4;
    group.add(slab);
  }

  addFloorLayoutGuides(group, building, floorStep, highlightedFloor, highlightedRoom, isSelected);

  if (highlightedFloor) {
    const floorY = (highlightedFloor - 0.5) * floorStep;
    const highlight = new THREE.Mesh(
      new THREE.BoxGeometry(building.w + 0.52, floorStep * 0.72, building.d + 0.52),
      new THREE.MeshBasicMaterial({
        color: '#2bb8a5',
        transparent: true,
        opacity: 0.13,
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
  addFloorLabels(group, building, floorStep, height, highlightedFloor);
}

function getBuildingLayout(building) {
  const longAxis = building.w >= building.d ? 'x' : 'z';
  const corridorWidth = longAxis === 'x'
    ? Math.max(1.45, Math.min(2.85, building.d * 0.28))
    : Math.max(1.45, Math.min(2.85, building.w * 0.28));
  const minX = building.x - building.w / 2;
  const maxX = building.x + building.w / 2;
  const minZ = building.z - building.d / 2;
  const maxZ = building.z + building.d / 2;

  if (longAxis === 'x') {
    const roomDepth = Math.max(1.2, building.d - corridorWidth);
    return {
      longAxis,
      corridorWidth,
      minX,
      maxX,
      minZ,
      maxZ,
      roomCenter: { x: building.x, z: minZ + roomDepth / 2 },
      roomSize: { w: building.w, d: roomDepth },
      corridorCenter: { x: building.x, z: maxZ - corridorWidth / 2 },
      corridorSize: { w: building.w, d: corridorWidth },
      boundaryZ: maxZ - corridorWidth,
    };
  }

  const roomWidth = Math.max(1.2, building.w - corridorWidth);
  return {
    longAxis,
    corridorWidth,
    minX,
    maxX,
    minZ,
    maxZ,
    roomCenter: { x: minX + roomWidth / 2, z: building.z },
    roomSize: { w: roomWidth, d: building.d },
    corridorCenter: { x: maxX - corridorWidth / 2, z: building.z },
    corridorSize: { w: corridorWidth, d: building.d },
    boundaryX: maxX - corridorWidth,
  };
}

function addFloorLayoutGuides(group, building, floorStep, highlightedFloor, highlightedRoom, isSelected) {
  const layout = getBuildingLayout(building);

  for (let floor = 1; floor <= building.floors; floor += 1) {
    const isCurrentFloor = !highlightedFloor || highlightedFloor === floor;
    if (highlightedFloor && !isCurrentFloor) continue;

    const roomsOnFloor = building.rooms?.[floor] || [];
    const partitionCount = Math.max(roomsOnFloor.length || 0, Math.min(8, Math.max(2, Math.floor((layout.longAxis === 'x' ? building.w : building.d) / 7))));
    const y = (floor - 0.5) * floorStep - 0.5;
    const opacity = highlightedFloor ? 0.48 : isSelected ? 0.28 : 0.16;

    const roomPlate = new THREE.Mesh(
      new THREE.BoxGeometry(layout.roomSize.w, 0.035, layout.roomSize.d),
      new THREE.MeshBasicMaterial({ color: '#e6f2f7', transparent: true, opacity: opacity * 0.55, depthWrite: false }),
    );
    roomPlate.position.set(layout.roomCenter.x, y, layout.roomCenter.z);
    roomPlate.renderOrder = 5;
    group.add(roomPlate);

    const corridorPlate = new THREE.Mesh(
      new THREE.BoxGeometry(layout.corridorSize.w, 0.045, layout.corridorSize.d),
      new THREE.MeshBasicMaterial({ color: '#f3c76f', transparent: true, opacity, depthWrite: false }),
    );
    corridorPlate.position.set(layout.corridorCenter.x, y + 0.015, layout.corridorCenter.z);
    corridorPlate.renderOrder = 6;
    group.add(corridorPlate);

    const selectedRoomIndex = highlightedRoom ? roomsOnFloor.findIndex((room) => roomNamesMatch(room, highlightedRoom)) : -1;
    if (selectedRoomIndex >= 0) {
      const bounds = roomBoundsForIndex(building, layout, roomsOnFloor.length, selectedRoomIndex);
      const selectedRoomPlate = new THREE.Mesh(
        new THREE.BoxGeometry(bounds.w, 0.07, bounds.d),
        new THREE.MeshBasicMaterial({ color: '#5ee0b8', transparent: true, opacity: 0.62, depthWrite: false }),
      );
      selectedRoomPlate.position.set(bounds.x, y + 0.08, bounds.z);
      selectedRoomPlate.renderOrder = 12;
      group.add(selectedRoomPlate);
    }

    const dividerPoints = [];
    const addSegment = (a, b) => {
      dividerPoints.push(new THREE.Vector3(a.x, y + 0.05, a.z), new THREE.Vector3(b.x, y + 0.05, b.z));
    };

    if (layout.longAxis === 'x') {
      addSegment({ x: layout.minX, z: layout.boundaryZ }, { x: layout.maxX, z: layout.boundaryZ });
      for (let index = 1; index < partitionCount; index += 1) {
        const x = layout.minX + (building.w * index) / partitionCount;
        addSegment({ x, z: layout.minZ }, { x, z: layout.boundaryZ });
      }
      addCableTrayLine(group, [{ x: layout.minX + 0.65, z: layout.corridorCenter.z }, { x: layout.maxX - 0.65, z: layout.corridorCenter.z }], y, opacity);
    } else {
      addSegment({ x: layout.boundaryX, z: layout.minZ }, { x: layout.boundaryX, z: layout.maxZ });
      for (let index = 1; index < partitionCount; index += 1) {
        const z = layout.minZ + (building.d * index) / partitionCount;
        addSegment({ x: layout.minX, z }, { x: layout.boundaryX, z });
      }
      addCableTrayLine(group, [{ x: layout.corridorCenter.x, z: layout.minZ + 0.65 }, { x: layout.corridorCenter.x, z: layout.maxZ - 0.65 }], y, opacity);
    }

    if (dividerPoints.length) {
      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(dividerPoints),
        new THREE.LineBasicMaterial({ color: '#49666f', transparent: true, opacity: Math.min(0.78, opacity + 0.18), depthWrite: false }),
      );
      lines.renderOrder = 9;
      group.add(lines);
    }

    if (isSelected && isCurrentFloor) {
      const corridorLabel = createLabel('走廊 / 線槽', [layout.corridorCenter.x, y + 0.34, layout.corridorCenter.z], [4.6, 0.76, 1], '#6b3f00', 'rgba(255,246,225,0.9)');
      corridorLabel.renderOrder = 17;
      group.add(corridorLabel);
    }
  }
}

function addCableTrayLine(group, endpoints, y, opacity) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(endpoints.map((point) => new THREE.Vector3(point.x, y + 0.09, point.z))),
    new THREE.LineBasicMaterial({ color: '#9a6b1e', transparent: true, opacity: Math.min(0.92, opacity + 0.22), depthWrite: false }),
  );
  line.renderOrder = 10;
  group.add(line);
}

function roomLabelPosition(building, layout, rooms, index, y) {
  const count = Math.max(1, rooms.length);
  if (layout.longAxis === 'x') {
    return [layout.minX + (building.w * (index + 0.5)) / count, y, layout.roomCenter.z];
  }
  return [layout.roomCenter.x, y, layout.minZ + (building.d * (index + 0.5)) / count];
}

function roomBoundsForIndex(building, layout, roomCount, index) {
  const count = Math.max(1, roomCount || 1);
  if (layout.longAxis === 'x') {
    const roomWidth = building.w / count;
    return {
      x: layout.minX + roomWidth * (index + 0.5),
      z: layout.roomCenter.z,
      w: Math.max(0.8, roomWidth - 0.12),
      d: Math.max(0.8, layout.roomSize.d - 0.12),
    };
  }
  const roomDepth = building.d / count;
  return {
    x: layout.roomCenter.x,
    z: layout.minZ + roomDepth * (index + 0.5),
    w: Math.max(0.8, layout.roomSize.w - 0.12),
    d: Math.max(0.8, roomDepth - 0.12),
  };
}

function roomNamesMatch(a, b) {
  const left = roomMatchKey(a);
  const right = roomMatchKey(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function deviceMatchesRoom(device, room) {
  if (!room) return true;
  const deviceRoom = device.room || inferRoomNameFromText(String(device.location || '') + ' ' + String(device.name || '') + ' ' + String(device.id || ''));
  return roomNamesMatch(deviceRoom, room);
}

function roomOccupancyPosition(device, heightScale, fallbackPosition) {
  const building = buildings.find((item) => item.id === device.building);
  if (!building) return { x: fallbackPosition.x + 0.72, y: fallbackPosition.y - 0.56, z: fallbackPosition.z + 0.72 };

  const floorStep = BUILDING_FLOOR_HEIGHT * heightScale;
  const floor = Math.max(1, parseDeviceFloor(device.floor));
  const y = (floor - 0.5) * floorStep - 0.56;
  const layout = getBuildingLayout(building);
  const roomsOnFloor = building.rooms?.[floor] || [];
  const deviceRoom = device.room || inferRoomNameFromText(`${device.location || ''} ${device.name || ''} ${device.id || ''}`);
  const roomIndex = roomsOnFloor.findIndex((room) => roomNamesMatch(room, deviceRoom));

  if (roomIndex < 0) {
    const inset = 0.72;
    return {
      x: clamp(fallbackPosition.x + inset, layout.minX + inset, layout.maxX - inset),
      y,
      z: clamp(fallbackPosition.z + inset, layout.minZ + inset, layout.maxZ - inset),
    };
  }

  const bounds = roomBoundsForIndex(building, layout, roomsOnFloor.length, roomIndex);
  if (layout.longAxis === 'x') {
    return {
      x: bounds.x,
      y,
      z: clamp(bounds.z - Math.min(1.15, bounds.d * 0.28), layout.minZ + 0.7, layout.maxZ - 0.7),
    };
  }

  return {
    x: clamp(bounds.x - Math.min(1.15, bounds.w * 0.28), layout.minX + 0.7, layout.maxX - 0.7),
    y,
    z: bounds.z,
  };
}

function addFloorLabels(group, building, floorStep, height, highlightedFloor = null) {
  const labelX = building.x - building.w / 2 + Math.min(2, building.w * 0.18);
  const labelZ = building.z + building.d / 2 + 0.96;

  for (let floor = 1; floor <= building.floors; floor += 1) {
    const y = (floor - 0.5) * floorStep;
    const isCurrent = !highlightedFloor || highlightedFloor === floor;
    const label = createLabel(`樓層 ${floor}F`, [labelX, y, labelZ], [isCurrent ? 4.25 : 3.35, isCurrent ? 0.98 : 0.78, 1], '#15323b', isCurrent ? 'rgba(238,248,255,0.9)' : 'rgba(238,248,255,0.42)');
    label.material.opacity = isCurrent ? 1 : 0.22;
    group.add(label);
  }

  if (building.basements) {
    const baseLabel = createLabel('B1', [labelX + 3.1, 0.44, labelZ], [2.55, 0.8, 1], '#5b3c35', 'rgba(255,239,220,0.9)');
    group.add(baseLabel);
  }

  const sideX = building.x + building.w / 2 + 0.62;
  const sideZ = building.z + building.d / 2 - Math.min(2, building.d * 0.18);
  const topLabel = createLabel(`樓層｜${buildingLevelSummary(building)}`, [sideX, Math.max(1.2, height - 0.65), sideZ], [4.4, 0.86, 1], '#223137', 'rgba(238,248,255,0.84)');
  group.add(topLabel);

  if (building.d >= 12) {
    const cornerX = building.x + building.w / 2 + 0.86;
    const cornerZ = building.z + building.d / 2 - Math.min(1.6, building.d * 0.12);
    for (let floor = 1; floor <= building.floors; floor += 1) {
      const y = (floor - 0.5) * floorStep;
      const isCurrent = !highlightedFloor || highlightedFloor === floor;
      const label = createLabel(`樓層 ${floor}F`, [cornerX, y, cornerZ], [isCurrent ? 3.8 : 3.0, isCurrent ? 0.84 : 0.68, 1], '#15323b', isCurrent ? 'rgba(238,248,255,0.84)' : 'rgba(238,248,255,0.38)');
      label.material.opacity = isCurrent ? 1 : 0.2;
      group.add(label);
    }
  }
}

function addRoomLabels(group, building, floorStep, showRooms, interactive, highlightedFloor, highlightedRoom, isActive) {
  if (!showRooms || !building.rooms) return;

  const layout = getBuildingLayout(building);
  const color = '#21424c';
  const floorEntries = Object.entries(building.rooms)
    .map(([floor, rooms]) => [Number(floor), rooms])
    .sort(([a], [b]) => a - b);

  floorEntries.forEach(([floor, rooms]) => {
    if (isActive && highlightedFloor && floor !== highlightedFloor) return;
    const y = (floor - 0.5) * floorStep - 0.2;

    rooms.forEach((room, index) => {
      const isCurrent = highlightedFloor === floor;
      const isSelectedRoom = isCurrent && highlightedRoom && roomNamesMatch(room, highlightedRoom);
      const position = roomLabelPosition(building, layout, rooms, index, y);
      const labelText = '室｜' + room;
      const scaleBoost = isSelectedRoom ? 1.24 : isCurrent ? 1.12 : 1;
      const scale = String(labelText).length >= 6
        ? [4.55 * scaleBoost, 0.9 * scaleBoost, 1]
        : [3.55 * scaleBoost, 0.86 * scaleBoost, 1];
      const label = createLabel(labelText, position, scale, isSelectedRoom ? '#063f36' : color, isSelectedRoom ? 'rgba(223,247,236,0.98)' : isCurrent ? 'rgba(235,250,255,0.96)' : 'rgba(235,250,255,0.78)');
      label.material.opacity = isActive && highlightedFloor && !isCurrent ? 0.14 : 1;
      label.renderOrder = isSelectedRoom ? 24 : isCurrent ? 20 : 11;
      label.userData.entity = building;
      interactive.push(label);
      group.add(label);
    });
  });
}

function addFacadeWindows(group, building, floorStep) {
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: '#cfe2ea',
    roughness: 0.16,
    metalness: 0.45,
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mullionMaterial = new THREE.MeshStandardMaterial({
    color: '#6f8087',
    roughness: 0.55,
    transparent: true,
    opacity: 0.4,
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
  if (entity.type === 'ap' || entity.type === 'switch' || entity.type === 'server') {
    const floor = parseDeviceFloor(entity.floor);
    return floor > 0 ? floor : null;
  }
  return null;
}

function floorHotkeyFromEvent(event, selectedEntity) {
  if (!selectedEntity?.floors || event.altKey || event.metaKey || event.ctrlKey) return null;
  const isNumpad = event.code?.startsWith('Numpad');
  const isDigit = event.code?.startsWith('Digit');
  if (!isNumpad && !isDigit) return null;
  const value = Number(event.key);
  if (!Number.isInteger(value)) return null;
  const requestedFloor = value === 0 ? 10 : value;
  const maxFloor = Math.max(1, Number(selectedEntity.floors) || 1);
  return requestedFloor >= 1 && requestedFloor <= maxFloor ? requestedFloor : null;
}

function hoverEntityForSelectedBuilding(entity, selectedBuilding) {
  if (!selectedBuilding?.floors) return entity;
  if (!entity) return selectedBuilding;
  if (entity.id === selectedBuilding.id) return selectedBuilding;
  const entityBuildingId = entity.building || entity.buildingId;
  if (entityBuildingId) return entityBuildingId === selectedBuilding.id ? entity : selectedBuilding;
  if (entity.floors) return selectedBuilding;
  return entity;
}

function floorFromPointer(event, rect, building, camera, heightScale, currentFloor = null) {
  const floors = Math.max(1, Number(building?.floors) || 1);
  const height = Math.max(2.7, floors * BUILDING_FLOOR_HEIGHT * heightScale);
  const bounds = buildingScreenBounds(building, height, camera, rect);
  if (!bounds) return null;

  const xPad = Math.max(26, bounds.width * 0.12);
  const yPad = Math.max(18, bounds.height * 0.08);
  const inX = event.clientX >= bounds.left - xPad && event.clientX <= bounds.right + xPad;
  const inY = event.clientY >= bounds.top - yPad && event.clientY <= bounds.bottom + yPad;
  if (!inX || !inY) return null;

  const y = clamp(event.clientY, bounds.top, bounds.bottom);
  const bandHeight = bounds.height / floors;
  const rawFloor = Math.min(floors, Math.max(1, floors - Math.floor((y - bounds.top) / Math.max(1, bandHeight))));
  const activeFloor = Math.min(floors, Math.max(1, Number(currentFloor) || rawFloor));
  if (rawFloor === activeFloor) return rawFloor;

  const activeTop = bounds.bottom - activeFloor * bandHeight;
  const activeBottom = bounds.bottom - (activeFloor - 1) * bandHeight;
  const hysteresis = Math.max(5, Math.min(18, bandHeight * 0.16));
  if (rawFloor > activeFloor && y < activeTop - hysteresis) return rawFloor;
  if (rawFloor < activeFloor && y > activeBottom + hysteresis) return rawFloor;
  return activeFloor;
}

function buildingScreenBounds(building, height, camera, rect) {
  const minX = building.x - building.w / 2;
  const maxX = building.x + building.w / 2;
  const minZ = building.z - building.d / 2;
  const maxZ = building.z + building.d / 2;
  const corners = [
    [minX, 0, minZ], [minX, 0, maxZ], [maxX, 0, minZ], [maxX, 0, maxZ],
    [minX, height, minZ], [minX, height, maxZ], [maxX, height, minZ], [maxX, height, maxZ],
  ];

  const points = corners.map(([x, y, z]) => projectToScreen(new THREE.Vector3(x, y, z), camera, rect)).filter(Boolean);
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  if (right - left < 4 || bottom - top < 4) return null;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function projectToScreen(point, camera, rect) {
  const projected = point.project(camera);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1 || projected.z > 1) return null;
  return {
    x: rect.left + ((projected.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - projected.y) / 2) * rect.height,
  };
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

function getViewLevel(distance) {
  if (distance > 108) return 'overview';
  if (distance > 64) return 'campus';
  return 'detail';
}

function rescaleSceneLabels(root, camera, userScale = 1, timeMs = 0) {
  root.traverse((child) => {
    const pulse = child.userData?.pulseRange;
    if (pulse && child.material && timeMs) {
      child.material.opacity = pulse.min + (pulse.max - pulse.min) * (0.5 + 0.5 * Math.sin(timeMs * 0.0042 + (pulse.phase || 0)));
    }
    const baseScale = child.userData?.labelBaseScale;
    if (!baseScale) return;
    child.getWorldPosition(LABEL_WORLD_POSITION);
    const distance = camera.position.distanceTo(LABEL_WORLD_POSITION);
    const factor = clamp(distance / LABEL_REFERENCE_DISTANCE, LABEL_MIN_SCALE, LABEL_MAX_SCALE) * userScale;
    child.scale.set(baseScale.x * factor, baseScale.y * factor, baseScale.z);
  });
}

function getBuildingFocus(building, heightScale) {
  const height = Math.max(2.7, building.floors * BUILDING_FLOOR_HEIGHT * heightScale);
  const span = Math.max(building.w, building.d);
  const distance = Math.max(24, span * 1.18);
  const lookAt = new THREE.Vector3(building.x, height * 0.48, building.z);
  const position = new THREE.Vector3(building.x + distance * 0.52, height + 15, building.z + distance * 0.88);
  return { position, lookAt };
}

function getCampusCameraPreset(name = 'home') {
  const bounds = campusBoundsForBuildings(buildings);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const width = Math.max(18, bounds.maxX - bounds.minX);
  const depth = Math.max(18, bounds.maxZ - bounds.minZ);
  const span = Math.max(width, depth, 54);
  const height = Math.max(58, Math.min(160, span * 0.78));
  const lookAt = [centerX, 0, centerZ];

  if (name === 'top') {
    return {
      position: [centerX, Math.max(96, Math.min(190, span * 1.55)), centerZ + 0.01],
      target: lookAt,
    };
  }

  if (name === 'east') {
    return {
      position: [centerX + span * 1.12, Math.max(46, span * 0.48), centerZ + depth * 0.08],
      target: lookAt,
    };
  }

  const cornerHeight = Math.max(58, Math.min(170, span * 0.72));
  const cornerOffset = span * 0.92;
  const cornerPresets = {
    northEast: [centerX + cornerOffset, cornerHeight, centerZ - cornerOffset],
    northWest: [centerX - cornerOffset, cornerHeight, centerZ - cornerOffset],
    southEast: [centerX + cornerOffset, cornerHeight, centerZ + cornerOffset],
    southWest: [centerX - cornerOffset, cornerHeight, centerZ + cornerOffset],
  };

  if (cornerPresets[name]) {
    return {
      position: cornerPresets[name],
      target: lookAt,
    };
  }

  return {
    position: [centerX + span * 0.58, height, centerZ + span * 0.78],
    target: [centerX, 0, centerZ + depth * 0.04],
  };
}

function campusBoundsForBuildings(buildingList = []) {
  const validBuildings = buildingList.filter((building) => Number.isFinite(Number(building.x)) && Number.isFinite(Number(building.z)));
  if (!validBuildings.length) {
    return {
      minX: -CAMPUS.width / 2,
      maxX: CAMPUS.width / 2,
      minZ: -CAMPUS.depth / 2,
      maxZ: CAMPUS.depth / 2,
    };
  }

  return validBuildings.reduce((bounds, building) => {
    const x = Number(building.x) || 0;
    const z = Number(building.z) || 0;
    const w = Math.max(1, Number(building.w) || 1);
    const d = Math.max(1, Number(building.d) || 1);
    return {
      minX: Math.min(bounds.minX, x - w / 2),
      maxX: Math.max(bounds.maxX, x + w / 2),
      minZ: Math.min(bounds.minZ, z - d / 2),
      maxZ: Math.max(bounds.maxZ, z + d / 2),
    };
  }, {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  });
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

function getZoneFocus(zone) {
  const spanW = zone.type === 'circle' ? (Number(zone.rx) || 6) * 2 : Number(zone.w) || 10;
  const spanD = zone.type === 'circle' ? (Number(zone.rz) || 6) * 2 : Number(zone.d) || 10;
  const span = Math.max(spanW, spanD, 10);
  const distance = Math.max(24, span * 1.5);
  return {
    lookAt: new THREE.Vector3(zone.x, 0.4, zone.z),
    position: new THREE.Vector3(zone.x + distance * 0.5, Math.max(18, span * 1.1), zone.z + distance * 0.75),
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

  const floorStep = BUILDING_FLOOR_HEIGHT * heightScale;
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

  if (!isEdgePlacement(device)) {
    return {
      x: Math.min(maxX - 0.8, Math.max(minX + 0.8, device.x)),
      y,
      z: Math.min(maxZ - 0.8, Math.max(minZ + 0.8, device.z)),
      leader: false,
    };
  }

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

function shouldRenderDevice(device, sceneView, activeBuildingId, selectedId) {
  if (selectedId === device.id) return true;
  if (device.status === 'offline') return true;
  if (sceneView === 'overview') return device.type === 'ap' || device.type === 'switch';
  if (sceneView === 'focus') return device.building === activeBuildingId;
  if (sceneView === 'campus') return device.status !== 'online' || /核心|匯聚|骨幹/i.test(device.role || '');
  return true;
}

function shouldRenderDeviceForScope(device, floorOnly, activeBuildingId, selectedFloor, selectedRoom, selectedId) {
  if (!floorOnly || !activeBuildingId || !selectedFloor) return true;
  if (selectedId === device.id) return true;
  if (device.building !== activeBuildingId) return false;
  if (parseDeviceFloor(device.floor) !== selectedFloor) return false;
  if (selectedRoom?.buildingId === activeBuildingId && selectedRoom.floor === selectedFloor) {
    return deviceMatchesRoom(device, selectedRoom.room);
  }
  return true;
}

function isPriorityDeviceLabel(device) {
  const text = [device.id, device.name, device.role, device.location, device.roomName, device.room]
    .filter(Boolean)
    .join(' ');
  return device.type === 'server' || /核心|匯聚|骨幹|控制器|controller|MDF|IDF/i.test(text);
}

function isFloorServiceSwitch(device) {
  if (device?.type !== 'switch') return false;
  const text = [device.id, device.name, device.role, device.location, device.room]
    .filter(Boolean)
    .join(' ');
  if (/核心|匯聚|L2 接取|無線骨幹|骨幹交換器|MDF|IDF|機房|前走廊|後走廊/i.test(text)) return true;
  if (/邊緣|教室邊緣|DGS-1210-10P|WS6-DGS-1210-10P/i.test(text)) return false;
  return /^CKJHS-L2-/i.test(device.id || '') || /SW\.24/i.test(device.id || '');
}

function isCrowdedAp(device) {
  if (device?.type !== 'ap') return false;
  return Number(device.users || 0) >= AP_LOAD_LIMITS.highUsers && Number(device.mbps || 0) > AP_LOAD_LIMITS.highMbps;
}

function shouldShowDeviceLabel(device, sceneView, activeBuildingId, selected, isFault, floorDimmed) {
  if (floorDimmed || sceneView === 'overview') return false;
  if (selected || isFault || device.status === 'warning') return true;
  if (sceneView === 'focus' && isFloorServiceSwitch(device)) return true;
  return isPriorityDeviceLabel(device) && sceneView !== 'overview';
}

function shouldRenderHeatZone(zone, sceneView, activeBuilding, selectedId) {
  if (selectedId === zone.id) return true;
  if (sceneView !== 'focus' || !activeBuilding) return true;
  return zoneOverlapsBuilding(zone, activeBuilding);
}

function zoneOverlapsBuilding(zone, building) {
  const zw = zone.type === 'circle' ? (zone.rx || 1) * 2 : zone.w;
  const zd = zone.type === 'circle' ? (zone.rz || 1) * 2 : zone.d;
  const zLeft = zone.x - zw / 2;
  const zRight = zone.x + zw / 2;
  const zTop = zone.z - zd / 2;
  const zBottom = zone.z + zd / 2;
  const bLeft = building.x - building.w / 2;
  const bRight = building.x + building.w / 2;
  const bTop = building.z - building.d / 2;
  const bBottom = building.z + building.d / 2;
  return zLeft <= bRight && zRight >= bLeft && zTop <= bBottom && zBottom >= bTop;
}

function addHeatZone(group, zone, mode, selectedId, interactive, sceneView = 'campus') {
  const color = zoneColor(zone, mode);
  const opacity = mode === 'planning' || mode === 'asset' ? 0.22 : selectedId === zone.id ? 0.68 : 0.48;
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

  if (sceneView !== 'overview' && selectedId === zone.id) {
    const zoneSummary = `${zone.label} · 訊號${SIGNAL[zone.signal].label} / ${TRAFFIC[zone.traffic].label}流量`;
    group.add(createLabel(zoneSummary, [zone.x, 1.05, zone.z], [Math.min(11, (zone.w || zone.rx) + 3), 1.35, 1], '#17252a'));
  }
}


function cableColorForLink(link, selected, fallbackStatus) {
  const status = link?.status || fallbackStatus;
  if (status === 'offline') return HEALTH.offline.color;
  if (status === 'warning') return HEALTH.warning.color;
  if (selected) return CABLING.selected.color;
  return link?.medium === 'fiber' ? CABLING.fiber.color : CABLING.copper.color;
}

function addCableInfrastructure(group, mode, selectedId, activeBuildingId, selectedFloor, selectedRoom, floorOnly, heightScale, interactive, opacityScale = 1) {
  const floorStep = BUILDING_FLOOR_HEIGHT * heightScale;
  const cableOpacity = clamp(opacityScale, 0.12, 1);
  const floorScope = floorOnly && activeBuildingId && selectedFloor ? Math.max(1, Number(selectedFloor) || 1) : null;
  const selectedDevice = devices.find((device) => device.id === selectedId);
  const coreDevice = devices.find((device) => device.type === 'switch' && /core|核心/i.test(`${device.id} ${device.name}`))
    || devices.find((device) => device.type === 'switch')
    || devices[0];
  const corePoint = coreDevice ? getDeviceRenderPosition(coreDevice, heightScale) : { x: 0, y: 0.25, z: 0 };
  const scopedBuildings = activeBuildingId ? buildings.filter((building) => building.id === activeBuildingId) : buildings;

  scopedBuildings.forEach((building) => {
    const isActive = !activeBuildingId || activeBuildingId === building.id || mode === 'cabling';
    addBuildingCableTrays(group, building, floorStep, isActive, selectedId, floorScope, cableOpacity);
    addBuildingRiser(group, building, floorStep, isActive, floorScope, cableOpacity);

    const riser = getRiserPoint(building, 1, floorStep);
    if (!activeBuildingId && coreDevice && building.id !== coreDevice.building) {
      const highlighted = selectedDevice?.building === building.id || selectedId === building.id;
      addCableTube(group, [
        new THREE.Vector3(corePoint.x, 0.22, corePoint.z),
        new THREE.Vector3(corePoint.x, 0.22, riser.z),
        new THREE.Vector3(riser.x, 0.22, riser.z),
        new THREE.Vector3(riser.x, riser.y, riser.z),
      ], highlighted ? CABLING.selected.color : CABLING.fiber.color, highlighted ? 0.13 : 0.08, (highlighted ? 0.92 : 0.42) * cableOpacity, highlighted ? 48 : 16);
    }
  });

  devices.forEach((device) => {
    if (!device.building || device.building === 'outdoor') return;
    if (activeBuildingId && device.building !== activeBuildingId) return;
    if (!shouldRenderDeviceForScope(device, floorOnly, activeBuildingId, selectedFloor, selectedRoom, selectedId)) return;
    const building = buildings.find((item) => item.id === device.building);
    if (!building) return;
    const selected = selectedId === device.id;
    const buildingSelected = selectedId === building.id;
    addDeviceCableDrop(group, building, device, floorStep, heightScale, selected, buildingSelected, interactive, cableOpacity);
  });

  const coreInFloorScope = !floorScope || selectedId === coreDevice?.id || parseDeviceFloor(coreDevice?.floor) === floorScope;
  if (coreDevice && coreInFloorScope && (!activeBuildingId || coreDevice.building === activeBuildingId || selectedId === coreDevice.id)) {
    const position = getDeviceRenderPosition(coreDevice, heightScale);
    const coreNode = createCableNode(CABLING.fiber.color, (selectedId === coreDevice.id ? 0.72 : 0.5) * cableOpacity);
    coreNode.position.set(position.x, position.y + 0.55, position.z);
    coreNode.userData.entity = coreDevice;
    interactive.push(coreNode);
    group.add(coreNode);
    const label = createLabel('Core / MDF', [position.x, position.y + 2.05, position.z], [4.7, 1, 1], '#2d165c', 'rgba(244,238,255,0.9)');
    label.renderOrder = 42;
    group.add(label);
  }
}

function addBuildingCableTrays(group, building, floorStep, isActive, selectedId, floorScope = null, opacityScale = 1) {
  const scopedFloor = floorScope ? clamp(Math.round(floorScope), 1, building.floors) : null;
  const floorsToDraw = scopedFloor ? [scopedFloor] : Array.from({ length: building.floors }, (_, index) => index + 1);
  const opacity = (isActive ? 0.72 : 0.32) * opacityScale;
  floorsToDraw.forEach((floor) => {
    const side = getCableTraySide(building, floor, floorStep);
    addLadderTray(group, side, isActive ? CABLING.tray.color : '#8b989c', opacity, isActive ? 28 : 12);
    if ((isActive && (floorScope ? floor === scopedFloor : floor === Math.min(building.floors, 2))) || selectedId === building.id) {
      const center = midpoint(side.a, side.b);
      const labelText = floorScope ? `${floor}F 走廊線槽` : '走廊線槽';
      const label = createLabel(labelText, [center.x, center.y + 0.48, center.z], [floorScope ? 5.2 : 4.2, 0.82, 1], '#29363b', 'rgba(255,255,255,0.76)');
      label.renderOrder = 30;
      group.add(label);
    }
  });
}

function addBuildingRiser(group, building, floorStep, isActive, floorScope = null, opacityScale = 1) {
  const scopedFloor = floorScope ? clamp(Math.round(floorScope), 1, building.floors) : null;
  const bottom = getRiserPoint(building, scopedFloor || 1, floorStep);
  const top = getRiserPoint(building, scopedFloor || building.floors, floorStep);
  bottom.y = 0.24;
  if (scopedFloor) {
    bottom.y = Math.max(0.24, bottom.y - floorStep * 0.42);
    top.y = Math.min(building.floors * floorStep + 0.72, top.y + floorStep * 0.42);
  } else {
    top.y += 0.72;
  }
  addCableTube(group, [new THREE.Vector3(bottom.x, bottom.y, bottom.z), new THREE.Vector3(top.x, top.y, top.z)], CABLING.riser.color, isActive ? 0.085 : 0.055, (isActive ? 0.72 : 0.38) * opacityScale, isActive ? 32 : 14);

  if (isActive) {
    const floorsToDraw = scopedFloor ? [scopedFloor] : Array.from({ length: building.floors }, (_, index) => index + 1);
    floorsToDraw.forEach((floor) => {
      const point = getRiserPoint(building, floor, floorStep);
      const idf = createCableNode(CABLING.riser.color, 0.52 * opacityScale, 0.52);
      idf.position.set(point.x, point.y, point.z);
      group.add(idf);
      if (scopedFloor || floor === 1 || floor === building.floors) {
        const label = createLabel(scopedFloor ? `${floor}F IDF` : floor === 1 ? 'MDF/IDF' : `${floor}F IDF`, [point.x, point.y + 0.8, point.z], [3.8, 0.82, 1], '#163265', 'rgba(232,241,255,0.82)');
        label.renderOrder = 34;
        group.add(label);
      }
    });
  }
}

function addDeviceCableDrop(group, building, device, floorStep, heightScale, selected, buildingSelected, interactive, opacityScale = 1) {
  const floor = Math.max(1, parseDeviceFloor(device.floor));
  const devicePoint = getDeviceRenderPosition(device, heightScale);
  const trayPoint = getNearestTrayPoint(building, floor, floorStep, devicePoint);
  const link = getNetworkLinkForDevice(device.id);
  const faulted = device.status === 'offline' || link?.status === 'offline';
  const color = cableColorForLink(link, selected, device.status);
  const opacity = (selected || faulted ? 0.95 : buildingSelected ? 0.62 : 0.46) * opacityScale;
  const radius = selected || faulted ? 0.075 : buildingSelected ? 0.052 : 0.045;
  const branch = addCableTube(group, [
    new THREE.Vector3(trayPoint.x, trayPoint.y, trayPoint.z),
    new THREE.Vector3(devicePoint.x, trayPoint.y, devicePoint.z),
    new THREE.Vector3(devicePoint.x, devicePoint.y - 0.35, devicePoint.z),
  ], color, radius, opacity, selected || faulted ? 52 : buildingSelected ? 34 : 26);
  branch.userData.entity = device;
  interactive.push(branch);

  if (selected || faulted) {
    const riser = getRiserPoint(building, floor, floorStep);
    addCableTube(group, [
      new THREE.Vector3(riser.x, riser.y, riser.z),
      new THREE.Vector3(trayPoint.x, trayPoint.y, trayPoint.z),
    ], CABLING.selected.color, 0.08, 0.96 * opacityScale, 54);
    const pathLabel = cablePathLabel(device, link, faulted);
    const labelWidth = Math.min(11.8, Math.max(6.4, pathLabel.length * 0.42));
    const label = createLabel(pathLabel, [devicePoint.x, devicePoint.y + 2.25, devicePoint.z], [labelWidth, 1, 1], '#7a3f00', 'rgba(255,244,218,0.92)');
    label.renderOrder = 56;
    group.add(label);
  }
}

function cablePathLabel(device, link, faulted = false) {
  if (!link) return faulted ? `${device.id} 線路異常` : `${device.id} 線路`;
  const upstream = compactPair(link.switchId, link.switchPort);
  const suffix = faulted ? ' · 異常' : '';
  return upstream === '-' ? `${device.id} 線路${suffix}` : `${device.id} → 上聯 ${upstream}${suffix}`;
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
  const finalOpacity = clamp(opacity, 0.04, 1);
  const path = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.08);
  const geometry = new THREE.TubeGeometry(path, Math.max(2, points.length * 8), radius, 8, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: finalOpacity < 1,
    opacity: finalOpacity,
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
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: clamp(opacity, 0.04, 1), depthTest: false, depthWrite: false }),
  );
}

function midpoint(a, b) {
  return new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

const SHARED_DEVICE_GEOMETRIES = new Map();
const SHARED_DEVICE_TEXTURES = new Map();

function sharedDeviceGeometry(key, factory) {
  let geometry = SHARED_DEVICE_GEOMETRIES.get(key);
  if (!geometry) {
    geometry = factory();
    geometry.userData.shared = true;
    SHARED_DEVICE_GEOMETRIES.set(key, geometry);
  }
  return geometry;
}

function sharedDeviceTexture(key, factory) {
  let texture = SHARED_DEVICE_TEXTURES.get(key);
  if (!texture) {
    texture = factory();
    texture.userData.shared = true;
    SHARED_DEVICE_TEXTURES.set(key, texture);
  }
  return texture;
}

const VENDOR_STYLES = {
  cisco: { label: 'CISCO', accent: '#049fd9', apShape: 'square' },
  aruba: { label: 'ARUBA', accent: '#ff8300', apShape: 'dome' },
  ubiquiti: { label: 'UNIFI', accent: '#2f7df6', apShape: 'dome' },
  juniper: { label: 'JUNIPER', accent: '#84b135', apShape: 'square' },
  dlink: { label: 'D-LINK', accent: '#00a0d6', apShape: 'softsquare' },
  tplink: { label: 'TP-LINK', accent: '#4acbd6', apShape: 'softsquare' },
  zyxel: { label: 'ZYXEL', accent: '#3b4cc0', apShape: 'softsquare' },
  generic: { label: 'LAN', accent: '#64748b', apShape: 'puck' },
};

function deviceVendorStyle(device) {
  const text = `${device?.vendor || ''} ${device?.model || ''} ${device?.name || ''}`.toLowerCase();
  if (/cisco|catalyst|meraki|aironet|cw9|c91\d/.test(text)) return VENDOR_STYLES.cisco;
  if (/aruba|hpe/.test(text)) return VENDOR_STYLES.aruba;
  if (/ubiquiti|unifi/.test(text)) return VENDOR_STYLES.ubiquiti;
  if (/juniper|\bex\d{4}/.test(text)) return VENDOR_STYLES.juniper;
  if (/d-?link|dap-|dgs-|dxs-|des-|ws6/.test(text)) return VENDOR_STYLES.dlink;
  if (/tp-?link|omada|eap\d/.test(text)) return VENDOR_STYLES.tplink;
  if (/zyxel|xgs|gs1200/.test(text)) return VENDOR_STYLES.zyxel;
  return VENDOR_STYLES.generic;
}

function createRoundedPlateGeometry(width, depth, height, radius) {
  const hw = width / 2 - radius;
  const hd = depth / 2 - radius;
  const shape = new THREE.Shape();
  shape.absarc(hw, hd, radius, 0, Math.PI / 2);
  shape.absarc(-hw, hd, radius, Math.PI / 2, Math.PI);
  shape.absarc(-hw, -hd, radius, Math.PI, Math.PI * 1.5);
  shape.absarc(hw, -hd, radius, Math.PI * 1.5, Math.PI * 2);
  const bevel = 0.025;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 6,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}

function createApBody(style, statusColorHex, emphasized, isFault) {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: emphasized ? '#fff7ed' : '#f3f7f5',
    emissive: statusColorHex,
    emissiveIntensity: isFault ? 0.3 : emphasized ? 0.18 : 0.07,
    roughness: 0.36,
    metalness: 0.04,
  });
  const led = new THREE.MeshStandardMaterial({
    color: statusColorHex,
    emissive: statusColorHex,
    emissiveIntensity: isFault ? 0.85 : 0.5,
    roughness: 0.3,
  });
  const accent = new THREE.MeshBasicMaterial({ color: style.accent, transparent: true, opacity: 0.85 });

  const shadowRadius = style.apShape === 'dome' ? 0.62 : style.apShape === 'softsquare' ? 0.55 : 0.66;
  const shadow = new THREE.Mesh(
    sharedDeviceGeometry('ap-shadow', () => new THREE.CircleGeometry(1, 32)),
    new THREE.MeshBasicMaterial({ color: '#22313a', transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.scale.setScalar(shadowRadius);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  group.add(shadow);

  if (style.apShape === 'square') {
    const plate = new THREE.Mesh(sharedDeviceGeometry('ap-square', () => createRoundedPlateGeometry(0.95, 0.95, 0.13, 0.2)), shell);
    group.add(plate);
    const ledBar = new THREE.Mesh(sharedDeviceGeometry('ap-square-led', () => new THREE.BoxGeometry(0.3, 0.045, 0.07)), led);
    ledBar.position.set(0, 0.17, 0.33);
    group.add(ledBar);
    const trim = new THREE.Mesh(sharedDeviceGeometry('ap-square-trim', () => new THREE.BoxGeometry(0.56, 0.028, 0.05)), accent);
    trim.position.set(0, 0.17, -0.3);
    group.add(trim);
  } else if (style.apShape === 'dome') {
    const base = new THREE.Mesh(sharedDeviceGeometry('ap-dome-base', () => new THREE.CylinderGeometry(0.5, 0.54, 0.09, 36)), shell);
    base.position.y = 0.045;
    group.add(base);
    const dome = new THREE.Mesh(sharedDeviceGeometry('ap-dome-top', () => {
      const geometry = new THREE.SphereGeometry(0.46, 30, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      geometry.scale(1, 0.62, 1);
      return geometry;
    }), shell);
    dome.position.y = 0.09;
    group.add(dome);
    const ring = new THREE.Mesh(sharedDeviceGeometry('ap-dome-ring', () => new THREE.TorusGeometry(0.42, 0.035, 10, 48)), led);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.13;
    group.add(ring);
  } else if (style.apShape === 'softsquare') {
    const plate = new THREE.Mesh(sharedDeviceGeometry('ap-soft', () => createRoundedPlateGeometry(0.8, 0.8, 0.11, 0.26)), shell);
    group.add(plate);
    const bump = new THREE.Mesh(sharedDeviceGeometry('ap-soft-bump', () => {
      const geometry = new THREE.SphereGeometry(0.27, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      geometry.scale(1, 0.5, 1);
      return geometry;
    }), shell);
    bump.position.y = 0.13;
    group.add(bump);
    const dot = new THREE.Mesh(sharedDeviceGeometry('ap-soft-dot', () => new THREE.SphereGeometry(0.07, 14, 10)), led);
    dot.position.set(0.22, 0.14, 0.22);
    group.add(dot);
    const trim = new THREE.Mesh(sharedDeviceGeometry('ap-soft-trim', () => new THREE.BoxGeometry(0.4, 0.026, 0.045)), accent);
    trim.position.set(-0.08, 0.15, -0.24);
    group.add(trim);
  } else {
    const puck = new THREE.Mesh(sharedDeviceGeometry('ap-puck', () => new THREE.CylinderGeometry(0.55, 0.55, 0.16, 32)), shell);
    puck.position.y = 0.08;
    group.add(puck);
    const dot = new THREE.Mesh(sharedDeviceGeometry('ap-puck-dot', () => new THREE.SphereGeometry(0.18, 18, 12)), led);
    dot.position.y = 0.24;
    group.add(dot);
  }
  return group;
}

function createSwitchFaceTexture(style, portCount, ledHex, isFault) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 84;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b2127';
  ctx.fillRect(0, 0, 384, 84);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, 0, 384, 4);
  ctx.fillStyle = style.accent;
  ctx.fillRect(0, 0, 10, 84);

  const perRow = Math.ceil(portCount / 2);
  const startX = 26;
  const gapX = 22;
  for (let index = 0; index < portCount; index += 1) {
    const row = index < perRow ? 0 : 1;
    const col = row === 0 ? index : index - perRow;
    const x = startX + col * gapX;
    const y = row === 0 ? 16 : 48;
    ctx.fillStyle = '#0c1115';
    ctx.fillRect(x, y + 7, 16, 12);
    ctx.strokeStyle = '#39444c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y + 7, 16, 12);
    const lit = !isFault && index % 4 !== 3;
    ctx.fillStyle = lit ? ledHex : isFault ? '#5b2020' : '#36424c';
    ctx.fillRect(x + 4, y, 8, 4);
  }

  ctx.fillStyle = '#9fb3bd';
  ctx.font = '800 21px "Noto Sans TC", "PingFang TC", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.label, 374, 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createSwitchBody(style, barColorHex, isFault, floorService) {
  const group = new THREE.Group();
  const units = floorService ? 2 : 1;
  const unitHeight = 0.4;
  const unitGap = 0.05;

  const pedestal = new THREE.Mesh(
    sharedDeviceGeometry('sw-pedestal', () => new THREE.BoxGeometry(1.34, 0.32, 0.82)),
    new THREE.MeshStandardMaterial({ color: '#252c33', roughness: 0.52, metalness: 0.22 }),
  );
  pedestal.position.y = -0.16;
  group.add(pedestal);
  const pedestalTrim = new THREE.Mesh(
    sharedDeviceGeometry('sw-pedestal-trim', () => new THREE.BoxGeometry(1.34, 0.045, 0.05)),
    new THREE.MeshBasicMaterial({ color: style.accent, transparent: true, opacity: 0.75 }),
  );
  pedestalTrim.position.set(0, -0.03, 0.41);
  group.add(pedestalTrim);
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(
      sharedDeviceGeometry('sw-foot', () => new THREE.BoxGeometry(0.18, 0.09, 0.72)),
      new THREE.MeshStandardMaterial({ color: '#1b2127', roughness: 0.6 }),
    );
    foot.position.set(side * 0.52, -0.36, 0);
    group.add(foot);
  }
  const portCount = floorService ? 24 : 10;
  const faceTexture = sharedDeviceTexture(
    `sw-face|${style.label}|${portCount}|${barColorHex}|${isFault ? 'fault' : 'ok'}`,
    () => createSwitchFaceTexture(style, portCount, barColorHex, isFault),
  );

  for (let unit = 0; unit < units; unit += 1) {
    const y = unit * (unitHeight + unitGap) + unitHeight / 2;
    const chassis = new THREE.Mesh(
      sharedDeviceGeometry('sw-chassis', () => new THREE.BoxGeometry(1.5, 0.4, 0.95)),
      new THREE.MeshStandardMaterial({
        color: isFault ? '#7f2222' : '#39414a',
        roughness: 0.42,
        metalness: 0.35,
        emissive: isFault ? HEALTH.offline.color : '#000000',
        emissiveIntensity: isFault ? 0.25 : 0,
      }),
    );
    chassis.position.y = y;
    group.add(chassis);

    const face = new THREE.Mesh(
      sharedDeviceGeometry('sw-faceplate', () => new THREE.PlaneGeometry(1.42, 0.3)),
      new THREE.MeshBasicMaterial({ map: faceTexture }),
    );
    face.position.set(0, y, 0.477);
    group.add(face);
  }

  const topY = units * (unitHeight + unitGap) - unitGap;
  const bar = new THREE.Mesh(
    sharedDeviceGeometry('sw-bar', () => new THREE.BoxGeometry(1.08, 0.055, 0.1)),
    new THREE.MeshStandardMaterial({ color: barColorHex, emissive: barColorHex, emissiveIntensity: 0.8, roughness: 0.35 }),
  );
  bar.position.set(0, topY + 0.03, 0.36);
  group.add(bar);
  return group;
}

function addDevice(group, device, mode, selectedId, heightScale, interactive, sceneView = 'detail', activeBuildingId = null, selectedFloor = null, selectedRoom = null, floorOnly = false, opacityScale = 1) {
  const position = getDeviceRenderPosition(device, heightScale);
  const color = statusColor(device.status, mode, device);
  const selected = selectedId === device.id;
  const isFault = device.status === 'offline';
  const isOverview = sceneView === 'overview';
  const floorServiceSwitch = isFloorServiceSwitch(device);
  const deviceFloor = parseDeviceFloor(device.floor);
  const roomFilterActive = selectedRoom?.buildingId === device.building && selectedRoom.floor === selectedFloor;
  const outsideSelectedFloor = selectedFloor && deviceFloor !== selectedFloor;
  const outsideSelectedRoom = roomFilterActive && deviceFloor === selectedFloor && !deviceMatchesRoom(device, selectedRoom.room);
  const inSelectedScope = activeBuildingId === device.building && selectedFloor && deviceFloor === selectedFloor && (!roomFilterActive || deviceMatchesRoom(device, selectedRoom.room));
  const floorDimmed = sceneView === 'focus' && activeBuildingId === device.building && selectedFloor && (outsideSelectedFloor || outsideSelectedRoom) && !selected && !isFault;
  const crowdedAp = isCrowdedAp(device);
  const isHighLoad = device.type === 'ap' ? crowdedAp : Number(device.users || 0) >= 70 || Number(device.mbps || 0) >= 550;
  const focusedAp = device.type === 'ap' && sceneView === 'focus' && activeBuildingId === device.building && (!selectedFloor || deviceFloor === selectedFloor) && !floorDimmed;
  const markerScale = isOverview ? 0.58 : floorDimmed ? 0.72 : floorOnly && inSelectedScope ? 1.16 : focusedAp ? 1.12 : 1;
  const dimOpacity = floorDimmed ? 0.18 : 1;
  const deviceOpacity = selected || isFault ? 1 : clamp(opacityScale, 0.12, 1);

  const marker = new THREE.Group();
  marker.position.set(position.x, position.y, position.z);

  if (device.type !== 'switch' || isFault) {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, isFault ? 1.65 : 1.2, 14),
      new THREE.MeshStandardMaterial({ color: isFault ? '#b91c1c' : '#4f5b5e', roughness: 0.6 }),
    );
    stem.position.y = isFault ? -0.96 : -0.75;
    marker.add(stem);
  }

  const vendorStyle = deviceVendorStyle(device);

  if (device.type === 'ap') {
    const body = createApBody(vendorStyle, color, selected || isHighLoad, isFault);
    body.scale.setScalar((selected || isFault ? 1.12 : 1) * markerScale);
    body.position.y = -0.07;
    body.traverse((child) => {
      child.userData.entity = device;
      if (child.isMesh) interactive.push(child);
    });
    marker.add(body);

    const glyph = createApWifiGlyph(isFault ? HEALTH.offline.color : '#0f766e', markerScale, selected || isFault || focusedAp);
    glyph.position.y = (vendorStyle.apShape === 'dome' ? 0.5 : 0.4) * markerScale;
    glyph.traverse((child) => {
      child.userData.entity = device;
      interactive.push(child);
    });
    marker.add(glyph);

    if (crowdedAp && !isFault && !floorDimmed) {
      const crowd = createApUserCrowdGlyph(device.users, Math.max(1.25, markerScale * 1.2), selected);
      const crowdPosition = roomOccupancyPosition(device, heightScale, position);
      crowd.position.set(crowdPosition.x, crowdPosition.y, crowdPosition.z);
      crowd.traverse((child) => {
        child.renderOrder = selected ? 39 : 34;
        child.userData.entity = device;
        if (child.isMesh) {
          const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
          materials.forEach((material) => {
            material.depthTest = false;
            material.depthWrite = false;
            if (deviceOpacity < 0.999) {
              material.transparent = true;
              material.opacity = (material.opacity ?? 1) * deviceOpacity;
            }
          });
          interactive.push(child);
        }
      });
      group.add(crowd);
    }

    const apNeedsRing = selected || isFault;
    if (apNeedsRing && !floorDimmed) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.05 * markerScale, (isFault ? 0.07 : 0.045) * markerScale, 10, 56),
        new THREE.MeshBasicMaterial({
          color: isFault ? HEALTH.offline.color : loadColor(device.users, device.mbps, device.type),
          transparent: true,
          opacity: selected || isFault ? 0.86 : 0.5,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.08;
      ring.userData.entity = device;
      interactive.push(ring);
      marker.add(ring);
    }
  } else {
    const switchColor = isFault
      ? HEALTH.offline.color
      : device.status === 'warning'
        ? HEALTH.warning.color
        : mode === 'cabling' && device.type === 'switch'
          ? floorServiceSwitch ? CABLING.floorSwitch.color : CABLING.edgeSwitch.color
          : color;
    if (device.type === 'switch') {
      const body = createSwitchBody(vendorStyle, switchColor, isFault, floorServiceSwitch);
      body.scale.setScalar((selected || isFault ? 1.2 : 1) * markerScale * (floorServiceSwitch ? 1.1 : 1));
      body.position.y = floorServiceSwitch ? -0.45 : -0.22;
      body.traverse((child) => {
        child.userData.entity = device;
        if (child.isMesh) interactive.push(child);
      });
      marker.add(body);
    } else {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(
          (selected || isFault ? 1.55 : 1.25) * markerScale,
          (selected || isFault ? 1.05 : 0.85) * markerScale,
          (selected || isFault ? 1.35 : 1.1) * markerScale,
        ),
        new THREE.MeshStandardMaterial({ color: switchColor, emissive: switchColor, emissiveIntensity: isFault ? 0.48 : 0.16, roughness: 0.5 }),
      );
      box.userData.entity = device;
      interactive.push(box);
      marker.add(box);
    }
  }

  const showLoadHalo = device.type !== 'ap' && (selected || isFault || device.status === 'warning' || isHighLoad);
  if (showLoadHalo) {
    const haloRadius = selected || isFault ? 2.15 : 1.68;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(haloRadius * markerScale, (isFault ? 0.08 : 0.055) * markerScale, 12, 72),
      new THREE.MeshBasicMaterial({ color: isFault ? HEALTH.offline.color : loadColor(device.users, device.mbps), transparent: true, opacity: isOverview && !selected && !isFault ? 0.28 : selected || isFault ? 0.92 : 0.55 }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.95;
    halo.userData.entity = device;
    interactive.push(halo);
    marker.add(halo);
  }

  if (isFault) {
    const alarm = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 4.2, 36, 1, true),
      new THREE.MeshBasicMaterial({ color: HEALTH.offline.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    alarm.position.y = 0.92;
    alarm.userData.pulseRange = { min: 0.08, max: 0.3, phase: position.x * 0.4 };
    alarm.userData.entity = device;
    interactive.push(alarm);
    marker.add(alarm);
  }

  const showLabel = shouldShowDeviceLabel(device, sceneView, activeBuildingId, selected, isFault, floorDimmed);
  if (showLabel) {
    const labelText = isFault ? `${deviceTypePrefix(device)}｜${device.id} 故障` : `${deviceTypePrefix(device)}｜${device.id}`;
    const labelWidth = Math.min(8.8, Math.max(isFault ? 6.8 : 5.6, labelText.length * 0.48));
    const labelTone = deviceLabelTone(device, isFault);
    const label = createLabel(labelText, [0, 1.35, 0], [labelWidth, 1.15, 1], labelTone.color, labelTone.bg);
    label.userData.entity = device;
    interactive.push(label);
    marker.add(label);
  }

  marker.traverse((child) => {
    child.renderOrder = isFault ? 36 : 30;
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material) => {
      material.depthTest = false;
      material.depthWrite = false;
      const opacityFactor = dimOpacity * deviceOpacity;
      if (opacityFactor < 0.999) {
        material.transparent = true;
        material.opacity = (material.opacity ?? 1) * opacityFactor;
      }
    });
  });

  if (position.leader) {
    const leader = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(device.x, position.y - 0.95, device.z),
        new THREE.Vector3(position.x, position.y - 0.95, position.z),
      ]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: (floorDimmed ? 0.12 : isFault ? 0.88 : 0.45) * deviceOpacity, depthTest: false, depthWrite: false }),
    );
    leader.renderOrder = isFault ? 34 : 24;
    group.add(leader);
  }

  group.add(marker);
}

function createApWifiGlyph(color, scale = 1, strong = false) {
  const group = new THREE.Group();
  const opacity = strong ? 0.94 : 0.76;
  const arcMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
  const radii = [0.3, 0.52, 0.74];
  [0, Math.PI / 2].forEach((rotationY) => {
    radii.forEach((radius, index) => {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(radius * scale, (0.023 + index * 0.004) * scale, 6, 28, Math.PI),
        arcMaterial,
      );
      arc.rotation.y = rotationY;
      arc.position.y = (0.08 + index * 0.03) * scale;
      group.add(arc);
    });
  });
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.09 * scale, 12, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity + 0.1), depthTest: false, depthWrite: false }),
  );
  dot.position.y = -0.06 * scale;
  group.add(dot);
  return group;
}

function createApUserCrowdGlyph(users, scale = 1, strong = false) {
  const group = new THREE.Group();
  const count = Math.min(18, Math.max(1, Math.ceil(Number(users || 0) / 10)));
  const columns = Math.min(6, count);
  const rows = Math.ceil(count / columns);
  const spacing = 0.42 * scale;
  const userColor = strong ? '#fb923c' : '#f59e0b';
  const headMaterial = new THREE.MeshBasicMaterial({ color: '#fff7ed', transparent: true, opacity: 0.96, depthTest: false, depthWrite: false });
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: userColor, transparent: true, opacity: strong ? 0.96 : 0.86, depthTest: false, depthWrite: false });
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry((0.68 + columns * 0.18) * scale, 32),
    new THREE.MeshBasicMaterial({ color: '#fed7aa', transparent: true, opacity: strong ? 0.28 : 0.2, depthTest: false, depthWrite: false }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = -0.14 * scale;
  group.add(pad);

  for (let index = 0; index < count; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const person = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 12, 10), headMaterial);
    head.position.y = 0.3 * scale;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * scale, 0.09 * scale, 0.24 * scale, 10), bodyMaterial);
    body.position.y = 0.1 * scale;
    person.add(body, head);
    person.position.set(
      (col - (columns - 1) / 2) * spacing,
      0,
      (row - (rows - 1) / 2) * spacing,
    );
    group.add(person);
  }

  return group;
}

function deviceTypePrefix(device) {
  if (device.type === 'ap') return 'AP';
  if (device.type === 'switch') return isFloorServiceSwitch(device) ? '樓層SW' : '邊緣SW';
  if (device.type === 'server') return 'SV';
  return 'DEV';
}

function deviceLabelTone(device, isFault = false) {
  if (isFault) return { color: '#7f1d1d', bg: 'rgba(255,230,230,0.92)' };
  if (device.type === 'ap') return { color: '#0f3f35', bg: 'rgba(224,255,244,0.88)' };
  if (device.type === 'switch' && isFloorServiceSwitch(device)) return { color: '#123d73', bg: 'rgba(218,235,255,0.94)' };
  if (device.type === 'switch') return { color: '#155e75', bg: 'rgba(224,247,255,0.9)' };
  if (device.type === 'server') return { color: '#3b245f', bg: 'rgba(244,238,255,0.9)' };
  return { color: '#17252a', bg: 'rgba(255,255,255,0.76)' };
}

function createLabel(text, position, scale = [8, 2, 1], color = '#17252a', bg = 'rgba(255,255,255,0.7)') {
  const texture = createTextTexture(text, color, bg);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, alphaTest: 0.02 }),
  );
  sprite.position.set(...position);
  sprite.scale.set(...scale);
  sprite.userData.labelBaseScale = new THREE.Vector3(...scale);
  sprite.renderOrder = 8;
  return sprite;
}

function createTextTexture(text, color, bg) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 62;
  const paddingX = 36;
  const logicalHeight = 108;
  const textureScale = LABEL_TEXTURE_SCALE;
  ctx.font = `800 ${fontSize}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  const metrics = ctx.measureText(text);
  const logicalWidth = Math.ceil(metrics.width + paddingX * 2);
  canvas.width = Math.ceil(logicalWidth * textureScale);
  canvas.height = Math.ceil(logicalHeight * textureScale);
  ctx.scale(textureScale, textureScale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);
  ctx.fillStyle = bg;
  roundedRect(ctx, 0.5, 9.5, logicalWidth - 1, logicalHeight - 19, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 2;
  roundedRect(ctx, 1.5, 10.5, logicalWidth - 3, logicalHeight - 21, 13);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fontSize}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.shadowColor = 'rgba(255,255,255,0.42)';
  ctx.shadowBlur = 1.6;
  ctx.shadowOffsetY = 0;
  ctx.fillText(text, logicalWidth / 2, logicalHeight / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
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
    if (child.geometry && !child.geometry.userData?.shared) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map && !material.map.userData?.shared) material.map.dispose();
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

function buildingDeviceSummary(buildingId) {
  const counts = devices
    .filter((device) => device.building === buildingId)
    .reduce((acc, device) => {
      acc[device.type] = (acc[device.type] || 0) + 1;
      return acc;
    }, {});
  const parts = [
    counts.ap ? `${counts.ap} AP` : '',
    counts.switch ? `${counts.switch} 交換器` : '',
    counts.server ? `${counts.server} 伺服器` : '',
  ].filter(Boolean);
  const known = (counts.ap || 0) + (counts.switch || 0) + (counts.server || 0);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total > known) parts.push(`${total - known} 其他`);
  return parts.length ? parts.join(' · ') : '無設備';
}

function statusColor(status, mode, device) {
  if (mode === 'traffic') return loadColor(device.users, device.mbps, device.type);
  if (mode === 'asset') return ASSET[assetState(device)].color;
  return HEALTH[status]?.color || HEALTH.online.color;
}

function loadColor(users, mbps, profile = 'default') {
  if (profile === 'ap') {
    if (users >= AP_LOAD_LIMITS.criticalUsers || mbps > AP_LOAD_LIMITS.criticalMbps) return TRAFFIC.critical.color;
    if (users >= AP_LOAD_LIMITS.highUsers || mbps > AP_LOAD_LIMITS.highMbps) return TRAFFIC.high.color;
    if (users >= AP_LOAD_LIMITS.mediumUsers || mbps > AP_LOAD_LIMITS.mediumMbps) return TRAFFIC.medium.color;
    return TRAFFIC.low.color;
  }
  if (users >= 110 || mbps >= 850) return TRAFFIC.critical.color;
  if (users >= 70 || mbps >= 550) return TRAFFIC.high.color;
  if (users >= 35 || mbps >= 260) return TRAFFIC.medium.color;
  return TRAFFIC.low.color;
}

function zoneColor(zone, mode) {
  if (mode === 'traffic') return TRAFFIC[zone.traffic].color;
  if (mode === 'health' && zone.signal === 'outage') return HEALTH.offline.color;
  if (mode === 'planning' || mode === 'asset') return '#9fb0b7';
  return SIGNAL[zone.signal].color;
}

function zoneTone(zone, mode) {
  if (mode === 'traffic') return zone.traffic || 'low';
  if (mode === 'health' && zone.signal === 'outage') return 'offline';
  if (mode === 'planning' || mode === 'asset') return 'neutral';
  return zone.signal || 'good';
}

function deviceTone(device, mode) {
  if (mode === 'traffic') {
    const color = loadColor(device.users, device.mbps, device.type);
    if (color === TRAFFIC.critical.color) return 'critical';
    if (color === TRAFFIC.high.color) return 'high';
    if (color === TRAFFIC.medium.color) return 'medium';
    return 'low';
  }
  if (mode === 'asset') return assetState(device);
  return device.status || 'online';
}

function legendTone(label, mode) {
  const source = mode === 'traffic' ? TRAFFIC
    : mode === 'health' ? HEALTH
      : mode === 'asset' ? ASSET
        : mode === 'signal' || mode === 'planning' ? SIGNAL
          : {};
  const entry = Object.entries(source).find(([, value]) => value.label === label);
  if (entry) return entry[0];
  if (mode === 'cabling') return /光纖/.test(label) ? 'fiber' : 'cat6';
  return 'neutral';
}

function buildingLevelSummary(building) {
  return building.basements ? `B1 + ${building.floors}F` : `${building.floors}F`;
}

function entitySubtitle(entity) {
  if (!entity) return '';
  if (entity.type === 'ap' || entity.type === 'switch' || entity.type === 'server') return `${HEALTH[entity.status].label} · ${entity.users} users · ${entity.mbps} Mbps`;
  if (entity.signal) return `${SIGNAL[entity.signal].label} · ${entity.users} users · ${entity.mbps} Mbps`;
  if (entity.floors) return `${buildingLevelSummary(entity)} · ${buildingStatus(entity.id) === 'online' ? '設備正常' : HEALTH[buildingStatus(entity.id)].label}`;
  return '';
}

function DetailPanel({ entity, selectedFloor, selectedRoom, selectedId, mode, onFloorSelect, onRoomSelect, onSelectDevice }) {
  if (!entity) return null;

  const isDevice = entity.type === 'ap' || entity.type === 'switch' || entity.type === 'server';
  const isZone = Boolean(entity.signal);
  const colorTone = isDevice ? deviceTone(entity, 'health') : isZone ? zoneTone(entity, 'signal') : 'neutral';
  const deviceLink = isDevice ? getNetworkLinkForDevice(entity.id) : null;

  return (
    <section className="detail-panel">
      <div className="detail-heading">
        <span className={toneClass('detail-dot', colorTone)} />
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
            <Detail label="頻道 / IP" value={entity.channel || entity.ip || '-'} wide />
            {entity.ip ? <Detail label="管理 IP" value={entity.ip} /> : null}
            {entity.model ? <Detail label="型號" value={entity.model} /> : null}
            {entity.role ? <Detail label="角色" value={entity.role} wide /> : null}
            {entity.room ? <Detail label="空間" value={entity.room} /> : null}
            {entity.placement ? <Detail label="放置" value={placementLabel(entity.placement)} /> : null}
            {entity.location ? <Detail label="位置" value={entity.location} wide /> : null}
          </div>
          <AssetInfoCard device={entity} />
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
          <FloorPicker building={entity} selectedFloor={selectedFloor} onFloorSelect={onFloorSelect} />
          <RoomStack building={entity} selectedFloor={selectedFloor} selectedRoom={selectedRoom} onFloorSelect={onFloorSelect} onRoomSelect={onRoomSelect} />
          <AreaDevicePanel building={entity} selectedFloor={selectedFloor} selectedRoom={selectedRoom} selectedId={selectedId} mode={mode} onSelectDevice={onSelectDevice} />
        </>
      ) : null}
    </section>
  );
}


function AreaDevicePanel({ building, selectedFloor, selectedRoom, selectedId, mode, onSelectDevice }) {
  const floor = Math.max(1, Number(selectedFloor) || Number(building?.floors) || 1);
  const room = selectedRoom?.buildingId === building.id && selectedRoom.floor === floor ? selectedRoom.room : null;
  const scopedDevices = getAreaDevices(building.id, floor, room);
  const title = room ? floor + 'F · ' + room : floor + 'F 全樓層';
  const summary = areaDeviceSummary(scopedDevices);

  return (
    <section className="area-device-panel" aria-label="區域設備清單">
      <div className="area-device-head">
        <span>
          <Cpu size={15} />
          <strong>{title}</strong>
        </span>
        <small>{summary}</small>
        {scopedDevices.length ? (
          <button
            type="button"
            className="area-export-btn"
            title="匯出此範圍的資產清單 CSV"
            onClick={() => exportAreaAssetCsv(building, floor, room, scopedDevices)}
          >
            <Download size={13} />
            <span>匯出清單</span>
          </button>
        ) : null}
      </div>
      {scopedDevices.length ? (
        <div className="area-device-list">
          {scopedDevices.map((device) => (
            <DeviceRow
              device={device}
              key={device.id}
              mode={mode}
              selected={selectedId === device.id}
              onSelect={onSelectDevice}
            />
          ))}
        </div>
      ) : (
        <p className="area-device-empty">此範圍尚無設備資料。</p>
      )}
    </section>
  );
}

function exportAreaAssetCsv(building, floor, room, deviceList = []) {
  const BOM = "\uFEFF";
  const headers = ['財產編號', '設備ID', '名稱', '類型', '建築', '樓層', '空間', '廠牌', '型號', '序號', '採購日期', '保固到期', '資產狀態', '經費來源', '保管人', '連線狀態'];
  const typeLabel = (type) => (type === 'ap' ? 'AP' : type === 'switch' ? '交換器' : type === 'server' ? '伺服器' : type || '-');
  const escapeCell = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = deviceList.map((device) => [
    device.assetTag, device.id, device.name, typeLabel(device.type), building.name,
    device.floor || `${floor}F`, device.room || device.location || '', device.vendor, device.model,
    device.serialNumber, device.purchaseDate, device.warrantyUntil, ASSET[assetState(device)].label,
    device.fundingSource, device.custodian, HEALTH[device.status]?.label || device.status || '',
  ]);
  const csv = BOM + [headers, ...rows].map((cells) => cells.map(escapeCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${building.name}-${floor}F${room ? `-${room}` : ''}-資產清單.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getAreaDevices(buildingId, floor, room = null) {
  return devices
    .filter((device) => device.building === buildingId)
    .filter((device) => parseDeviceFloor(device.floor) === floor)
    .filter((device) => !room || deviceMatchesRoom(device, room));
}

function areaDeviceSummary(deviceList = []) {
  if (!deviceList.length) return '0 台';
  const counts = deviceList.reduce((acc, device) => {
    acc[device.type] = (acc[device.type] || 0) + 1;
    if (device.status !== 'online') acc.alerts += 1;
    return acc;
  }, { ap: 0, switch: 0, server: 0, alerts: 0 });
  const parts = [
    counts.ap ? counts.ap + ' AP' : '',
    counts.switch ? counts.switch + ' 交換器' : '',
    counts.server ? counts.server + ' 伺服器' : '',
  ].filter(Boolean);
  if (counts.alerts) parts.push(counts.alerts + ' 告警');
  return parts.length ? parts.join(' · ') : deviceList.length + ' 台';
}

function roomDeviceCount(buildingId, floor, room) {
  return getAreaDevices(buildingId, floor, room).length;
}

function DeviceGroupList({ groups, mode, openState, selectedId, onToggle, onSelect }) {
  return (
    <div className="device-group-list">
      {groups.map((group) => (
        <div className={`device-group tone-${group.tone}`} key={group.id}>
          <button className="device-group-head" type="button" onClick={() => onToggle(group.id)}>
            <span className="device-group-title">
              <DeviceGroupIcon id={group.id} />
              <strong>{group.label}</strong>
            </span>
            <span className="device-group-meta">{deviceGroupMeta(group.devices)}</span>
            <ChevronDown className={`device-group-chevron ${openState[group.id] ? 'is-open' : ''}`} size={15} />
          </button>
          {openState[group.id] ? (
            <div className="device-list device-group-body">
              {group.devices.map((device) => (
                <DeviceRow
                  device={device}
                  key={device.id}
                  mode={mode}
                  selected={selectedId === device.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DeviceRow({ device, mode, selected, onSelect }) {
  return (
    <button
      className={`device-row ${selected ? 'is-active' : ''} ${device.status !== 'online' ? 'has-alert' : ''}`}
      type="button"
      onClick={() => onSelect(device)}
    >
      <span className={toneClass('device-icon', deviceTone(device, mode))}>
        <DeviceTypeIcon type={device.type} />
      </span>
      <span className="device-copy">
        <strong>{device.name}</strong>
        <small>{device.floor} · {device.room || device.location || '-'} · {device.id}</small>
      </span>
      <span className="device-load">{deviceListBadge(device)}</span>
    </button>
  );
}

function deviceListBadge(device) {
  if (device.type === 'ap') return `${device.users || 0} 人`;
  if (device.type === 'switch') return `${device.mbps || 0} Mbps`;
  if (device.type === 'server') return HEALTH[device.status]?.label || device.status || '-';
  return device.users ? `${device.users} 人` : HEALTH[device.status]?.label || '-';
}
function DeviceTypeIcon({ type }) {
  if (type === 'ap') return <Wifi size={15} />;
  if (type === 'switch') return <Cpu size={15} />;
  if (type === 'server') return <Server size={15} />;
  return <Activity size={15} />;
}

function DeviceGroupIcon({ id }) {
  if (id === 'alerts') return <AlertTriangle size={15} />;
  if (id === 'ap') return <Wifi size={15} />;
  if (id === 'switch') return <Cpu size={15} />;
  if (id === 'server') return <Server size={15} />;
  return <Activity size={15} />;
}

function createDeviceGroups(deviceList = []) {
  const alerts = deviceList.filter((device) => device.status !== 'online');
  const groups = [
    { id: 'alerts', label: '告警設備', tone: 'alert', devices: alerts },
    { id: 'ap', label: 'AP', tone: 'ap', devices: deviceList.filter((device) => device.type === 'ap') },
    { id: 'switch', label: '交換器', tone: 'switch', devices: deviceList.filter((device) => device.type === 'switch') },
    { id: 'server', label: '伺服器', tone: 'server', devices: deviceList.filter((device) => device.type === 'server') },
    { id: 'other', label: '其他設備', tone: 'other', devices: deviceList.filter((device) => !['ap', 'switch', 'server'].includes(device.type)) },
  ];
  return groups.filter((group) => group.devices.length > 0);
}

function deviceGroupMeta(deviceList = []) {
  const alertCount = deviceList.filter((device) => device.status !== 'online').length;
  return `${deviceList.length} 台${alertCount ? ` · ${alertCount} 告警` : ''}`;
}
function AssetInfoCard({ device }) {
  if (!deviceHasAssetData(device)) return null;
  const state = assetState(device);
  return (
    <div className="asset-card">
      <div className="asset-card-title">
        <ClipboardList size={15} />
        <span>資產資料</span>
        <b className={toneClass('asset-state-label', state)}>{ASSET[state].label}</b>
      </div>
      <div className="detail-grid">
        <Detail label="財產編號" value={device.assetTag || '-'} />
        <Detail label="序號" value={device.serialNumber || '-'} />
        <Detail label="廠牌" value={device.vendor || '-'} />
        <Detail label="採購日期" value={device.purchaseDate || '-'} />
        <Detail label="保固到期" value={device.warrantyUntil || '-'} />
        <Detail label="經費來源" value={device.fundingSource || '-'} />
        <Detail label="保管人" value={device.custodian || '-'} />
        <Detail label="使用狀態" value={device.lifecycleStatus || '使用中'} />
      </div>
    </div>
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

function placementLabel(placement) {
  if (/room|center|inside|middle/i.test(String(placement))) return '教室/空間中心';
  if (/corridor|edge|tray|wall/i.test(String(placement))) return '走廊/線槽邊';
  return placement || '-';
}

function getNetworkLinkForDevice(deviceId) {
  return networkLinks.find((link) => link.deviceId === deviceId) || null;
}

function FloorPicker({ building, selectedFloor, onFloorSelect }) {
  const floors = Math.max(1, Number(building?.floors) || 1);
  const floorList = Array.from({ length: floors }, (_, index) => floors - index);

  return (
    <div className="floor-picker" aria-label="選擇樓層">
      {floorList.map((floor) => (
        <button
          className={`floor-pill ${selectedFloor === floor ? 'is-active' : ''}`}
          type="button"
          key={floor}
          onClick={() => onFloorSelect?.(floor)}
        >
          {floor}F
        </button>
      ))}
    </div>
  );
}

function RoomStack({ building, selectedFloor, selectedRoom, onFloorSelect, onRoomSelect }) {
  if (!building.rooms) return null;
  return (
    <div className="room-stack">
      {Object.entries(building.rooms)
        .map(([floor, rooms]) => [Number(floor), rooms])
        .sort(([a], [b]) => b - a)
        .map(([floor, rooms]) => {
          const isActiveFloor = selectedFloor === floor;
          const floorDevices = getAreaDevices(building.id, floor);
          return (
            <div className={'room-row ' + (isActiveFloor ? 'is-active' : '')} key={floor}>
              <button className="room-floor-btn" type="button" onClick={() => onFloorSelect?.(floor)}>
                <span>{floor}F</span>
                <p>{rooms.join(' · ')}</p>
                <small>{areaDeviceSummary(floorDevices)}</small>
              </button>
              {isActiveFloor ? (
                <div className="room-chip-grid">
                  {rooms.map((room) => {
                    const isSelectedRoom = selectedRoom?.buildingId === building.id && selectedRoom.floor === floor && roomNamesMatch(selectedRoom.room, room);
                    const count = roomDeviceCount(building.id, floor, room);
                    return (
                      <button
                        className={'room-chip ' + (isSelectedRoom ? 'is-active' : '')}
                        type="button"
                        key={room}
                        onClick={() => onRoomSelect?.(floor, room)}
                      >
                        <span>{room}</span>
                        <small>{count} 台</small>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
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

function Metric({ label, value, tone, onClick }) {
  if (onClick) {
    return (
      <button type="button" className={`metric-card tone-${tone} is-clickable`} title="點擊逐一巡視" onClick={onClick}>
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  }
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
        : mode === 'asset'
          ? Object.values(ASSET)
          : Object.values(SIGNAL);
  const title = mode === 'traffic'
    ? '流量顏色'
    : mode === 'health'
      ? '設備顏色'
      : mode === 'cabling'
        ? '線路圖例'
        : mode === 'asset'
          ? '資產狀態'
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
            <i className={toneClass('legend-dot', legendTone(item.label, mode))} />
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
          <option value="openrouter">OpenRouter（多模型）</option>
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
