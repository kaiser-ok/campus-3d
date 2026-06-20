import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import buildingsData from '../src/data/buildings.json' with { type: 'json' };
import devicesData from '../src/data/devices.json' with { type: 'json' };
import heatZonesData from '../src/data/heatZones.json' with { type: 'json' };
import xikunSchool from '../src/data/xikunSchool.js';
import xikunStyleProfile from '../src/data/xikunStyleProfile.js';
import { createUe5Scene } from '../src/ue5Scene.js';

const outputDir = new URL('../public/ue5/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const schools = [
  {
    id: 'default',
    name: '壽山高中',
    buildings: buildingsData,
    devices: devicesData,
    heatZones: heatZonesData,
    networkLinks: [],
    planUrl: '/school-plan.jpg',
  },
  xikunSchool,
];

const styleProfiles = {
  'xikun-jhs': xikunStyleProfile,
};

const manifest = {
  generatedAt: new Date().toISOString(),
  scenes: [],
};

for (const school of schools) {
  const styleProfile = styleProfiles[school.id] || null;
  const scene = createUe5Scene(school, { styleProfile });
  const filename = `${school.id}-campus-scene.json`;
  await writeFile(new URL(filename, outputDir), `${JSON.stringify(scene, null, 2)}\n`, 'utf-8');
  if (styleProfile) {
    await writeFile(new URL(`${school.id}-style-profile.json`, outputDir), `${JSON.stringify(styleProfile, null, 2)}\n`, 'utf-8');
  }
  manifest.scenes.push({
    schoolId: school.id,
    schoolName: school.name,
    url: `/ue5/${filename}`,
    styleProfileUrl: styleProfile ? `/ue5/${school.id}-style-profile.json` : '',
    summary: scene.summary,
  });
}

await writeFile(new URL('manifest.json', outputDir), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

console.log(JSON.stringify({
  outputDir: fileURLToPath(outputDir),
  scenes: manifest.scenes,
}, null, 2));
