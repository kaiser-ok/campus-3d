# UE5 Pixel Streaming PoC

This PoC keeps the current React app as the management UI and adds UE5 as an optional high-fidelity 3D renderer.

## Scope

- React remains responsible for school data, imported maps, AP/switch status, topology, filters, and editing.
- UE5 reads exported campus JSON and renders buildings, floors, rooms, devices, heat zones, and physical links.
- Browser/tablet users view UE5 through Pixel Streaming embedded in the React panel.

## Generated Scene Data

Run:

```bash
npm run export:ue5
```

Generated files:

- `public/ue5/manifest.json`
- `public/ue5/default-campus-scene.json`
- `public/ue5/xikun-jhs-campus-scene.json`
- `public/ue5/xikun-jhs-style-profile.json`

When the dev server is running:

- `http://localhost:5173/ue5/manifest.json`
- `http://localhost:5173/ue5/xikun-jhs-campus-scene.json`
- `http://localhost:5173/ue5/xikun-jhs-style-profile.json`

`xikun-jhs-campus-scene.json` also embeds a `styleProfile` block. It is derived from public school references and gives UE5 or an LLM-based generator hints for materials, facade rhythm, corridors, cable trays, risers, room-centered AP placement, and building-specific visual roles. The source photo reference currently lives at:

- `public/reference/xikun-gate-wikimedia.jpg`

## Look & Materials Pass (PBR + Lighting)

By default the loader paints everything with the flat engine `BasicShapeMaterial` and draws devices/links/zones as `DrawDebug*` gizmos — that is why UE5 looked worse than the web scene. `ACampusSceneLoaderActor` now supports a real material library plus emissive meshes. To get the upgraded look you must do two things in-editor: assign master materials and set up the lighting environment. Without them the actor falls back to the old flat look (so it still renders).

### 1. Lighting environment (biggest single win)

Add these to the level and the flat boxes immediately read as a real scene:

- **Directional Light** (movable) — the sun. Rotate to a low afternoon angle for long soft shadows.
- **Sky Light** (movable, Real Time Capture) — fills shadows so they are not black.
- **Sky Atmosphere** — physical sky.
- **Exponential Height Fog** (with Volumetric Fog on) — depth and atmosphere.
- **Post Process Volume** (Infinite Extent (Unbound) = true):
  - Global Illumination → Method = **Lumen**.
  - Reflections → Method = **Lumen** (so glass/metal reflect).
  - **Bloom** on (default Standard is fine) — this is what makes emissive devices glow.
  - Exposure → Metering Mode = **Manual**, Exposure Compensation tuned by eye (auto-exposure washes flat scenes out).

Project Settings: confirm Dynamic Global Illumination = Lumen, Reflections = Lumen, and Anti-Aliasing = **TSR**.

### 2. Master materials (assign on the actor's `Campus 3D|Materials` slots)

Create these master materials and assign them to the matching slots on the `BP_CampusSceneLoader` / `ACampusSceneLoaderActor` Details panel. The loader feeds each one a per-instance color, so each master must expose the **exact** parameter names below or the color/emissive will not apply:

- Vector parameter named `BaseColor`
- Vector parameter named `EmissiveColor`
- Scalar parameter named `EmissiveStrength`

Wire `BaseColor` into Base Color, and `EmissiveColor * EmissiveStrength` into Emissive Color. (Any slot left empty falls back to the flat engine material, which only honors a `Color` param and no emissive.)

| Actor slot | Suggested master | Notes |
| --- | --- | --- |
| `WallMaterial` | concrete/plaster, rough, subtle normal | buildings, floor slabs, room walls, stair cores |
| `RoofMaterial` | darker rough roofing | building roofs |
| `GlassMaterial` | translucent, low roughness, some Fresnel | window bands — the main "this is a building" cue; needs Lumen reflections |
| `GroundMaterial` | asphalt/grass tiling | campus ground plane |
| `CorridorMaterial` | tile/painted deck | corridor decks |
| `MetalMaterial` | metallic, low roughness | cable trays, corridor rails |
| `EmissiveMaterial` | unlit-ish emissive | devices, links, heat zones — color + glow are driven per instance |

### Automated setup script

