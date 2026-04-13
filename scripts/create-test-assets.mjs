/**
 * Creates placeholder test assets (colored PNGs) for Phase 0 testing.
 * Run: node scripts/create-test-assets.mjs
 *
 * Requires: node-canvas (canvas package) to be installed.
 */
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function createPlaceholderPng(width, height, color, label) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.font = `bold ${Math.floor(height / 8)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, width / 2, height / 2);

  return canvas.toBuffer("image/png");
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
  const buf = createPlaceholderPng(asset.width, asset.height, asset.color, asset.label);
  writeFileSync(fullPath, Buffer.from(buf));
  console.log(`Created: ${asset.path}`);
  created++;
}

console.log(`\nDone. Created ${created} placeholder assets.`);
console.log("These are for testing only — replace with real artwork.");
