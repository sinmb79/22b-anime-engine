/**
 * 달이네 냇가 — Asset Preparation Script
 *
 * 1. 메인 캐릭터 흰 배경 제거 → anim/
 * 2. 서브 캐릭터 흰 배경 제거 → anim/
 * 3. 소품 흰 배경 제거 → props/
 * 4. 실제 배경 이미지 → 변환 없이 그대로 사용 (BG01~BG16)
 * 5. 폴백: SVG 냇가 배경 생성 (실제 배경이 없을 때만)
 *
 * Run: pnpm --filter @22b/anime-renderer run prepare-assets
 */
import sharp from "sharp";
import { mkdirSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const CHARS_DIR = join(ROOT, "assets/characters");
const BG_DIR = join(ROOT, "assets/backgrounds");
const PROPS_DIR = join(ROOT, "assets/props");
const ANIM_DIR = join(CHARS_DIR, "anim");

mkdirSync(ANIM_DIR, { recursive: true });
mkdirSync(PROPS_DIR, { recursive: true });

// ─── Flood-fill 흰 배경 제거 ──────────────────────────────────────────────────

/**
 * 흰색 배경을 투명으로 변환.
 * BFS flood-fill from all 4 edges: 이미지 경계에서 연결된 흰색 픽셀만 투명 처리.
 * 캐릭터 내부의 흰색/크림색 영역은 보존됨.
 */
async function removeWhiteBackground(inputPath, outputPath, threshold = 230, colorTolerance = 20) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const { width, height } = info;
  const total = width * height;

  function isWhitish(idx) {
    const r = pixels[idx * 4 + 0];
    const g = pixels[idx * 4 + 1];
    const b = pixels[idx * 4 + 2];
    const a = pixels[idx * 4 + 3];
    if (a < 10) return false;
    const bright = r >= threshold && g >= threshold && b >= threshold;
    const gray = Math.max(r, g, b) - Math.min(r, g, b) <= colorTolerance;
    return bright && gray;
  }

  const visited = new Uint8Array(total);
  const queue = [];

  for (let x = 0; x < width; x++) {
    if (isWhitish(x))                        { visited[x] = 1; queue.push(x); }
    if (isWhitish((height - 1) * width + x)) { const i = (height - 1) * width + x; visited[i] = 1; queue.push(i); }
  }
  for (let y = 0; y < height; y++) {
    if (isWhitish(y * width))             { const i = y * width;           visited[i] = 1; queue.push(i); }
    if (isWhitish(y * width + width - 1)) { const i = y * width + width - 1; visited[i] = 1; queue.push(i); }
  }

  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    pixels[idx * 4 + 3] = 0;
    const px = idx % width;
    const py = Math.floor(idx / width);
    for (let d = 0; d < 4; d++) {
      const nx = px + dx[d];
      const ny = py + dy[d];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (visited[ni]) continue;
      if (!isWhitish(ni)) continue;
      visited[ni] = 1;
      queue.push(ni);
    }
  }

  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outputPath);

  console.log(`  ✓ ${outputPath.replace(ROOT + "/", "")} (${queue.length}px 제거)`);
}

// ─── 1. 메인 캐릭터 ───────────────────────────────────────────────────────────

const mainChars = [
  { src: "Dali-base.png",    dst: "dali.png",        threshold: 230, colorTolerance: 20 },
  { src: "Dori.png",         dst: "dori.png",         threshold: 230, colorTolerance: 20 },
  { src: "Papa-otter.png",   dst: "papa-otter.png",   threshold: 235, colorTolerance: 15 },
  { src: "mama-otter.png",   dst: "mama-otter.png",   threshold: 235, colorTolerance: 15 },
];

console.log("\n[1] 메인 캐릭터 배경 제거...");
for (const f of mainChars) {
  const src = join(CHARS_DIR, f.src);
  if (!existsSync(src)) { console.log(`  - 스킵 (파일 없음): ${f.src}`); continue; }
  await removeWhiteBackground(src, join(ANIM_DIR, f.dst), f.threshold, f.colorTolerance);
}

