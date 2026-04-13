/**
 * 달이네 냇가 — Asset Preparation Script
 *
 * 1. 캐릭터 흰 배경 제거 → 투명 PNG
 * 2. 냇가 배경 (크리크 장면) SVG → PNG 생성
 *
 * Run: pnpm --filter @22b/anime-renderer run prepare-assets
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const CHARS_DIR = join(ROOT, "assets/characters");
const BG_DIR = join(ROOT, "assets/backgrounds");

// ─── 1. 흰 배경 제거 ─────────────────────────────────────────────────────────

/**
 * 흰색 배경을 투명으로 변환.
 * BFS flood-fill from all 4 edges: 이미지 경계에서 연결된 흰색 픽셀만 투명 처리.
 * 캐릭터 내부의 흰색/크림색 영역은 보존됨.
 *
 * @param threshold - 흰색으로 판단할 최소 밝기 (R,G,B 모두 이 값 이상)
 * @param colorTolerance - 각 채널이 서로 얼마나 달라도 흰색으로 볼지 (낮을수록 순백만 제거)
 */
async function removeWhiteBackground(inputPath, outputPath, threshold = 230, colorTolerance = 15) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const { width, height } = info;
  const total = width * height;

  /** 픽셀이 "흰색 배경"으로 분류될 수 있는지 확인 */
  function isWhitish(idx) {
    const r = pixels[idx * 4 + 0];
    const g = pixels[idx * 4 + 1];
    const b = pixels[idx * 4 + 2];
    const a = pixels[idx * 4 + 3];
    if (a < 10) return false; // 이미 투명한 픽셀은 스킵
    const bright = r >= threshold && g >= threshold && b >= threshold;
    const gray = Math.max(r, g, b) - Math.min(r, g, b) <= colorTolerance;
    return bright && gray;
  }

  // BFS: 4방향 이웃 탐색으로 경계에서 연결된 흰색 픽셀 전체를 투명 처리
  const visited = new Uint8Array(total); // 0=미방문, 1=큐에 있거나 처리됨
  const queue = [];

  // 4개 경계 가장자리를 BFS 시작점으로 추가
  for (let x = 0; x < width; x++) {
    if (isWhitish(x))                        { visited[x] = 1;                        queue.push(x); }
    if (isWhitish((height - 1) * width + x)) { const i = (height - 1) * width + x; visited[i] = 1; queue.push(i); }
  }
  for (let y = 0; y < height; y++) {
    if (isWhitish(y * width))                    { const i = y * width;           visited[i] = 1; queue.push(i); }
    if (isWhitish(y * width + width - 1))        { const i = y * width + width - 1; visited[i] = 1; queue.push(i); }
  }

  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    // 이 픽셀을 투명으로 처리
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

  await sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toFile(outputPath);

  const removed = queue.length;
  console.log(`  ✓ 배경 제거: ${outputPath.replace(ROOT, ".")} (${removed}px 제거)`);
}

// threshold: 흰색 판단 기준 밝기 (낮출수록 더 많이 제거)
// colorTolerance: 순백과 얼마나 달라도 흰색으로 볼지 (낮출수록 순백만 제거)
const characterFiles = [
  { src: "Dali-base.png",   dst: "dali.png",       threshold: 230, colorTolerance: 20 },
  { src: "Dori.png",        dst: "dori.png",        threshold: 230, colorTolerance: 20 },
  { src: "Papa-otter.png",  dst: "papa-otter.png",  threshold: 235, colorTolerance: 15 },
  { src: "mama-otter.png",  dst: "mama-otter.png",  threshold: 235, colorTolerance: 15 },
];

const ANIM_DIR = join(CHARS_DIR, "anim");
mkdirSync(ANIM_DIR, { recursive: true });

console.log("\n[1] 캐릭터 배경 제거 중...");
for (const f of characterFiles) {
  await removeWhiteBackground(
    join(CHARS_DIR, f.src),
    join(ANIM_DIR, f.dst),
    f.threshold,
    f.colorTolerance
  );
}

// ─── 2. 냇가 배경 생성 ───────────────────────────────────────────────────────

console.log("\n[2] 냇가 배경 생성 중...");