`ue5/setup_campus_look.py` does all of the above in one headless pass — creates the 7 master materials under `/Game/CampusMaterials` (with the required `BaseColor`/`EmissiveColor`/`EmissiveStrength` params), ensures the lighting rig, assigns materials + look toggles onto the loader, loads the local scene JSON, and renders a framed aerial via a `SceneCapture2D` to `ue5/artifacts/campus_look.png`. Run it with:

```bash
"/Users/Shared/Epic Games/UE_5.7/Engine/Binaries/Mac/UnrealEditor-Cmd" \
  "ue5/Campus3DPoc 5.7/Campus3DPoc.uproject" \
  -ExecutePythonScript="ue5/setup_campus_look.py" \
  -unattended -nosplash -nopause -RenderOffscreen -stdout
```

Notes from first bring-up: headless exposure tuning is fiddly (manual `auto_exposure_bias` is hypersensitive — black at 4, white at 13), so the script drives brightness with directional-light intensity against a fixed project exposure instead. Final art direction (shadows, per-building color, framing, device glow) is far easier to tune live in the editor than by re-running headless. The `BasicShapeMaterial` fallback means it still renders if a material slot is empty.

### 3. Look toggles (`Campus 3D|Look`)

- `bUseMeshDevices` / `bUseMeshLinks` / `bUseMeshHeatZones`: mesh (true) vs old debug gizmo (false).
- `DeviceEmissive`, `LinkEmissive`, `HeatZoneEmissive`: glow strength feeding `EmissiveStrength`.
- `LinkRadiusCm`: cable thickness (fiber links render 1.4× this).
- `bDrawDebugOutlines`: keep on while tuning to see meshes + debug overlay together; turn off for the clean render.

Devices are now emissive sphere meshes, links are oriented cylinder meshes, and heat zones are thin glowing slabs — all routed through real materials and cleaned up on reload like the other generated geometry.

## Style Profile Loader

In the maintained `ue5/Campus3DPoc 5.7` project, `ACampusSceneLoaderActor` reads the embedded `styleProfile` block when `bApplyStyleProfile` is enabled.

Visible first-pass effects:

- roof debug boxes use `globalStyle.exteriorPalette.roof`;
- corridor decks use `globalStyle.exteriorPalette.corridor`;
- cable tray lines use `proceduralRules.corridorsAndNetwork.trayColor`;
- cable tray height uses `proceduralRules.corridorsAndNetwork.cableTrayHeightCm`;
- building role labels come from `buildingProfiles.*.visualRole`.

Useful actor toggles in the Details panel:

- `bApplyStyleProfile`
- `bDrawStyledRoofs`
- `bDrawStyledCorridors`
- `bUseMeshGeometry`
- `bDrawBuildingShellMeshes`
- `bDrawDebugOutlines`
- `bDrawCampusGround`
- `bDrawFloorSlabs`
- `bDrawRoomPartitions`
- `bDrawWindowBands`
- `bDrawStairCores`

The mesh pass generates persistent UE mesh components for the campus ground, roof slabs, corridor decks, cable trays, floor slabs, room partitions, window bands, and stair/service cores. Building shell meshes are available but disabled by default, because opaque building boxes can hide AP/switch positions. Keep `bDrawDebugOutlines` enabled while tuning placement; disable it later when the mesh actors become the primary view.

Suggested inspection setup:

- keep `bUseMeshGeometry`, `bDrawStyledRoofs`, `bDrawStyledCorridors`, `bDrawCampusGround`, `bDrawFloorSlabs`, `bDrawRoomPartitions`, `bDrawWindowBands`, and `bDrawStairCores` enabled;
- keep `bDrawBuildingShellMeshes` disabled unless you want to inspect simple building volume;
- turn off `bDrawDebugOutlines` after confirming the mesh placement.

To confirm it is loaded, open Unreal's Output Log and look for:

```text
Applied styleProfile=xikun-jhs-style-profile buildingProfiles=9 trayHeightCm=235
```

The React UI also has a `UE5 PoC` panel with:

- a static JSON link for built-in exported schools;
- a download button for the current browser-edited school state;
- a Pixel Streaming URL field;
- an iframe preview for the Pixel Streaming player.

## Coordinate Contract

The web scene uses:

- horizontal axes: `X/Z`
- vertical axis: `Y`
- unit: `campus-unit`

