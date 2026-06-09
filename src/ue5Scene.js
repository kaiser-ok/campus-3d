const DEFAULT_UNREAL_UNITS_PER_CAMPUS_UNIT = 100;
const DEFAULT_FLOOR_HEIGHT_CM = 255;

const STATUS_MATERIALS = {
  online: { token: 'normal', color: '#b9f6ca', label: '正常' },
  warning: { token: 'minor_alert', color: '#ffe08a', label: '警告' },
  offline: { token: 'critical_alert', color: '#ff8a80', label: '故障' },
};

const SIGNAL_MATERIALS = {
  good: { token: 'signal_good', color: '#93e6c3', label: '良好' },
  fair: { token: 'signal_fair', color: '#f7d56f', label: '偏弱' },
  poor: { token: 'signal_poor', color: '#fb8b4b', label: '訊號差' },
  outage: { token: 'signal_outage', color: '#ef5a63', label: '斷線區' },
};

export function createUe5Scene(school, options = {}) {
  const unitsPerCampusUnit = options.unrealUnitsPerCampusUnit || DEFAULT_UNREAL_UNITS_PER_CAMPUS_UNIT;
  const floorHeightCm = options.floorHeightCm || DEFAULT_FLOOR_HEIGHT_CM;
  const buildingList = normalizeArray(school?.buildings);
  const deviceList = normalizeArray(school?.devices);
  const linkList = normalizeArray(school?.networkLinks);
  const heatZoneList = normalizeArray(school?.heatZones);
  const buildingById = new Map(buildingList.map((building) => [building.id, building]));

  const exportedBuildings = buildingList.map((building) => exportBuilding(building, {
    floorHeightCm,
    unitsPerCampusUnit,
    devices: deviceList.filter((device) => device.building === building.id),
  }));

  const exportedDevices = deviceList.map((device) => exportDevice(device, {
    floorHeightCm,
    unitsPerCampusUnit,
    building: buildingById.get(device.building),
  }));

  const exportedLinks = linkList.map((link, index) => exportNetworkLink(link, index));
  const exportedHeatZones = heatZoneList.map((zone) => exportHeatZone(zone, unitsPerCampusUnit));

  return {
    schema: 'campus-3d.ue5-scene',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      app: 'campus-3d',
      schoolId: school?.id || 'unknown',
      schoolName: school?.name || '未命名學校',
      planUrl: school?.planUrl || '',
      meta: school?.meta || {},
    },
    styleProfile: options.styleProfile || school?.styleProfile || school?.meta?.styleProfile || null,
    coordinateSystem: {
      web: {
        horizontalAxes: 'X/Z',
        verticalAxis: 'Y',
        unit: 'campus-unit',
      },
      unreal: {
        horizontalAxes: 'X/Y',
        verticalAxis: 'Z',
        unit: 'centimeter',
        conversion: {
          ueX: 'webX * unrealUnitsPerCampusUnit',
          ueY: 'webZ * unrealUnitsPerCampusUnit',
          ueZ: 'webY * unrealUnitsPerCampusUnit',
        },
      },
      unrealUnitsPerCampusUnit: unitsPerCampusUnit,
      floorHeightCm,
    },
    materials: {
      deviceStatus: STATUS_MATERIALS,
      signal: SIGNAL_MATERIALS,
      load: {
        normal: { color: '#b9f6ca', label: '正常' },
        high_sta_high_traffic: { color: '#ff8a3d', label: '高人數高流量' },
        minor_alert: { color: '#ffe08a', label: '次要告警' },
        critical_alert: { color: '#ff8a80', label: '嚴重告警' },
      },
      cabling: {
        fiber: { color: '#7c3aed', label: '光纖' },
        cat6: { color: '#f59e0b', label: 'Cat6 / PoE' },
      },
    },
    summary: summarizeScene(exportedBuildings, exportedDevices, exportedLinks, exportedHeatZones),
    buildings: exportedBuildings,
    devices: exportedDevices,
    networkLinks: exportedLinks,
    heatZones: exportedHeatZones,
  };
}