// ─── 2. 서브 캐릭터 ───────────────────────────────────────────────────────────

const subChars = [
  { src: "[S1] 밤이 (Bami) — 다람쥐 친구 (레귤러).png", dst: "bami.png",     threshold: 230, colorTolerance: 20 },
  { src: "[S2] 폴짝이 (Poljjak) — 개구리 친구.png",      dst: "poljjak.png",  threshold: 230, colorTolerance: 20 },
  { src: "[S3] 올챙이들 (Tadpoles) — EP02.png",           dst: "tadpoles.png", threshold: 230, colorTolerance: 25 },
];

console.log("\n[2] 서브 캐릭터 배경 제거...");
for (const f of subChars) {
  const src = join(CHARS_DIR, f.src);
  if (!existsSync(src)) { console.log(`  - 스킵 (파일 없음): ${f.src}`); continue; }
  await removeWhiteBackground(src, join(ANIM_DIR, f.dst), f.threshold, f.colorTolerance);
}

// ─── 3. 소품 ─────────────────────────────────────────────────────────────────

const props = [
  { src: "[P1] 달빛돌 (Moonlight Stone).png",                       dst: "moonstone.png",    threshold: 230, colorTolerance: 20 },
  { src: "[P2] 아빠의 뗏목 (Papa's Raft).png",                      dst: "raft.png",         threshold: 230, colorTolerance: 20 },
  { src: "[P3] 허수아비 (Scarecrow).png",                            dst: "scarecrow.png",    threshold: 230, colorTolerance: 20 },
  { src: "[P4] 도토리 은행 (Acorn Bank).png",                        dst: "acorn_bank.png",   threshold: 230, colorTolerance: 20 },
  { src: "[P5] 시리즈 핵심 소품 시트 (Character Signature Items).png", dst: "signature_items.png", threshold: 230, colorTolerance: 20 },
];

console.log("\n[3] 소품 배경 제거...");
for (const f of props) {
  const src = join(CHARS_DIR, f.src);
  if (!existsSync(src)) { console.log(`  - 스킵 (파일 없음): ${f.src}`); continue; }
  await removeWhiteBackground(src, join(PROPS_DIR, f.dst), f.threshold, f.colorTolerance);
}

// ─── 4. 실제 배경 이미지 확인 ────────────────────────────────────────────────

const realBgs = [
  { file: "[BG01] 냇가 — 봄.png",                         id: "bg_creek_spring"   },
  { file: "[BG02] 냇가 — 여름.png",                        id: "bg_creek_summer"   },
  { file: "[BG03] 냇가 — 가을.png",                        id: "bg_creek_autumn"   },
  { file: "[BG04] 냇가 — 겨울.png",                        id: "bg_creek_winter"   },
  { file: "[BG05] 집 외부.png",                             id: "bg_house_exterior" },
  { file: "[BG06] 집 내부.png",                             id: "bg_house_interior" },
  { file: "[BG07] 논 — 봄-여름 (초록).png",                id: "bg_field_spring"   },
  { file: "[BG08] 논 — 가을 (황금).png",                   id: "bg_field_autumn"   },
  { file: "[BG09] 벚꽃길 (Cherry Blossom Path).png",       id: "bg_cherry_path"    },
  { file: "[BG10] 숲 입구 (Forest Entrance).png",          id: "bg_forest_entrance"},
  { file: "[BG11] 밤하늘 캠핑 (Night Sky - Camping).png",  id: "bg_night_camping"  },
  { file: "[BG12] 장마 냇가 (Rainy-Flooded Creek).png",    id: "bg_creek_rainy"    },
  { file: "[BG13] 단풍숲 (Autumn Forest).png",             id: "bg_autumn_forest"  },
  { file: "[BG14] 냇가 둑 저녁 (Creek Bank — Sunset).png", id: "bg_creek_sunset"   },
  { file: "[BG15] 눈밭-집 앞 (Snowy Yard).png",            id: "bg_snowy_yard"     },
  { file: "[BG16] 해돋이 언덕 (Sunrise Hill).png",         id: "bg_sunrise_hill"   },
];

