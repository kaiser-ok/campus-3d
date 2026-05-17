import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Activity,
  AlertTriangle,
  Building2,
  Eye,
  EyeOff,
  Gauge,
  Layers,
  Map,
  Maximize2,
  RotateCcw,
  Server,
  Users,
  Wifi,
} from 'lucide-react';

const CAMPUS = { width: 92, depth: 130 };

const MODES = [
  { id: 'health', label: '設備狀態', icon: Activity },
  { id: 'signal', label: '訊號熱區', icon: Wifi },
  { id: 'traffic', label: '用戶流量', icon: Gauge },
  { id: 'planning', label: '樓層規劃', icon: Layers },
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

const buildings = [
  {
    id: 'resource',
    name: '教學資源大樓',
    x: -31,
    z: -18,
    w: 13,
    d: 41,
    floors: 4,
    basements: 1,
    accent: '#617180',
    rooms: {
      1: ['健康中心', '創意教室'],
      2: ['205', '206', '207', '208'],
      3: ['302', '303', '304', '305'],
      4: ['美術', '209', '音樂', '電腦'],
    },
  },
  {
    id: 'fourth',
    name: '第四教學大樓',
    x: 32,
    z: -16,
    w: 12,
    d: 44,
    floors: 4,
    basements: 1,
    accent: '#687985',
    rooms: {
      1: ['117', '118', '115', '116'],
      2: ['217', '218', '輔導'],
      3: ['317', '318', '美術'],
      4: ['備課', '專科'],
    },
  },
  {
    id: 'third-second',
    name: '第二/三教學大樓',
    x: 5,
    z: 22,
    w: 48,
    d: 10,
    floors: 5,
    basements: 1,
    accent: '#72808b',
    rooms: {
      1: ['111', '112', '113', '114'],
      2: ['211', '212', '215', '216'],
      3: ['川廊', '215', '216'],
      4: ['213', '214', '313', '314'],
      5: ['311', '312', '315', '316'],
    },
  },
  {
    id: 'first',
    name: '第一教學大樓',
    x: 38,
    z: 43,
    w: 13,
    d: 32,
    floors: 5,
    basements: 1,
    accent: '#697987',
    rooms: {
      1: ['學習1', '物理'],
      2: ['會議', '資訊'],
      3: ['數位', '星空'],
      4: ['表藝', '語言'],
      5: ['檔案', '地理'],
    },
  },
  {
    id: 'comprehensive',
    name: '綜合教學大樓',
    x: -34,
    z: 29,
    w: 30,
    d: 8,
    floors: 4,
    accent: '#737c88',
    rooms: {
      1: ['教官室', '學輔'],
      2: ['辦公室', '諮商'],
      3: ['生物', '導辦'],
      4: ['化學', '探索'],
    },
  },
  {
    id: 'activity',
    name: '活動中心',
    x: -35,
    z: 42,
    w: 17,
    d: 17,
    floors: 2,
    accent: '#8a7b67',
    rooms: {
      1: ['活動中心'],
      2: ['體育館'],
    },
  },
  {
    id: 'ai',
    name: 'AI中心',
    x: -14,
    z: 50,
    w: 10,
    d: 34,
    floors: 5,
    basements: 1,
    accent: '#64798a',
    rooms: {
      1: ['110', '101'],
      2: ['103', '102'],
      3: ['310'],
      4: ['204', '203'],
      5: ['109'],
    },
  },
  {
    id: 'administration',
    name: '行政大樓',
    x: 7,
    z: 52,
    w: 40,
    d: 11,
    floors: 5,
    basements: 1,
    accent: '#667983',
    rooms: {
      1: ['OK便利店', '多元展示'],
      2: ['教務處', '研究發展'],
      3: ['校長室', '秘書室'],
      4: ['會議室', '日本體驗'],
      5: ['第五會議室', '繪畫教室'],
    },
  },
];

const heatZones = [
  {
    id: 'zone-fourth-north',
    type: 'rect',
    label: '第四教學大樓北側',
    x: 31,
    z: -24,
    w: 17,
    d: 18,
    signal: 'outage',
    traffic: 'medium',
    users: 42,
    mbps: 318,
    note: 'AP-4F-02 離線，2F 與 3F 北側教室覆蓋不足。',
  },
  {
    id: 'zone-court-corridor',
    type: 'circle',
    label: '排球場與川廊',
    x: 1,
    z: -13,
    rx: 24,
    rz: 31,
    signal: 'fair',
    traffic: 'critical',
    users: 128,
    mbps: 920,
    note: '戶外活動時用戶集中，建議新增戶外 AP 或調整頻道。',
  },
  {
    id: 'zone-resource-west',
    type: 'rect',
    label: '教學資源大樓西側',
    x: -34,
    z: -9,
    w: 18,
    d: 22,
    signal: 'poor',
    traffic: 'high',
    users: 78,
    mbps: 602,
    note: '牆體遮蔽與跨樓層漫遊造成訊號不穩。',
  },
  {
    id: 'zone-admin',
    type: 'rect',
    label: '行政大樓南側',
    x: 12,
    z: 52,
    w: 35,
    d: 15,
    signal: 'good',
    traffic: 'low',
    users: 19,
    mbps: 104,
    note: '目前訊號與容量都在正常範圍。',
  },
  {
    id: 'zone-first-lab',
    type: 'rect',
    label: '第一教學大樓實驗室',
    x: 39,
    z: 38,
    w: 15,
    d: 20,
    signal: 'fair',
    traffic: 'high',
    users: 86,
    mbps: 711,
    note: '實驗課時流量偏高，建議觀察尖峰 5GHz/6GHz 使用率。',
  },
];

const devices = [
  {
    id: 'AP-RS-01',
    type: 'ap',
    name: '教學資源 3F AP',
    building: 'resource',
    x: -31,
    z: -14,
    floor: '3F',
    status: 'online',
    users: 26,
    mbps: 146,
    channel: '5GHz ch44',
  },
  {
    id: 'AP-RS-02',
    type: 'ap',
    name: '教學資源 2F 西側 AP',
    building: 'resource',
    x: -36,
    z: 0,
    floor: '2F',
    status: 'warning',
    users: 58,
    mbps: 388,
    channel: '5GHz ch149',
  },
  {
    id: 'AP-4F-02',
    type: 'ap',
    name: '第四教學大樓北側 AP',
    building: 'fourth',
    x: 32,
    z: -27,
    floor: '2F',
    status: 'offline',
    users: 0,
    mbps: 0,
    channel: '離線',
  },
  {
    id: 'SW-4F-MDF',
    type: 'switch',
    name: '第四教學 MDF switch',
    building: 'fourth',
    x: 29,
    z: -8,
    floor: '1F',
    status: 'warning',
    users: 118,
    mbps: 760,
    channel: 'uplink 78%',
  },
  {
    id: 'AP-GYM-01',
    type: 'ap',
    name: '排球場戶外 AP',
    building: 'outdoor',
    x: -1,
    z: -12,
    floor: '戶外',
    status: 'online',
    users: 102,
    mbps: 870,
    channel: '5GHz ch100',
  },
  {
    id: 'AP-ADM-01',
    type: 'ap',
    name: '行政大樓 AP',
    building: 'administration',
    x: 6,
    z: 51,
    floor: '3F',
    status: 'online',
    users: 19,
    mbps: 104,
    channel: '5GHz ch36',
  },
  {
    id: 'SW-MAIN-CORE',
    type: 'switch',
    name: '核心交換器',
    building: 'ai',
    x: -14,
    z: 47,
    floor: 'B1',
    status: 'online',
    users: 214,
    mbps: 1240,
    channel: 'core 42%',
  },
  {
    id: 'AP-1F-LAB',
    type: 'ap',
    name: '第一教學實驗室 AP',
    building: 'first',
    x: 39,
    z: 39,
    floor: '4F',
    status: 'warning',
    users: 86,
    mbps: 711,
    channel: '5GHz ch157',
  },
];

function App() {
  const [mode, setMode] = useState('signal');
  const [showPlan, setShowPlan] = useState(true);
  const [showDevices, setShowDevices] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [heightScale, setHeightScale] = useState(1);
  const [selectedEntity, setSelectedEntity] = useState(heatZones[0]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const [cameraPreset, setCameraPreset] = useState({ name: 'home', tick: 0 });

  const metrics = useMemo(() => {
    const offline = devices.filter((device) => device.status === 'offline').length;
    const warning = devices.filter((device) => device.status === 'warning').length;
    const online = devices.filter((device) => device.status === 'online').length;
    const issueZones = heatZones.filter((zone) => zone.signal === 'poor' || zone.signal === 'outage').length;
    const highTraffic = heatZones.filter((zone) => zone.traffic === 'high' || zone.traffic === 'critical').length;
    return { online, warning, offline, issueZones, highTraffic };
  }, []);
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
            <Map size={18} />
          </button>
          <button className="icon-button" type="button" title="東側透視" onClick={() => setCameraPreset({ name: 'east', tick: Date.now() })}>
            <Maximize2 size={18} />
          </button>
          <button className={`icon-button ${showPlan ? 'is-active' : ''}`} type="button" title="底圖" onClick={() => setShowPlan((value) => !value)}>
            {showPlan ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>

        <CampusScene
          mode={mode}
          showPlan={showPlan}
          showDevices={showDevices}
          showHeatmap={showHeatmap}
          heightScale={heightScale}
          selectedEntity={selectedEntity}
          selectedId={selectedEntity?.id}
          selectedFloor={selectedFloor}
          cameraPreset={cameraPreset}
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
          <div>
            <p className="eyebrow">Shou Shan HS</p>
            <h1>WiFi 3D 監控圖</h1>
          </div>
          <span className="live-badge">Live Demo</span>
        </header>

        <section className="metric-grid" aria-label="監控摘要">
          <Metric label="正常設備" value={metrics.online} tone="green" />
          <Metric label="警告設備" value={metrics.warning} tone="amber" />
          <Metric label="故障設備" value={metrics.offline} tone="red" />
          <Metric label="問題區域" value={metrics.issueZones + metrics.highTraffic} tone="orange" />
        </section>

        <section className="panel-section">
          <div className="section-title">
            <Building2 size={17} />
            <h2>圖層</h2>
          </div>
          <div className="toggle-grid">
            <Toggle checked={showDevices} label="AP / switch" onChange={setShowDevices} />
            <Toggle checked={showHeatmap} label="熱區" onChange={setShowHeatmap} />
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

        <Legend mode={mode} />
      </aside>
    </main>
  );
}

function CampusScene({
  mode,
  showPlan,
  showDevices,
  showHeatmap,
  heightScale,
  selectedEntity,
  selectedId,
  selectedFloor,
  cameraPreset,
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

    const animate = () => {
      controls.update();
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

    addGround(content, showPlan);
    addCampusFeatures(content);

    if (showHeatmap) {
      heatZones.forEach((zone) => addHeatZone(content, zone, mode, selectedId, interactiveRef.current));
    }

    const activeBuildingId = getActiveBuildingId(selectedId);
    buildings.forEach((building) => addBuilding(content, building, mode, heightScale, selectedId, activeBuildingId, showDevices, selectedFloor, interactiveRef.current));

    if (showDevices) {
      devices.forEach((device) => addDevice(content, device, mode, selectedId, heightScale, interactiveRef.current));
    }

    scene.add(content);
    contentRef.current = content;
  }, [mode, showPlan, showDevices, showHeatmap, heightScale, selectedId, selectedFloor]);

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

    const handleMove = (event) => pick(event, false);
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

  return <canvas ref={canvasRef} className="campus-canvas" aria-label="壽山高中 3D 校園 WiFi 監控場景" />;
}

function addGround(group, showPlan) {
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
    new THREE.TextureLoader().load('/school-plan.jpg', (texture) => {
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
  const xray = showDevices;
  const floorHeight = 1.85;
  const h = Math.max(2.7, building.floors * floorHeight * heightScale);
  const color = mode === 'health' && status !== 'online' ? HEALTH[status].color : '#d8dee2';
  const bodyOpacity = xray ? (isActive ? 0.42 : 0.56) : 1;
  const roofOpacity = xray ? (isActive ? 0.58 : 0.7) : 1;
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

  addFloorStructure(group, building, floorHeight * heightScale, h, isActive || mode === 'planning', highlightedFloor);
  addRoomLabels(group, building, floorHeight * heightScale, isActive || mode === 'planning', interactive, highlightedFloor, isActive);
  if (isActive) addRoofDashboard(group, building, h, highlightedFloor, status);
  if (isActive) addBuildingFocusFrame(group, building, h);
  group.add(createLabel(building.name, [building.x, h + 2.2, building.z], [Math.min(13, building.w + 3), 2.5, 1], '#1f3138'));
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
        <div className="detail-grid">
          <Detail label="狀態" value={HEALTH[entity.status].label} />
          <Detail label="樓層" value={entity.floor} />
          <Detail label="用戶" value={entity.users} />
          <Detail label="流量" value={`${entity.mbps} Mbps`} />
          <Detail label="頻道" value={entity.channel} wide />
        </div>
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
      : Object.values(SIGNAL);
  return (
    <section className="legend-panel">
      <div className="section-title">
        <Users size={17} />
        <h2>{mode === 'traffic' ? '流量顏色' : mode === 'health' ? '設備顏色' : '訊號顏色'}</h2>
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

export default App;
