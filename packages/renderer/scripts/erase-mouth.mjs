/**
 * 달이네 냇가 — Erase Mouth from Character Base
 *
 * dali.png에서 입 부분을 지우고 주변 피부색으로 채워
 * 입모양 스프라이트를 오버레이할 수 있는 베이스 이미지를 생성.
 *
 * 출력: assets/characters/dali/dali_no_mouth.png
 *
 * Run: pnpm --filter @22b/anime-renderer run erase-mouth
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const SRC  = join(ROOT, "assets/characters/anim/dali.png");
const OUT_DIR = join(ROOT, "assets/characters/dali");
const OUT  = join(OUT_DIR, "dali_no_mouth.png");

mkdirSync(OUT_DIR, { recursive: true });

// ─── 이미지 읽기 ──────────────────────────────────────────────────────────────

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const px   = new Uint8Array(data);
const W    = info.width;   // 1536
const H    = info.height;  // 1024

function idx(x, y) { return (y * W + x) * 4; }

function getPixel(x, y) {
  const i = idx(x, y);
  return { r: px[i], g: px[i+1], b: px[i+2], a: px[i+3] };
}

function setPixel(x, y, r, g, b, a = 255) {
  const i = idx(x, y);
  px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = a;
}

// ─── 입 픽셀 감지 (Flood-fill from pink seed) ────────────────────────────────

/**
 * 입 내부(핑크)와 윤곽선(어두운 갈색)을 포함하는 픽셀 집합을 반환.
 * BBOX 밖으로는 확장하지 않아 눈/코 아웃라인을 오염시키지 않음.
 */
function detectMouthPixels(seedX, seedY, bbox) {
  const { x0, y0, x1, y1 } = bbox;
  const inBox = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

  function isMouthColor(x, y) {
    const p = getPixel(x, y);
    if (p.a < 10) return false;
    // 핑크 (입 내부)
    const isPink = p.r > 150 && p.r > p.g + 40 && p.b < 170;
    // 갈색/회갈색 (입 윤곽선) — rgb(135,114,103) 계열
    const isDarkBrown = p.r < 175 && p.g < 150 && p.b < 145
      && p.r > p.b + 8          // 붉은끼가 있어야 (갈색)
      && p.r < p.g + 35         // 너무 붉지는 않아야 (빨간 조끼 제외)
      && p.r > 40;
    return isPink || isDarkBrown;
  }

  const visited = new Set();
  const queue   = [seedX * 10000 + seedY];
  visited.add(queue[0]);

  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];
  let head = 0;

  while (head < queue.length) {
    const key = queue[head++];
    const cx  = Math.floor(key / 10000);
    const cy  = key % 10000;

    for (let d = 0; d < 4; d++) {
      const nx = cx + dx[d];
      const ny = cy + dy[d];
      if (!inBox(nx, ny)) continue;
      const nk = nx * 10000 + ny;
      if (visited.has(nk)) continue;
      if (!isMouthColor(nx, ny)) continue;
      visited.add(nk);
      queue.push(nk);
    }
  }

  return visited;
}

// ─── 입 영역 완전 지우기 ─────────────────────────────────────────────────────
//
// 전략: Flood-fill로 핑크 입 내부를 시작점으로 연결된 입 픽셀만 감지
//   → 얼굴 윤곽선(face outline)은 건드리지 않음
//   → 입 자리에 피부색 패치 생성 → 입모양 스프라이트 오버레이와 조합
//

// 입 위쪽(y=305~325) 주둥이 피부색 샘플
let rSum = 0, gSum = 0, bSum = 0, count = 0;
for (let sy = 300; sy <= 325; sy++) {
  for (let sx = 700; sx <= 820; sx++) {
    const p = getPixel(sx, sy);
    if (p.a > 200 && p.r > 220 && p.g > 200 && p.b > 180) {
      rSum += p.r; gSum += p.g; bSum += p.b; count++;
    }
  }
}
const skinColor = count > 0
  ? { r: Math.round(rSum/count), g: Math.round(gSum/count), b: Math.round(bSum/count) }
  : { r: 254, g: 228, b: 208 };
console.log(`  채울 피부색: rgb(${skinColor.r},${skinColor.g},${skinColor.b})`);

// 입 BBOX — flood-fill 경계
const MX0 = 640, MY0 = 258, MX1 = 895, MY1 = 455;

// ─── 핑크 시드 픽셀 자동 탐색 ────────────────────────────────────────────────
// 입 중앙 근처에서 가장 먼저 발견되는 핑크 픽셀을 시드로 사용
let seedX = -1, seedY = -1;
const SCAN_X0 = 690, SCAN_Y0 = 310, SCAN_X1 = 870, SCAN_Y1 = 440;
for (let y = SCAN_Y0; y <= SCAN_Y1 && seedX < 0; y++) {
  for (let x = SCAN_X0; x <= SCAN_X1 && seedX < 0; x++) {
    const p = getPixel(x, y);
    if (p.a > 100 && p.r > 155 && p.r > p.g + 35 && p.b < 165) {
      seedX = x; seedY = y;
    }
  }
}

if (seedX < 0) {
  console.error("핑크 시드 픽셀을 찾지 못했습니다 — 이미 지워진 상태일 수 있습니다.");
  process.exit(1);
}
console.log(`  시드 픽셀: (${seedX}, ${seedY})`);

// ─── Flood-fill로 입 픽셀 감지 ───────────────────────────────────────────────
console.log("입 영역 지우는 중...");
const mouthKeys = detectMouthPixels(seedX, seedY, { x0: MX0, y0: MY0, x1: MX1, y1: MY1 });

// 감지된 입 픽셀을 피부색으로 채움
for (const key of mouthKeys) {
  const cx = Math.floor(key / 10000);
  const cy = key % 10000;
  setPixel(cx, cy, skinColor.r, skinColor.g, skinColor.b);
}
console.log(`  ${mouthKeys.size}개 픽셀 채움`);

// 경계 소프트닝 (2px 가우시안-like 블렌딩)
// mouthKeys 형식: x * 10000 + y
const border = new Set();
for (const key of mouthKeys) {
  const mx = Math.floor(key / 10000);
  const my = key % 10000;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = mx+dx, ny = my+dy;
      if (nx < MX0 || nx > MX1 || ny < MY0 || ny > MY1) continue;
      const nk = nx * 10000 + ny;
      if (!mouthKeys.has(nk)) border.add(nk);
    }
  }
}
for (const key of border) {
  const bx = Math.floor(key / 10000);
  const by = key % 10000;
  let rS = 0, gS = 0, bS = 0, cnt = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = bx+dx, ny = by+dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const np = getPixel(nx, ny);
      if (np.a < 50) continue;
      rS += np.r; gS += np.g; bS += np.b; cnt++;
    }
  }
  if (cnt > 0) setPixel(bx, by, Math.round(rS/cnt), Math.round(gS/cnt), Math.round(bS/cnt));
}

// ─── 저장 ─────────────────────────────────────────────────────────────────────

await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(OUT);

console.log(`\n완료: assets/characters/dali/dali_no_mouth.png\n`);