// 1080p 냇가 배경 — SVG로 그린 후 sharp로 PNG 변환
const creekBgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs>
    <!-- 하늘 그라디언트 -->
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#87CEEB"/>
      <stop offset="60%" stop-color="#B0E0E6"/>
      <stop offset="100%" stop-color="#E0F4E0"/>
    </linearGradient>
    <!-- 냇가 물 그라디언트 -->
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5BA4CF" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#3D7EAA" stop-opacity="0.95"/>
    </linearGradient>
    <!-- 땅 그라디언트 -->
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7CB87C"/>
      <stop offset="100%" stop-color="#5A9A5A"/>
    </linearGradient>
    <!-- 필터: 수채화 느낌 -->
    <filter id="watercolor" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>

  <!-- 하늘 -->
  <rect width="1920" height="600" fill="url(#sky)"/>

  <!-- 구름들 -->
  <ellipse cx="300" cy="120" rx="140" ry="55" fill="white" opacity="0.75" filter="url(#watercolor)"/>
  <ellipse cx="420" cy="100" rx="100" ry="45" fill="white" opacity="0.70"/>
  <ellipse cx="900" cy="80" rx="180" ry="60" fill="white" opacity="0.65" filter="url(#watercolor)"/>
  <ellipse cx="1040" cy="65" rx="120" ry="50" fill="white" opacity="0.60"/>
  <ellipse cx="1550" cy="110" rx="160" ry="55" fill="white" opacity="0.70" filter="url(#watercolor)"/>
  <ellipse cx="1680" cy="90" rx="90" ry="40" fill="white" opacity="0.65"/>

  <!-- 뒷산 (원거리) -->
  <ellipse cx="400" cy="450" rx="450" ry="250" fill="#8FBF6F" opacity="0.6" filter="url(#watercolor)"/>
  <ellipse cx="960" cy="400" rx="550" ry="280" fill="#7AAD5D" opacity="0.55" filter="url(#watercolor)"/>
  <ellipse cx="1600" cy="430" rx="500" ry="260" fill="#85B868" opacity="0.6" filter="url(#watercolor)"/>

  <!-- 나무들 (뒷배경) -->
  <!-- 왼쪽 나무 무리 -->
  <rect x="50" y="360" width="28" height="180" rx="8" fill="#5C3D1A"/>
  <ellipse cx="64" cy="340" rx="70" ry="80" fill="#4A8C3A" opacity="0.9" filter="url(#watercolor)"/>
  <rect x="130" y="380" width="22" height="160" rx="6" fill="#5C3D1A"/>
  <ellipse cx="141" cy="360" rx="60" ry="70" fill="#5A9E48" opacity="0.85" filter="url(#watercolor)"/>
  <rect x="200" y="370" width="25" height="170" rx="7" fill="#4A2E10"/>
  <ellipse cx="212" cy="348" rx="65" ry="75" fill="#3F7A30" opacity="0.9" filter="url(#watercolor)"/>

  <!-- 오른쪽 나무 무리 -->
  <rect x="1700" y="350" width="28" height="185" rx="8" fill="#5C3D1A"/>
  <ellipse cx="1714" cy="330" rx="75" ry="82" fill="#4A8C3A" opacity="0.9" filter="url(#watercolor)"/>
  <rect x="1790" y="370" width="22" height="165" rx="6" fill="#5C3D1A"/>
  <ellipse cx="1801" cy="352" rx="65" ry="72" fill="#5A9E48" opacity="0.85" filter="url(#watercolor)"/>
  <rect x="1840" y="355" width="30" height="180" rx="8" fill="#4A2E10"/>
  <ellipse cx="1855" cy="333" rx="70" ry="78" fill="#3F7A30" opacity="0.9" filter="url(#watercolor)"/>

  <!-- 냇가 둑 (앞쪽 풀밭) -->
  <path d="M0 580 Q480 540 960 560 Q1440 580 1920 550 L1920 1080 L0 1080 Z"
        fill="url(#ground)" filter="url(#watercolor)"/>

  <!-- 냇가 물 -->
  <path d="M0 580 Q480 560 960 575 Q1440 590 1920 570 L1920 720 Q1440 740 960 730 Q480 720 0 730 Z"
        fill="url(#water)"/>

  <!-- 물 반짝임 -->
  <ellipse cx="300" cy="645" rx="80" ry="12" fill="white" opacity="0.25"/>
  <ellipse cx="700" cy="660" rx="60" ry="10" fill="white" opacity="0.20"/>
  <ellipse cx="1100" cy="648" rx="90" ry="13" fill="white" opacity="0.22"/>
  <ellipse cx="1500" cy="655" rx="70" ry="11" fill="white" opacity="0.20"/>
  <ellipse cx="1800" cy="640" rx="50" ry="9" fill="white" opacity="0.18"/>

  <!-- 징검다리 -->
  <ellipse cx="550" cy="670" rx="55" ry="22" fill="#8B7355" filter="url(#watercolor)"/>
  <ellipse cx="680" cy="660" rx="50" ry="20" fill="#7A6348" filter="url(#watercolor)"/>
  <ellipse cx="800" cy="668" rx="58" ry="22" fill="#8B7355" filter="url(#watercolor)"/>
  <ellipse cx="920" cy="658" rx="52" ry="21" fill="#7A6348" filter="url(#watercolor)"/>

  <!-- 냇가 둑 앞쪽 풀 -->
  <path d="M0 720 Q480 700 960 715 Q1440 730 1920 715 L1920 1080 L0 1080 Z"
        fill="#6BAD5A" opacity="0.9"/>

  <!-- 앞쪽 풀밭 디테일 -->
  <path d="M0 800 Q480 780 960 795 Q1440 810 1920 795 L1920 1080 L0 1080 Z"
        fill="#5A9A4A"/>

  <!-- 앞쪽 꽃들 -->
  <!-- 노란 들꽃 -->
  <circle cx="180" cy="820" r="10" fill="#FFD700"/>
  <circle cx="200" cy="810" r="8" fill="#FFD700"/>
  <circle cx="350" cy="835" r="11" fill="#FFE135"/>
  <circle cx="1600" cy="825" r="10" fill="#FFD700"/>
  <circle cx="1750" cy="815" r="9" fill="#FFE135"/>
  <!-- 분홍 들꽃 -->
  <circle cx="280" cy="840" r="9" fill="#FFB7C5"/>
  <circle cx="1500" cy="850" r="10" fill="#FFB7C5"/>
  <circle cx="1680" cy="835" r="8" fill="#FF9EB5"/>

  <!-- 앞쪽 갈대/풀 -->
  <line x1="100" y1="760" x2="90" y2="680" stroke="#4A7A3A" stroke-width="3"/>
  <ellipse cx="90" cy="678" rx="8" ry="25" fill="#6B9A5A" opacity="0.8"/>
  <line x1="140" y1="770" x2="148" y2="685" stroke="#4A7A3A" stroke-width="3"/>
  <ellipse cx="148" cy="683" rx="7" ry="22" fill="#6B9A5A" opacity="0.8"/>
  <line x1="1780" y1="760" x2="1790" y2="678" stroke="#4A7A3A" stroke-width="3"/>
  <ellipse cx="1790" cy="676" rx="8" ry="24" fill="#6B9A5A" opacity="0.8"/>
  <line x1="1830" y1="775" x2="1820" y2="688" stroke="#4A7A3A" stroke-width="3"/>
  <ellipse cx="1820" cy="686" rx="7" ry="22" fill="#6B9A5A" opacity="0.8"/>
</svg>`;

await sharp(Buffer.from(creekBgSvg))
  .png()
  .toFile(join(BG_DIR, "creek_spring.png"));

console.log(`  ✓ 냇가 배경 생성: assets/backgrounds/creek_spring.png (1920×1080)`);

// ─── 완료 ─────────────────────────────────────────────────────────────────────

console.log("\n완료. 준비된 에셋:");
console.log("  배경: assets/backgrounds/creek_spring.png");
for (const f of characterFiles) {
  console.log(`  캐릭터: assets/characters/anim/${f.dst}`);
}
console.log("\n이제 씬을 렌더링할 수 있습니다.\n");