The UE5 scene should use:

- horizontal axes: `X/Y`
- vertical axis: `Z`
- unit: centimeter

Conversion:

```text
UE.X = Web.X * unrealUnitsPerCampusUnit
UE.Y = Web.Z * unrealUnitsPerCampusUnit
UE.Z = Web.Y * unrealUnitsPerCampusUnit
```

Default values:

- `unrealUnitsPerCampusUnit = 100`
- `floorHeightCm = 255`

## UE5 Minimal Implementation

This repository now includes a starter UE5 scaffold:

```text
ue5/Campus3DPoc 5.7/Campus3DPoc.uproject
```

Open the 5.7 project after Unreal Engine 5.7 is installed. `ue5/Campus3DPoc 5.7` is the maintained UE project; the older `ue5/Campus3DPoc` folder is only the original scaffold. The maintained scaffold contains `ACampusSceneLoaderActor`, which can fetch the exported JSON over HTTP and draw buildings, devices, heat zones, and links with debug geometry.

If you prefer building a project manually, create a UE project, for example `Campus3DPoc`.

Recommended first actors:

- `BP_CampusSceneLoader`
  - fetch or load `xikun-jhs-campus-scene.json`;
  - parse buildings, rooms, devices, heat zones, and network links;
  - spawn simple actor classes below.
- `BP_CampusBuilding`
  - one box mesh per building;
  - dimensions from `building.unreal.dimensionsCm`;
  - location from `building.unreal.locationCm`.
- `BP_CampusFloor`
  - thin transparent floor slabs;
  - optional floor labels.
- `BP_CampusRoom`
  - translucent room planes or low partitions;
  - room center and dimensions from `floor.rooms[].unreal`.
- `BP_NetworkDevice`
  - AP, switch, server variants;
  - material selected from `device.statusMaterial` and `device.loadClass`.
- `BP_NetworkCable`
  - splines between `networkLinks[].sourceDeviceId` and `targetDeviceId`;
  - material from `networkLinks[].materialToken`.

For the first test, implement buildings and devices only. Add rooms and links after the import loop is stable.

## Pixel Streaming Setup

Epic's current Pixel Streaming docs say Mac hardware must support VideoToolbox, and H.264 can use Apple M-series GPU acceleration. A MacBook M5 is therefore a reasonable LAN PoC target.

High-level local flow:

1. Enable `Pixel Streaming` or `Pixel Streaming 2` plugin in the UE project.
2. Package the project for macOS, or launch Standalone Game from the editor.
3. Start the Pixel Streaming Signalling Web Server.
4. Launch the UE app with:

```bash
-PixelStreamingURL=ws://127.0.0.1:8888
```

Optional for packaged/headless-style testing:

```bash
-RenderOffscreen
```

Default Pixel Streaming ports:

- browser HTTP player: `80`
- UE streamer WebSocket: `8888`

If port `80` is inconvenient on macOS, configure the Signalling Server to use another HTTP port, then put that URL into the React `UE5 PoC` panel.

## React Integration

In the current app:

1. Open `http://localhost:5173/`.
2. In the right panel, find `UE5 PoC`.
3. Confirm the JSON link opens.
4. Set `Pixel Streaming URL` to the Signalling Server player URL, for example:

```text
http://127.0.0.1/
```

or:

```text
http://127.0.0.1:8080/
```

The iframe will show the UE stream after the Signalling Server and UE app are both running.

## Acceptance Criteria

Phase 1:

- UE5 loads `xikun-jhs-campus-scene.json`.
- At least 9 building blocks appear in the right relative positions.
- At least AP/switch/server markers appear at floor-aware Z heights.
- Offline/warning/normal materials are visually distinct.

Phase 2:

- Rooms and corridor strips render per floor.
- AP high-user/high-traffic rooms show user-load indicators.
- Physical links render only for the selected building or selected floor.
- React can pass selected building/device state to UE5 through Pixel Streaming custom events or a small local WebSocket/API bridge.

## References

- Pixel Streaming overview: https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-pixel-streaming-in-unreal-engine
- Pixel Streaming reference: https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-pixel-streaming-reference
- Getting started: https://dev.epicgames.com/documentation/en-us/unreal-engine/getting-started-with-pixel-streaming-in-unreal-engine