console.log("\n[4] 실제 배경 이미지 확인...");
let foundBgs = 0;
for (const bg of realBgs) {
  const p = join(BG_DIR, bg.file);
  if (existsSync(p)) {
    console.log(`  ✓ ${bg.id}: ${bg.file}`);
    foundBgs++;
  } else {
    console.log(`  - 없음: ${bg.file}`);
  }
}

// ─── 5. 폴백: SVG 배경 생성 (BG01이 없을 때만) ───────────────────────────────

const bg01Path = join(BG_DIR, "[BG01] 냇가 — 봄.png");
if (!existsSync(bg01Path)) {
  console.log("\n[5] BG01 없음 — SVG 폴백 배경 생성...");

  const creekBgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#87CEEB"/>
      <stop offset="60%" stop-color="#B0E0E6"/>
      <stop offset="100%" stop-color="#E0F4E0"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5BA4CF" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#3D7EAA" stop-opacity="0.95"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7CB87C"/>
      <stop offset="100%" stop-color="#5A9A5A"/>
    </linearGradient>
    <filter id="wc" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <rect width="1920" height="600" fill="url(#sky)"/>
  <ellipse cx="300" cy="120" rx="140" ry="55" fill="white" opacity="0.75" filter="url(#wc)"/>
  <ellipse cx="900" cy="80" rx="180" ry="60" fill="white" opacity="0.65" filter="url(#wc)"/>
  <ellipse cx="1550" cy="110" rx="160" ry="55" fill="white" opacity="0.70" filter="url(#wc)"/>
  <ellipse cx="400" cy="450" rx="450" ry="250" fill="#8FBF6F" opacity="0.6" filter="url(#wc)"/>
  <ellipse cx="960" cy="400" rx="550" ry="280" fill="#7AAD5D" opacity="0.55" filter="url(#wc)"/>
  <ellipse cx="1600" cy="430" rx="500" ry="260" fill="#85B868" opacity="0.6" filter="url(#wc)"/>
  <path d="M0 580 Q480 540 960 560 Q1440 580 1920 550 L1920 1080 L0 1080 Z" fill="url(#ground)" filter="url(#wc)"/>
  <path d="M0 580 Q480 560 960 575 Q1440 590 1920 570 L1920 720 Q1440 740 960 730 Q480 720 0 730 Z" fill="url(#water)"/>
  <ellipse cx="550" cy="670" rx="55" ry="22" fill="#8B7355" filter="url(#wc)"/>
  <ellipse cx="720" cy="660" rx="50" ry="20" fill="#7A6348" filter="url(#wc)"/>
  <ellipse cx="890" cy="668" rx="58" ry="22" fill="#8B7355" filter="url(#wc)"/>
  <path d="M0 720 Q480 700 960 715 Q1440 730 1920 715 L1920 1080 L0 1080 Z" fill="#6BAD5A" opacity="0.9"/>
  <path d="M0 800 Q480 780 960 795 Q1440 810 1920 795 L1920 1080 L0 1080 Z" fill="#5A9A4A"/>
</svg>`;

  await sharp(Buffer.from(creekBgSvg)).png().toFile(join(BG_DIR, "creek_spring.png"));
  console.log("  ✓ assets/backgrounds/creek_spring.png (SVG 폴백)");
} else {
  console.log("\n[5] BG01 실제 이미지 있음 — SVG 폴백 불필요");
}

// ─── 완료 ─────────────────────────────────────────────────────────────────────

console.log("\n─────────────────────────────────────────");
console.log(`완료.`);
console.log(`  메인 캐릭터: ${mainChars.length}개 → assets/characters/anim/`);
console.log(`  서브 캐릭터: ${subChars.length}개 → assets/characters/anim/`);
console.log(`  소품:        ${props.length}개 → assets/props/`);
console.log(`  실제 배경:   ${foundBgs}/${realBgs.length}개 확인됨`);
console.log("─────────────────────────────────────────\n");