export function downloadUe5Scene(scene, filename = 'campus-scene.json') {
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportBuilding(building, context) {
  const floors = Math.max(1, Number(building.floors) || 1);
  const basements = Math.max(0, Number(building.basements) || 0);
  const heightCm = floors * context.floorHeightCm;
  const roomFloors = exportFloors(building, context);

  return {
    id: String(building.id),
    name: String(building.name || building.id),
    accent: building.accent || '#72808b',
    floors,
    basements,
    campus: {
      center: { x: number(building.x), z: number(building.z) },
      size: { w: number(building.w), d: number(building.d) },
    },
    unreal: {
      locationCm: toUnrealLocation(building.x, building.z, 0, context.unitsPerCampusUnit),
      dimensionsCm: {
        x: number(building.w) * context.unitsPerCampusUnit,
        y: number(building.d) * context.unitsPerCampusUnit,
        z: heightCm,
      },
    },
    floorsData: roomFloors,
    deviceIds: context.devices.map((device) => device.id),
  };
}

function exportFloors(building, context) {
  const result = [];
  const basements = Math.max(0, Number(building.basements) || 0);
  const floors = Math.max(1, Number(building.floors) || 1);

  for (let basement = basements; basement >= 1; basement -= 1) {
    result.push({
      id: `B${basement}`,
      label: `B${basement}`,
      level: -basement,
      elevationCm: -basement * context.floorHeightCm,
      rooms: [],
      corridor: exportCorridor(building, `B${basement}`, context),
    });
  }

  for (let floor = 1; floor <= floors; floor += 1) {
    result.push({
      id: `${floor}F`,
      label: `${floor}F`,
      level: floor,
      elevationCm: (floor - 1) * context.floorHeightCm,
      rooms: exportRooms(building, floor, context),
      corridor: exportCorridor(building, floor, context),
    });
  }

  return result;
}

function exportRooms(building, floor, context) {
  const rooms = normalizeArray(building.rooms?.[floor] || building.rooms?.[String(floor)]);
  if (!rooms.length) return [];

  const isWide = number(building.w) >= number(building.d);
  const span = isWide ? number(building.w) : number(building.d);
  const depth = isWide ? number(building.d) : number(building.w);
  const corridorDepth = Math.min(Math.max(depth * 0.22, 1.4), 2.4);
  const roomDepth = Math.max(1, depth - corridorDepth);
  const segment = span / rooms.length;
  const yCm = (floor - 1) * context.floorHeightCm;

  return rooms.map((room, index) => {
    const offset = -span / 2 + segment * index + segment / 2;
    const centerX = isWide ? number(building.x) + offset : number(building.x) - roomDepth * 0.12;
    const centerZ = isWide ? number(building.z) - roomDepth * 0.12 : number(building.z) + offset;
    const sizeW = isWide ? segment * 0.92 : roomDepth;
    const sizeD = isWide ? roomDepth : segment * 0.92;
    return {
      id: `${building.id}-${floor}F-${sanitizeId(room)}`,
      name: String(room),
      floor: `${floor}F`,
      index,
      campus: {
        center: { x: round(centerX), z: round(centerZ) },
        size: { w: round(sizeW), d: round(sizeD) },
      },
      unreal: {
        locationCm: toUnrealLocation(centerX, centerZ, yCm / context.unitsPerCampusUnit, context.unitsPerCampusUnit),
        dimensionsCm: {
          x: round(sizeW * context.unitsPerCampusUnit),
          y: round(sizeD * context.unitsPerCampusUnit),
          z: context.floorHeightCm,
        },
      },
    };
  });
}

function exportCorridor(building, floor, context) {
  const level = typeof floor === 'number' ? floor : 1;
  const isWide = number(building.w) >= number(building.d);
  const depth = isWide ? number(building.d) : number(building.w);
  const corridorDepth = Math.min(Math.max(depth * 0.18, 1.2), 2.2);
  const centerX = isWide ? number(building.x) : number(building.x) + number(building.w) / 2 - corridorDepth / 2;
  const centerZ = isWide ? number(building.z) + number(building.d) / 2 - corridorDepth / 2 : number(building.z);
  const yCm = (level - 1) * context.floorHeightCm;

  return {
    id: `${building.id}-${floor}-corridor`,
    name: '走廊 / 線槽',
    campus: {
      center: { x: round(centerX), z: round(centerZ) },
      size: {
        w: round(isWide ? number(building.w) : corridorDepth),
        d: round(isWide ? corridorDepth : number(building.d)),
      },
    },
    unreal: {
      locationCm: toUnrealLocation(centerX, centerZ, yCm / context.unitsPerCampusUnit, context.unitsPerCampusUnit),
      dimensionsCm: {
        x: round((isWide ? number(building.w) : corridorDepth) * context.unitsPerCampusUnit),
        y: round((isWide ? corridorDepth : number(building.d)) * context.unitsPerCampusUnit),
        z: context.floorHeightCm,
      },
    },
  };
}

function exportDevice(device, context) {
  const floorLevel = parseDeviceFloor(device.floor);
  const yCm = Math.max(0, floorLevel - 1) * context.floorHeightCm + deviceHeightOffset(device.type);
  const loadClass = classifyDeviceLoad(device);
  const status = normalizeStatus(device.status);

  return {
    id: String(device.id),
    type: String(device.type || 'device'),
    name: String(device.name || device.id),
    role: device.role || '',
    vendor: device.vendor || '',
    model: device.model || '',
    ip: device.ip || '',
    mac: device.mac || '',
    buildingId: device.building || '',
    buildingName: context.building?.name || '',
    floor: device.floor || '',
    floorLevel,
    room: device.room || '',
    placement: device.placement || '',
    status,
    statusMaterial: STATUS_MATERIALS[status]?.token || 'normal',
    loadClass,
    users: Number(device.users) || 0,
    mbps: Number(device.mbps) || 0,
    channel: device.channel || '',
    campus: {
      location: { x: number(device.x), z: number(device.z) },
    },
    unreal: {
      locationCm: toUnrealLocation(device.x, device.z, yCm / context.unitsPerCampusUnit, context.unitsPerCampusUnit),
      labelHeightCm: yCm + 80,
    },
  };
}

function exportNetworkLink(link, index) {
  const medium = String(link.medium || 'cat6').toLowerCase() === 'fiber' ? 'fiber' : 'cat6';
  return {
    id: String(link.id || `net-${index}`),
    sourceDeviceId: String(link.switchId || ''),
    targetDeviceId: String(link.deviceId || ''),
    switchPort: link.switchPort || '',
    patchPanel: link.patchPanel || '',
    patchPort: link.patchPort || '',
    vlan: link.vlan || '',
    cableId: link.cableId || '',
    medium,
    materialToken: medium === 'fiber' ? 'fiber' : 'cat6',
    fiberCore: link.fiberCore || '',
    uplinkTo: link.uplinkTo || '',
    status: normalizeStatus(link.status),
    note: link.note || '',
  };
}

function exportHeatZone(zone, unitsPerCampusUnit) {
  const signal = zone.signal || 'good';
  return {
    id: String(zone.id),
    label: String(zone.label || zone.id),
    type: zone.type || 'rect',
    signal,
    traffic: zone.traffic || 'low',
    users: Number(zone.users) || 0,
    mbps: Number(zone.mbps) || 0,
    materialToken: SIGNAL_MATERIALS[signal]?.token || 'signal_good',
    note: zone.note || '',
    campus: {
      center: { x: number(zone.x), z: number(zone.z) },
      size: {
        w: number(zone.w || zone.rx || 1),
        d: number(zone.d || zone.rz || 1),
      },
    },
    unreal: {
      locationCm: toUnrealLocation(zone.x, zone.z, 5 / unitsPerCampusUnit, unitsPerCampusUnit),
      dimensionsCm: {
        x: number(zone.w || zone.rx || 1) * unitsPerCampusUnit,
        y: number(zone.d || zone.rz || 1) * unitsPerCampusUnit,
        z: 10,
      },
    },
  };
}

function summarizeScene(buildings, devices, links, heatZones) {
  return {
    buildings: buildings.length,
    floors: buildings.reduce((sum, building) => sum + building.floors + building.basements, 0),
    rooms: buildings.reduce((sum, building) => sum + building.floorsData.reduce((floorSum, floor) => floorSum + floor.rooms.length, 0), 0),
    devices: devices.length,
    aps: devices.filter((device) => device.type === 'ap').length,
    switches: devices.filter((device) => device.type === 'switch').length,
    servers: devices.filter((device) => device.type === 'server').length,
    alerts: devices.filter((device) => device.status !== 'online').length,
    networkLinks: links.length,
    heatZones: heatZones.length,
  };
}

function classifyDeviceLoad(device) {
  const status = normalizeStatus(device.status);
  if (status === 'offline') return 'critical_alert';
  if (Number(device.users) >= 30 && Number(device.mbps) >= 100) return 'high_sta_high_traffic';
  if (status === 'warning') return 'minor_alert';
  return 'normal';
}

function parseDeviceFloor(floor) {
  const value = String(floor || '').toUpperCase();
  const basement = value.match(/B(\d+)/);
  if (basement) return -Number(basement[1]);
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function deviceHeightOffset(type) {
  if (type === 'ap') return 210;
  if (type === 'switch') return 140;
  if (type === 'server') return 120;
  return 130;
}

function normalizeStatus(status) {
  const value = String(status || 'online').toLowerCase();
  if (/offline|down|故障|斷線/.test(value)) return 'offline';
  if (/warning|warn|alert|警告|異常/.test(value)) return 'warning';
  return 'online';
}

function toUnrealLocation(x, z, y = 0, unitsPerCampusUnit = DEFAULT_UNREAL_UNITS_PER_CAMPUS_UNIT) {
  return {
    x: round(number(x) * unitsPerCampusUnit),
    y: round(number(z) * unitsPerCampusUnit),
    z: round(number(y) * unitsPerCampusUnit),
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round(number(value) * 100) / 100;
}

function sanitizeId(value) {
  return String(value || 'room').trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]+/gu, '');
}
