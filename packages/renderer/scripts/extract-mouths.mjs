/**
 * 달이네 냇가 — Mouth Shape Extractor
 *
 * Mouth Shape Sheet에서 Rhubarb 호환 입모양을 개별 PNG로 추출.
 *
 * 시트 구조: 7개 얼굴이 가로로 나열 (1774×887)
 *   각 칸 ≈ 253px 폭 × 887px 높이
 *   입 영역: 세로 약 55~88% (y 488~780)
 *
 * Rhubarb 7-shape 매핑 (Preston Blair 기반):
 *   1 → X  (침묵/휴식 — 거의 닫힌 입)
 *   2 → A  (ah — 살짝 열린)
 *   3 → B  (b, m, p — 작은 원형)
 *   4 → C  (ee, i — 입 열림)
 *   5 → D  (oh — 크게 열린)
 *   6 → E  (wide — 이 보임)
 *   7 → F  (oo, u — 동그란 오)
 *
 * Run: pnpm --filter @22b/anime-renderer run extract-mouths
 */
import sharp from "sharp";
import { mkdirSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const SHEET_PATH = join(ROOT, "assets/characters/Mouth Shape Sheet (For Lip Sync \u2014 Rhubarb Compatible).png");
const OUT_DIR = join(ROOT, "assets/characters/dali/mouths");

mkdirSync(OUT_DIR, { recursive: true });

// ─── 시트 메타데이터 ──────────────────────────────────────────────────────────

const meta = await sharp(SHEET_PATH).metadata();
const sheetW = meta.width;
const sheetH = meta.height;
const COUNT = 7;
const cellW = Math.floor(sheetW / COUNT);

// 입 영역: 얼굴 높이의 55%~88% 구간
const mouthTop    = Math.round(sheetH * 0.52);
const mouthBottom = Math.round(sheetH * 0.88);
const mouthH      = mouthBottom - mouthTop;

const SHAPES = ["X", "A", "B", "C", "D", "E", "F"];

console.log(`\n시트: ${sheetW}×${sheetH}`);
console.log(`셀 폭: ${cellW}px, 입 영역: y ${mouthTop}~${mouthBottom} (${mouthH}px)\n`);

// ─── Flood-fill 흰 배경 제거 ──────────────────────────────────────────────────

async function removeWhiteBg(pixels, width, height, threshold = 230, tolerance = 25) {
  function isWhitish(idx) {
    const r = pixels[idx * 4 + 0];
    const g = pixels[idx * 4 + 1];
    const b = pixels[idx * 4 + 2];
    const a = pixels[idx * 4 + 3];
    if (a < 10) return false;
    return r >= threshold && g >= threshold && b >= threshold
      && Math.max(r, g, b) - Math.min(r, g, b) <= tolerance;
  }

  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = [];

  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const i = y * width + x;
      if (!visited[i] && isWhitish(i)) { visited[i] = 1; queue.push(i); }
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const i = y * width + x;
      if (!visited[i] && isWhitish(i)) { visited[i] = 1; queue.push(i); }
    }
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
  return queue.length;
}

// ─── 추출 ─────────────────────────────────────────────────────────────────────

// 전체 시트를 한 번만 raw로 읽어서 각 셀을 추출
const { data: sheetData, info } = await sharp(SHEET_PATH)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const sheetPixels = new Uint8Array(sheetData);

for (let i = 0; i < COUNT; i++) {
  const shape = SHAPES[i];
  const cellX = i * cellW;

  // 셀에서 입 영역만 크롭 (raw pixel 복사)
  const cropW = cellW;
  const cropH = mouthH;
  const crop = new Uint8Array(cropW * cropH * 4);

  for (let row = 0; row < cropH; row++) {
    for (let col = 0; col < cropW; col++) {
      const srcIdx = ((mouthTop + row) * sheetW + (cellX + col)) * 4;
      const dstIdx = (row * cropW + col) * 4;
      crop[dstIdx + 0] = sheetPixels[srcIdx + 0];
      crop[dstIdx + 1] = sheetPixels[srcIdx + 1];
      crop[dstIdx + 2] = sheetPixels[srcIdx + 2];
      crop[dstIdx + 3] = sheetPixels[srcIdx + 3];
    }
  }

  // 흰 배경 제거
  const removed = await removeWhiteBg(crop, cropW, cropH);

  // 내용물이 있는 bounding box 계산 (투명하지 않은 픽셀 범위)
  let minX = cropW, maxX = 0, minY = cropH, maxY = 0;
  for (let row = 0; row < cropH; row++) {
    for (let col = 0; col < cropW; col++) {
      const a = crop[(row * cropW + col) * 4 + 3];
      if (a > 10) {
        if (col < minX) minX = col;
        if (col > maxX) maxX = col;
        if (row < minY) minY = row;
        if (row > maxY) maxY = row;
      }
    }
  }

  // 입 주변 여백 추가
  const PAD = 12;
  minX = Math.max(0, minX - PAD);
  maxX = Math.min(cropW - 1, maxX + PAD);
  minY = Math.max(0, minY - PAD);
  maxY = Math.min(cropH - 1, maxY + PAD);

  const tightW = maxX - minX + 1;
  const tightH = maxY - minY + 1;
  const tight = new Uint8Array(tightW * tightH * 4);

  for (let row = 0; row < tightH; row++) {
    for (let col = 0; col < tightW; col++) {
      const srcIdx = ((minY + row) * cropW + (minX + col)) * 4;
      const dstIdx = (row * tightW + col) * 4;
      tight[dstIdx + 0] = crop[srcIdx + 0];
      tight[dstIdx + 1] = crop[srcIdx + 1];
      tight[dstIdx + 2] = crop[srcIdx + 2];
      tight[dstIdx + 3] = crop[srcIdx + 3];
    }
  }

  const outPath = join(OUT_DIR, `mouth_${shape.toLowerCase()}.png`);
  await sharp(Buffer.from(tight), { raw: { width: tightW, height: tightH, channels: 4 } })
    .png()
    .toFile(outPath);

  console.log(`  ✓ mouth_${shape.toLowerCase()}.png  (${tightW}×${tightH}, ${removed}px 제거)`);
}

console.log(`\n완료 → assets/characters/dali/mouths/\n`);
