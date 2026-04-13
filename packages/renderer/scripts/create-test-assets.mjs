/**
 * Creates placeholder test assets (colored PNGs) for Phase 0 testing.
 * Run from monorepo root: pnpm --filter @22b/anime-renderer run create-test-assets
 *
 * Uses sharp (no native compilation needed on Windows — prebuilt binaries).
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve to monorepo root (2 levels up from packages/renderer/scripts/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");

function makeSvgPlaceholder(width, height, color, label) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${color}"/>
  <text x="${width/2}" y="${height/2}" font-size="${Math.floor(height/10)}"
        fill="rgba(0,0,0,0.6)" text-anchor="middle" dominant-baseline="middle"
        font-family="sans-serif" font-weight="bold">${label}</text>
</svg>`);
}

const assets = [
  {
    path: "assets/backgrounds/forest_day.png",
    width: 1280, height: 720,
    color: "#4a8c3f",
    label: "Forest Background",
  },
  {
    path: "assets/characters/mimi/body.png",
    width: 200, height: 300,
    color: "#f9a825",
    label: "Mimi Body",
  },
  {
    path: "assets/characters/mimi/head.png",
    width: 180, height: 180,
    color: "#ffcc80",
    label: "Mimi Head",
  },
  {
    path: "assets/characters/mimi/arm_l.png",
    width: 60, height: 150,
    color: "#f9a825",
    label: "Arm L",
  },
  {
    path: "assets/characters/mimi/arm_r.png",
    width: 60, height: 150,
    color: "#f9a825",
    label: "Arm R",
  },
  {
    path: "assets/characters/mimi/mouth_a.png",
    width: 60, height: 40,
    color: "#e91e63",
    label: "A",
  },
  {
    path: "assets/characters/mimi/mouth_x.png",
    width: 60, height: 20,
    color: "#c2185b",
    label: "X",
  },
];

let created = 0;
for (const asset of assets) {
  const fullPath = join(ROOT, asset.path);
  mkdirSync(join(ROOT, asset.path, ".."), { recursive: true });

  const svg = makeSvgPlaceholder(asset.width, asset.height, asset.color, asset.label);
  const buf = await sharp(svg).png().toBuffer();
  writeFileSync(fullPath, buf);
  console.log(`Created: ${asset.path}`);
  created++;
}

console.log(`\nDone. Created ${created} placeholder assets.`);
console.log("Replace with real artwork for production.");
