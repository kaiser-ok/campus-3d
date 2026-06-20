// Style + build specification for the New Taipei Xikun Junior High School (溪崑國中)
// digital twin. This is an LLM-authored spec: real ground truth (official floor
// plans + gate photo) drives the structured description, which the UE5 loader /
// procedural build steps consume. Fields read by the C++ loader today:
//   globalStyle.exteriorPalette.{wall,roof,corridor,window}
//   proceduralRules.corridorsAndNetwork.{trayColor,cableTrayHeightCm,drawCorridorDecks}
//   buildingProfiles.*.visualRole
// Everything else is richer guidance for procedural placement and future passes.
const xikunStyleProfile = {
  id: 'xikun-jhs-style-profile',
  schoolId: 'xikun-jhs',
  schoolName: '新北市立溪崑國民中學',
  generatedFrom: [
    {
      type: 'official-floor-plan',
      title: '114學年度教室平面圖 (總務處編製)',
      url: 'https://www.ckjhs.ntpc.edu.tw/p/406-1000-9571,r169.php',
      localNote: '官方逐層教室平面圖；本案棟距、樓層數、各室機能的權威來源。',
      use: '五棟配置、各棟5層、每層房號與機能、中庭/前庭/後庭/川堂、操場與球場相對位置、方位(正門朝南)。',
    },
    {
      type: 'official-site',
      title: '新北市立溪崑國民中學校園網站',
      url: 'https://www.ckjhs.ntpc.edu.tw/',
      use: '校名、校內資源、資訊服務與圖書館等校園功能脈絡。',
    },
    {
      type: 'public-photo',
      title: '歡迎蒞臨溪崑國中校門照片',
      url: 'https://commons.wikimedia.org/wiki/File:%E6%AD%A1%E8%BF%8E%E8%92%9E%E8%87%A8%E6%BA%AA%E5%B4%91%E5%9C%8B%E4%B8%AD.jpg',
      localAsset: '/reference/xikun-gate-wikimedia.jpg',
      license: 'CC BY-SA 4.0',
      use: '校門、圍牆、電子跑馬燈、入口尺度與色彩參考(唯一可自由使用的實景照)。',
    },
    {
      type: 'map-service',
      title: 'Google Maps 衛星/街景 (校址: 板橋區大觀路三段50巷30號)',
      url: 'https://www.google.com/maps/search/新北市立溪崑國民中學',
      use: '屋頂俯視量體、棟距、操場與球場輪廓、立面樓層與開窗節奏的對照(非可重製素材, 僅供比對)。',
    },
  ],

  site: {
    type: 'urban public junior high school, New Taipei City',
    address: '新北市板橋區大觀路三段50巷30號',
    areaHectares: 3.97565,
    context: '大漢溪浮洲橋溪畔, 都會型, 緊臨樹林/新莊',
    orientation: { mainGate: 'south', sideGate: 'west', note: '正門朝南; 平面圖上方為操場與球場(校園北側)' },
    courtyardLayout: '五棟教學樓圍合中庭/前庭/後庭的合院式配置',
  },

  globalStyle: {
    description:
      '新北市都會型公立國中校園: 鋼筋混凝土長條校舍、平屋頂 + 女兒牆 + 不鏽鋼水塔、半戶外走廊與欄杆、連續橫向窗帶、地面層川堂穿堂、中庭動線, 屋頂常見冷氣室外機與電信機箱。',
    exteriorPalette: {
      wall: '#cfd7d8',
      secondaryWall: '#b7c3c6',
      roof: '#687782',
      corridor: '#d8c77a',
      rail: '#85979b',
      window: '#edf5f2',
      glassTint: '#8fb6c0',
      accent: '#2f8a83',
      gate: '#7f8b8e',
      track: '#b4533a',     // PU 跑道磚紅
      trackInfield: '#5e7d4f', // 草地/人工草
      court: '#3f6f8a',     // PU 球場藍綠
    },
    materialLanguage: [
      'light-gray painted concrete / 洗石子 walls',
      'dark gray flat-roof waterproofing with parapet (女兒牆)',
      'stainless-steel cylindrical rooftop water tanks (不鏽鋼水塔)',
      'repeating horizontal classroom window bands with aluminum frames',
      'semi-open corridor with painted steel railing on courtyard side',
      'ground-floor open breezeway (川堂) cutting through buildings',
      'visible utility conduits, AC condensers and network cable trays along corridors and roof',
      'simple raised school signage blocks and electronic marquee at the main gate',
    ],
    weathering: 'mild: rain streaks below window sills, slight roof staining, scuffed corridor floor; keep clean enough for a maintained public school.',
  },

  proceduralRules: {
    buildingShell: {
      floorsTypical: 5,
      floorHeightCm: 330,
      slabThicknessCm: 22,
      roofType: 'flat with parapet',
      parapetHeightCm: 70,
      roofOverhangCm: 55,
      bevelRadiusCm: 8,
      // X-ray viewing (loader ShellMaterial) — keep interiors readable.
      defaultTransparency: 0.18,
      focusedTransparency: 0.08,
      backgroundTransparency: 0.42,
      groundFloorBreezeway: true, // 川堂 at 1F for connector blocks (esp. C棟)
    },
    facade: {
      windowRowsPerFloor: 1,
      windowWidthCm: 180,
      windowHeightCm: 120,
      windowSillHeightCm: 95,
      windowSpacingCm: 60,
      windowFrame: 'aluminum, light',
      corridorSideHasOpenRail: true,
      railHeightCm: 110,
      stairCoreAtBuildingEnds: true,
      addRoomNamePlates: true,
    },
    roof: {
      addWaterTanks: true,        // 不鏽鋼水塔 — strong "real Taiwan school" cue
      waterTankPerBuilding: 2,
      waterTankRadiusCm: 110,
      waterTankHeightCm: 200,
      addAcCondensers: true,
      addParapet: true,
      addStairPenthouse: true,    // 屋突 (stair/elevator penthouse)
    },
    corridorsAndNetwork: {
      drawCorridorDecks: true,
      corridorColor: '#d8c77a',
      cableTrayHeightCm: 235,
      trayWidthCm: 38,
      trayColor: '#f59e0b',
      riserColor: '#2563eb',
      placeSwitchesOnCorridorSide: true,
      placeApsAtRoomCenterWhenRoomKnown: true,
      routeHorizontalLinksThroughCorridorTray: true,
      routeVerticalLinksThroughStairOrIdfRiser: true,
      showOnlyFocusedBuildingLinksWhenFocused: true,
    },
    labels: {
      preferWorldLockedBillboards: true,
      maxScreenScale: 1,
      buildingPrefixToHide: '建物',
      deviceLabelModeByDistance: { overview: 'icon-only', buildingFocus: 'short-name', floorFocus: 'name-and-port' },
    },
  },

  // Non-building site features to place for a believable campus (from the plan).
  siteFeatures: [
    { id: 'track', name: '操場 / PU跑道', location: 'campus north-west (large)', shape: 'rounded-rect 400m-style loop', material: 'track + trackInfield', props: ['lane lines', 'goal posts optional'] },
    { id: 'courts', name: '籃球場 / 排球場', location: 'campus north-east', shape: 'rectangular courts', material: 'court', props: ['hoops', 'net posts', 'painted lines'] },
    { id: 'flag-podium', name: '司令台', location: 'south edge of track facing infield', massing: 'low stage with canopy' },
    { id: 'kindergarten-play', name: '幼兒遊戲場', location: 'east near E棟', props: ['soft-surface', 'small play equipment', 'low fence'] },
    { id: 'courtyards', name: '中庭 / 前庭 / 後庭', location: 'enclosed by A/B/C/D buildings', props: ['planting beds', 'trees', 'covered walkway'] },
    { id: 'main-gate', name: '正門 + 警衛室', location: 'south, on 大觀路三段50巷', props: ['sliding gate', 'electronic marquee 跑馬燈', 'guard booth', 'low perimeter wall'] },
    { id: 'side-gate', name: '側門', location: 'west' },
    { id: 'principal-house', name: '校長宿舍', location: 'south-east corner' },
    { id: 'perimeter', name: '圍牆 + 行道樹', location: 'campus boundary', props: ['painted concrete wall', 'street trees'] },
  ],

  // Reusable props an LLM-driven build / loader can instance. Geometry is
  // primitive-friendly so it works even without a Megascans asset library.
  propLibrary: {
    rooftopWaterTank: { geom: 'cylinder', material: 'stainless steel', placement: 'on roof near stair penthouse' },
    acCondenser: { geom: 'box', material: 'painted metal', placement: 'corridor edge / roof / under windows' },
    corridorRail: { geom: 'box+posts', material: 'painted steel', placement: 'courtyard side of every floor' },
    stairPenthouse: { geom: 'box', material: 'wall', placement: 'building ends, above roof' },
    flagPole: { geom: 'thin cylinder', material: 'metal', placement: 'near 司令台 / gate' },
    tree: { geom: 'cone+cylinder (or foliage asset)', species: '榕樹/鳳凰木/樟樹', placement: 'courtyards, perimeter, path edges' },
    bench: { geom: 'box', placement: 'courtyards, corridor edges' },
    courtHoop: { geom: 'pole+board', placement: 'basketball court ends' },
    gateMarquee: { geom: 'box with emissive face', material: 'LED marquee', placement: 'main gate (from gate photo)' },
    roomNamePlate: { geom: 'small plane', placement: 'beside each room door, text = room function' },
  },

  buildingProfiles: {
    'xikun-a': {
      visualRole: 'admin + main classroom bar',
      name: '迎曦樓 A棟',
      floors: 5,
      position: 'south side, full width, along the main gate',
      massing: 'long horizontal bar with a central ground-floor 川堂 splitting admin wings',
      roof: { type: 'flat+parapet', waterTanks: 2, penthouse: true },
      corridorSide: 'north-facing inner campus side',
      roomFunctionSummary: '1F 行政(總務/學務/健康中心/生教組); 2F 教務/人事會計/教媒/多功能; 3F 導師辦公室(7/8/9導)+會客+班級; 4F 班級+8導辦+圖書二館; 5F 童軍/科技/學習扶助/教師社群教室',
      facadeHints: ['welcoming front facade + signage', 'central 川堂 opening', 'open corridor rail', 'stair cores near ends'],
      networkHints: ['admin floors have dense switch/AP (總務/教務/導辦); APs near room centers; trays follow corridor edge'],
    },
    'xikun-b': {
      visualRole: 'special education + classroom building',
      name: '德馨樓 B棟',
      floors: 5,
      position: 'west side, horizontal',
      massing: 'classroom block facing inner garden; lower floors house 特教/資源/知動/團輔',
      roof: { type: 'flat+parapet', waterTanks: 2, penthouse: true },
      corridorSide: 'inner courtyard side',
      roomFunctionSummary: '1F 特教班/特教辦公室/資源班/知動教室/生活起居室; 2F 團輔室+資源班+班級; 3-5F 普通班級(802-822)',
      facadeHints: ['ground-floor accessible / 特教 entrance', 'dense room sequence above', 'semi-open corridor'],
      networkHints: ['特教辦公室 B03 is a service node; resource-room APs branch from corridor switches'],
    },
    'xikun-c': {
      visualRole: 'information center + core services (IDF/MDF spine)',
      name: '凌雲樓 C棟 / 資訊中心',
      floors: 5,
      position: 'central, vertical orientation, connects 前庭/後庭',
      massing: 'narrow vertical bar; 1F is an OPEN BREEZEWAY (川堂走廊, no enclosed rooms); rooms start 2F',
      roof: { type: 'flat+parapet', waterTanks: 1, penthouse: true },
      corridorSide: 'long side facing campus interior',
      roomFunctionSummary: '1F 川堂(空); 2F 校長室/輔導處/資訊中心(C05機房)/教師會/高關班; 3-4F 課輔/族語/本土語教室+班級; 5F 班級+本土語',
      facadeHints: ['stronger technical identity', 'C05 資訊中心/機房 marked as MDF core', 'clear vertical riser spine', 'open 1F passage'],
      networkHints: ['core room C05 must be visually distinct (MDF)', 'fiber backbone + risers most prominent here', 'no devices on the open 1F'],
    },
    'xikun-d': {
      visualRole: 'specialist labs: science / music / computer / arts',
      name: '凱風樓 D棟',
      floors: 5,
      position: 'north-west, horizontal (north of B棟, facing operating field)',
      massing: 'lab/specialist bar with 準備室 between rooms and stair towers; larger equipment rooms',
      roof: { type: 'flat+parapet', waterTanks: 2, penthouse: true },
      corridorSide: 'inner campus / field side',
      roomFunctionSummary: '1F 視聽/童軍/樂活/合作社/體育專任; 2F 音樂教室一~四 + 電腦教室一 + 專任辦公室(D06-08); 3F 藝術與人文/自然/科技教室; 4F 電腦教室二~四/自然/雲端; 5F 家政/表藝/音樂五六/分組活動',
      facadeHints: ['larger lab/computer-room windows', '準備室 between paired rooms', 'visible cable trays for computer classrooms', 'AC condensers for labs'],
      networkHints: ['電腦教室(D22-24) are switch-dense lab distribution nodes', '自然教室 D17 has its own switch'],
    },
    'xikun-e': {
      visualRole: 'kindergarten / childcare + classroom building',
      name: '向陽樓 E棟',
      floors: 5,
      position: 'east side, vertical, next to 幼兒遊戲場',
      massing: 'linear side building; lower floors are 附幼/公托 (kindergarten), upper floors are 7th-grade classrooms',
      roof: { type: 'flat+parapet', waterTanks: 1, penthouse: true },
      corridorSide: 'campus-facing side',
      roomFunctionSummary: '1F 幼兒園辦公室/星星/月亮/小鴨班/烹調室; 2F 快樂屋/活力屋/彩虹/太陽班/資源教室; 3F (無標示); 4-5F 7年級教室(701-710)',
      facadeHints: ['colorful kindergarten lower floors', 'softer/lighter wall tone', 'edge planting + play yard adjacency', 'safety fencing at low floors'],
      networkHints: ['幼兒園/公托 APs E01-E10; upper-floor classroom APs E16-E25 each have edge switches'],
    },
    'xikun-library': {
      visualRole: 'library + multi-function hall',
      name: '圖書館 / 活動中心',
      floors: 2,
      position: 'central-north, between C棟 and E棟 (the large block)',
      massing: 'larger-span hall + library volume, taller clear height than classroom bars',
      roof: { type: 'flat+parapet, larger span', waterTanks: 1 },
      facadeHints: ['large quiet reading-room glazing', 'fewer/larger windows', 'landmark volume of the campus'],
      networkHints: ['fewer devices, quiet labels unless focused; hall APs placed high and central'],
    },
    'xikun-activity': {
      visualRole: 'activity center',
      name: '活動中心 / 多功能教室',
      floors: 2,
      massing: 'larger-span hall with taller roof volume',
      facadeHints: ['higher clear space', 'fewer windows', 'sport/assembly hall character'],
      networkHints: ['APs placed higher and more central for hall coverage'],
    },
    'xikun-guard': {
      visualRole: 'gatehouse',
      name: '警衛室 / 校門',
      floors: 1,
      massing: 'small entry control building at the south main gate',
      facadeHints: ['sliding gate + electronic marquee (跑馬燈, per gate photo)', 'low perimeter wall and entry canopy', 'guard booth'],
      networkHints: ['compact switch/AP near entry'],
    },
    'xikun-stand': {
      visualRole: 'assembly platform',
      name: '司令臺',
      floors: 1,
      massing: 'low stage with canopy facing the operating field / infield',
      facadeHints: ['low stage, flag poles nearby'],
      networkHints: ['outdoor AP/switch only when data exists'],
    },
  },

  // Ordered guidance for an LLM-driven / procedural UE build. The build assembles
  // from measured data + primitives/assets; it does NOT invent geometry the data
  // does not support.
  llmBuildInstructions: [
    '1. Footprints, floor counts and room functions are TRUTH from the official plan (buildings.json + xikunSchool.js). Never override them with invented geometry.',
    '2. Massing per building: extrude 5 floors at ~330cm; flat roof + parapet; add 2 rooftop stainless water tanks + a stair penthouse per teaching bar (1 for C/E/library).',
    '3. C棟 ground floor is an OPEN breezeway (川堂) — leave 1F unenclosed; rooms start at 2F.',
    '4. Facade: continuous horizontal window bands on the classroom side, semi-open railed corridor on the courtyard side, stair cores at building ends.',
    '5. Place site features from siteFeatures[]: PU track + infield (NW), basketball/volleyball courts (NE), 司令台, kindergarten play yard (E side), courtyards with trees, south main gate with marquee + guard booth + perimeter wall.',
    '6. Materials: light-gray concrete walls, dark flat roof, tinted glass, PU-red track, PU court; mild weathering. Use the exteriorPalette colors. Prefer real PBR/Megascans textures when available; fall back to tuned solid colors.',
    '7. Lighting: physical sun for New Taipei latitude (~25°N), afternoon angle; Lumen GI + reflections; volumetric clouds; manual/controlled exposure (no washout).',
    '8. Keep the result clearly a Taiwanese public junior high (courtyard bars + track + water tanks), not a generic office campus.',
    '9. Network operations stay readable: corridors, trays, risers, AP room centers, MDF (C05) and switch closets visually distinct; do not bury devices/labels under decoration.',
  ],

  // What this spec can and cannot drive (honesty for the digital-twin pipeline).
  fidelityNotes: {
    canDriveProcedurally: ['massing', 'floors', 'room partitions + functions', 'corridors/trays/risers', 'rooftop tanks/penthouse', 'site zones (track/courts/courtyards)', 'material colors', 'lighting + sky', 'device/AP/switch placement'],
    needsRealAssetsForPhotoreal: ['true facade/window/railing meshes (modular kit / Megascans)', 'photoreal textures + decals', 'trees/foliage assets', 'props (benches, hoops, vehicles)'],
    needsMeasuredCaptureForTrueTwin: ['exact building geometry + roof clutter (drone photogrammetry / LiDAR)', 'real signage and colors per building'],
  },
};

export default xikunStyleProfile;
