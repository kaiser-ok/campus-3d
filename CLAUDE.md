# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

**School WiFi 3D Campus Map** is a React + Three.js web app for visualizing school WiFi infrastructure on a 3D campus map. It supports:

- 3D building/floor visualization over a 2D floor-plan image.
- AP and switch status markers with health, traffic, and fault colors.
- WiFi signal/traffic heat zones.
- Multi-school import, edit, delete, and reimport flows.
- AI-assisted floor-plan analysis from JPG/PNG/PDF.
- Physical cabling visualization for corridor trays, risers, fiber uplinks, Cat6 drops, switch ports, patch panels, VLANs, cable labels, and sample network records.

The UI text is Traditional Chinese. Keep new visible UI labels in Traditional Chinese unless the surrounding UI is clearly technical English.

## Build & Development Commands

```bash
npm run dev                  # Start Vite dev server, normally http://localhost:5173/
npm run build                # Create optimized production build in dist/
npm run preview              # Preview production build locally
node scripts/verify-visual.mjs  # Playwright visual smoke test, requires dev server
```

The project uses ES modules (`"type": "module"`).

If port `5173` is already in use, Vite may choose another port. The verification script defaults to `http://127.0.0.1:5173/`; override it when needed:

```bash
VERIFY_URL=http://127.0.0.1:5174/ node scripts/verify-visual.mjs
```

## Key Files

- `src/App.jsx`: Main app, Three.js scene, school management UI, editor modal, physical cabling layer, network link import, detail panels, AI network-analysis panel.
- `src/ImportWizard.jsx`: Floor-plan import wizard, PDF-to-image conversion, AI building detection, JSON repair, draggable/resizable preview boxes, final import preview.
- `src/data/buildings.json`: Default school building footprints, floors, basements, accents, and room labels.
- `src/data/devices.json`: Default AP/switch inventory and demo metrics.
- `src/data/heatZones.json`: Default signal and traffic heat zones.
- `src/styles.css`: All layout, sidebar, 3D tool, editor, import wizard, network path, and responsive styles.
- `vite.config.js`: Vite config plus local AI proxy endpoints.
- `scripts/verify-visual.mjs`: Headless visual verification across desktop and mobile viewports.
- `WORKLOG.md`: User-facing development log in Traditional Chinese.

## Architecture

### App State

`App` owns the current visualization state:

- `mode`: one of `health`, `signal`, `traffic`, `planning`, `cabling`.
- Layer toggles: plan image, AP/switch, heatmap, cabling.
- Current school selection and localStorage-backed school list.
- Selected entity and selected floor.
- Current plan image URL.
- Network import messages and errors.

The app still uses module-level mutable arrays (`buildings`, `devices`, `heatZones`, `networkLinks`) to feed the Three.js scene. When changing school data, update these arrays, update React state, call `saveSchools`, and bump `sceneVersion` so the scene redraws.

### Three.js Scene

`CampusScene` manages:

- WebGL renderer, camera, OrbitControls, lights, fog, ground plane, and plan texture.
- `contentRef` for disposable scene geometry.
- `interactiveRef` for raycastable buildings, rooms, devices, heat zones, labels, and cabling elements.
- Click/hover selection through `THREE.Raycaster`.
- Keyboard camera controls for WASD/arrow orbit, Q/E zoom, and IJKL pan-like movement.

Scene redraw is handled in a React effect depending on mode, layer toggles, height scale, selection, scene version, plan URL, and default-campus feature visibility.

### School Import And Editing

`ImportWizard` supports:

- JPG/PNG upload.
- PDF upload through `pdfjs-dist` first-page rendering.
- AI-assisted building detection through `/api/analyze-image`.
- Defensive JSON parsing and repair for imperfect model output.
- Filtering common non-building items such as courts, roads, gates, and parking.
- Dragging/resizing AI-detected building boxes before applying.
- Auto-tightening boxes to visible image content.
- Final preview before applying the school to the main scene.

`SchoolEditor` supports editing imported schools:

- School name.
- Base image replacement.
- Building name, color, floors, basements, X/Z position, W/D size, and room labels.
- Dragging/resizing building boxes over the current base image.
- Adding/removing buildings.

Imported schools are stored in localStorage under `campus3d_schools`; images are stored per school under `campus3d_img_<schoolId>`.

## Data Model

### Building

```js
{
  id, name,
  x, z, w, d,
  floors,
  basements,
  accent,
  rooms: { "1": ["101", "102"] }
}
```

`x/z/w/d` are scene-space campus coordinates, not image pixels. `sanitizeSceneBuildings` normalizes sizes and reduces significant overlaps.

### Device

