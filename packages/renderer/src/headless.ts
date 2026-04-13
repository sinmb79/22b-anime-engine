import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { validateScene, frameIterator, type Scene } from "@22b/anime-core";
import { loadAssets, renderFrameToBuffer } from "./canvas-renderer.js";
import { exportFramePng, ensureDir } from "./frame-exporter.js";
import { encodeVideo } from "./video-encoder.js";

export interface RenderOptions {
  scenePath: string;
  outputPath: string;
  /** Override the temp directory for frame PNGs. Default: OS temp dir. */
  tempDir?: string;
  crf?: number;
  preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
  onProgress?: (frame: number, total: number) => void;
}

export interface RenderFrameOptions {
  scenePath: string;
  time: number;
  outputPath: string;
}

// ─── Asset Path Resolution ────────────────────────────────────────────────────

/**
 * Resolves all asset paths relative to the scene file directory.
 * Throws if any required file is missing.
 * Phase 0: only source.path is supported. assetDb and generate throw NotImplementedError.
 */
function resolveAssetPaths(scene: Scene, sceneDir: string): Map<string, string> {
  const paths = new Map<string, string>();
  const missing: string[] = [];

  for (const asset of scene.assets) {
    if (asset.type === "audio") continue; // Audio handled separately

    if (asset.source.assetDb !== undefined) {
      throw new Error(
        `Asset "${asset.id}" uses source.assetDb which is not yet implemented (Phase 3).`
      );
    }
    if (asset.source.generate !== undefined) {
      throw new Error(
        `Asset "${asset.id}" uses source.generate (ComfyUI) which is not yet implemented (Phase 3).`
      );
    }
    if (!asset.source.path) {
      throw new Error(`Asset "${asset.id}" has no source path.`);
    }

    const absPath = resolve(sceneDir, asset.source.path);
    if (!existsSync(absPath)) {
      missing.push(`  "${asset.id}" → ${absPath}`);
    } else {
      paths.set(asset.id, absPath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing asset files:\n${missing.join("\n")}`);
  }

  return paths;
}

// ─── Full Scene Render ────────────────────────────────────────────────────────

/**
 * Full pipeline: Scene JSON → PNG frames → MP4.
 *
 * Pipeline steps:
 * 1. Read + parse scene JSON
 * 2. Validate with Zod
 * 3. Resolve asset paths
 * 4. Load images into memory
 * 5. Create temp dir for frame output
 * 6. For each frame: compose → render → export PNG
 * 7. FFmpeg encode frames → MP4
 * 8. Clean up temp frames
 */
export async function renderScene(options: RenderOptions): Promise<void> {
  const { scenePath, outputPath, onProgress } = options;

  // 1-2. Read + validate
  const sceneAbsPath = resolve(scenePath);
  const sceneDir = dirname(sceneAbsPath);
  const raw = JSON.parse(await readFile(sceneAbsPath, "utf-8")) as unknown;
  const scene = validateScene(raw);

  // 3. Resolve assets
  const assetPaths = resolveAssetPaths(scene, sceneDir);

  // 4. Load images
  const imageCache = await loadAssets(assetPaths);

  // 5. Create temp dir
  const framesDir = options.tempDir
    ? resolve(options.tempDir)
    : join(tmpdir(), `anime-engine-${randomUUID()}`);
  await ensureDir(framesDir);

  const totalFrames = Math.ceil(scene.meta.duration * scene.meta.fps);

  try {
    // 6. Render frames
    for (const frameState of frameIterator(scene)) {
      const buffer = renderFrameToBuffer(frameState.composed, imageCache);
      await exportFramePng(buffer, frameState.frameIndex, framesDir);
      onProgress?.(frameState.frameIndex + 1, totalFrames);
    }

    // 7. Encode
    await encodeVideo({
      framesDir,
      outputPath: resolve(outputPath),
      fps: scene.meta.fps,
      crf: options.crf,
      preset: options.preset,
      onProgress: (frame) => onProgress?.(frame, totalFrames),
    });
  } finally {
    // 8. Clean up temp frames (even on error)
    if (!options.tempDir) {
      await rm(framesDir, { recursive: true, force: true });
    }
  }
}

// ─── Single Frame Render ──────────────────────────────────────────────────────

/**
 * Renders a single frame at the given time and saves as PNG.
 * Fast feedback loop for Codex/Boss review.
 */
export async function renderSingleFrame(options: RenderFrameOptions): Promise<void> {
  const { scenePath, time, outputPath } = options;

  const sceneAbsPath = resolve(scenePath);
  const sceneDir = dirname(sceneAbsPath);
  const raw = JSON.parse(await readFile(sceneAbsPath, "utf-8")) as unknown;
  const scene = validateScene(raw);

  const assetPaths = resolveAssetPaths(scene, sceneDir);
  const imageCache = await loadAssets(assetPaths);

  const { composeFrame } = await import("@22b/anime-core");
  const composed = composeFrame(scene, time);
  const buffer = renderFrameToBuffer(composed, imageCache);

  const { writeFile } = await import("node:fs/promises");
  const { resolve: pathResolve } = await import("node:path");
  await writeFile(pathResolve(outputPath), buffer);
}