```js
{
  id,
  type: "ap" | "switch",
  name,
  building,
  x, z,
  floor,
  status: "online" | "warning" | "offline",
  users,
  mbps,
  channel
}
```

Devices inside buildings are rendered at floor height and projected slightly outside the nearest facade so they remain visible through the X-ray building shell.

### Heat Zone

```js
{
  id, label,
  x, z,
  w, d,          // or rx/rz for circles
  signal,
  traffic,
  users,
  mbps,
  note
}
```

### Network Link

`networkLinks` maps AP/switch inventory to physical infrastructure:

```js
{
  id,
  deviceId,
  switchId,
  switchPort,
  patchPanel,
  patchPort,
  vlan,
  cableId,
  medium: "cat6" | "fiber",
  fiberCore,
  uplinkTo,
  status: "online" | "warning" | "offline",
  note
}
```

CSV/JSON import accepts flexible header aliases, including Chinese labels. Supported practical fields include:

`deviceId,type,name,building,floor,x,z,switchId,switchPort,patchPanel,patchPort,vlan,cableId,medium,fiberCore,uplinkTo,status,note,users,mbps,channel`

The right-side **實體線路資料** panel has:

- `匯入 CSV / JSON`: imports real mapping data.
- `載入範例`: injects visible sample data into the currently selected school so the user can inspect IDF, failed AP, high-traffic AP, switch port, patch panel, and cable label behavior in the current browser session.

## AI And Proxy Endpoints

`vite.config.js` registers dev-server middleware:

- `POST /api/analyze-image`: vision analysis for floor-plan import.
- `POST /api/chat`: text-only network analysis.

Backends:

- `gemma`: OpenAI-compatible local endpoint. Controlled by `LOCAL_LLM_URL` and `LOCAL_LLM_MODEL`.
- `claude`: Anthropic API. Requires `ANTHROPIC_API_KEY`.

Do not put secrets in source files. Use environment variables.

## Visual Modes

- `設備狀態` (`health`): colors by online/warning/offline.
- `訊號熱區` (`signal`): colors heat zones by signal quality.
- `用戶流量` (`traffic`): colors zones/devices by users and Mbps.
- `樓層規劃` (`planning`): emphasizes floors, room labels, and building structure.
- `實體線路` (`cabling`): shows corridor cable trays, vertical risers, inter-building fiber, Cat6 drops, core/MDF labels, and selected cable paths.

## Styling Guidelines

- Keep UI dense, operational, and readable. This is a monitoring/planning tool, not a marketing page.
- Use existing classes and patterns in `src/styles.css` before adding new structures.
- Avoid nested card-in-card layouts. Existing panels use `panel-section`, `detail-panel`, and `legend-panel`.
- Keep cards at small radii and compact typography.
- Maintain responsive behavior for 390px mobile viewport; update `scripts/verify-visual.mjs` if core UI assumptions change.

## Testing & Verification

Before committing UI, 3D scene, import, or layout changes:

```bash
npm run build
node scripts/verify-visual.mjs
```

The visual script checks:

- Desktop viewport: 1440x900.
- Mobile viewport: 390x844.
- Non-blank WebGL canvas.
- Visible toolbar and mode strip.
- Presence of device rows.
- Screenshots under `artifacts/screenshots/`.

For network-link changes, also manually or programmatically verify:

- `載入範例` creates visible sample devices.
- Selecting the sample failed AP shows switch port, patch panel, cable ID, and red/offline state.
- `實體線路` mode shows cable paths without hiding device markers.

## Current Limitations

- Building footprints are rectangular. Rotated, polygon, curved, or L-shaped buildings must be split into multiple rectangles.
- AI detection can still misread scanned maps, dense labels, shadows, courts, roads, or large empty areas.
- Cabling geometry is inferred from building edges and floors; it is not yet a precise low-voltage as-built drawing with exact cable tray turns, rack positions, conduit paths, or patch panel rack units.
- Network data import is file-based CSV/JSON; UniFi, switch APIs, SNMP, and NMS integrations are future work.
- localStorage is the persistence layer. Large images may hit browser storage limits.

## Development Notes

- Do not assume `CLAUDE.md` is the source of truth for runtime data. Inspect `src/App.jsx`, `src/ImportWizard.jsx`, and `src/data/*.json`.
- When editing school or network data logic, keep the localStorage shape backward-compatible where possible.
- When adding imports, remember that `Map` from `lucide-react` conflicts with JavaScript's built-in `Map`; use an alias such as `Map as MapIcon`.
- Keep `WORKLOG.md` updated for user-visible feature work.
- The app uses Traditional Chinese labels throughout the product UI.
