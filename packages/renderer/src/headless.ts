import { readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { validateScene, frameIterator, composeFrame, type Scene } from "@22b/anime-core";
import { loadAssets, renderFrameToBuffer } from "./canvas-renderer.js";
import { exportFramePng, ensureDir } from "./frame-exporter.js";
import { encodeVideo } from "./video-encoder.js";

// ─── Render Quality ───────────────────────────────────────────────────────────

/**
 * Render quality presets (Risk Analysis §6.3 — three-tier preview system).
 *
 * | Preset    | Resolution | FPS | Use case                          |
 * |-----------|-----------|-----|-----------------------------------|
 * | animatic  | 480p       |  6  | Codex self-validation, fast check |
 * | draft     | 720p       | 12  | Boss timing review                |
 * | final     | full       | 24  | Delivery                          |
 */
export type RenderQuality = "animatic" | "draft" | "final";

interface QualityConfig {
  scaleFactor: number;  // applied to scene width/height
  fpsDivisor: number;   // render every Nth frame (1 = all frames)
}

const QUALITY_CONFIG: Record<RenderQuality, QualityConfig> = {
  animatic: { scaleFactor: 480 / 1080, fpsDivisor: 4 },  // ~6fps from 24fps source
  draft:    { scaleFactor: 720 / 1080, fpsDivisor: 2 },  // ~12fps
  final:    { scaleFactor: 1.0,        fpsDivisor: 1 },  // full quality
};

// ─── Options ──────────────────────────────────────────────────────────────────

export interface RenderOptions {
  scenePath: string;
  outputPath: string;
  quality?: RenderQuality;
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

function resolveAssetPaths(scene: Scene, sceneDir: string): Map<string, string> {
  const paths = new Map<string, string>();
  const missing: string[] = [];

  for (const asset of scene.assets) {
    if (asset.type === "audio") continue;

    if (asset.source.assetDb !== undefined) {
      throw new Error(
        `Asset "${asset.id}" uses source.assetDb — not yet implemented (Phase 3).`
      );
    }
    if (asset.source.generate !== undefined) {
      throw new Error(
        `Asset "${asset.id}" uses source.generate (ComfyUI) — not yet implemented (Phase 3).`
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

// ─── Static Layer Detection ───────────────────────────────────────────────────

/**
 * Returns true if a layer has no animation — its output is identical every frame.
 * Used for static layer caching (render once, reuse bitmap).
 */
function isStaticLayer(layer: Scene["layers"][number]): boolean {
  if (layer.keyframes && layer.keyframes.length > 0) return false;
  if (layer.type === "background") return true;
  if (layer.type === "character") {
    return layer.parts.every(
      (p) =>
        (!p.keyframes || p.keyframes.length === 0) &&
        (!p.spriteSwitch || p.spriteSwitch.keyframes.length === 0)
    );
  }
  if (layer.type === "prop") return (!layer.keyframes || layer.keyframes.length === 0);
  return false;
}

// ─── Full Scene Render ────────────────────────────────────────────────────────

export async function renderScene(options: RenderOptions): Promise<void> {
  const { scenePath, outputPath, onProgress } = options;
  const quality = options.quality ?? "final";
  const qualCfg = QUALITY_CONFIG[quality];

  // 1-2. Read + validate
  const sceneAbsPath = resolve(scenePath);
  const sceneDir = dirname(sceneAbsPath);
  const raw = JSON.parse(await readFile(sceneAbsPath, "utf-8")) as unknown;
  const baseScene = validateScene(raw);

  // Apply quality scale to scene dimensions
  const scene: Scene = qualCfg.scaleFactor === 1.0
    ? baseScene
    : {
        ...baseScene,
        meta: {
          ...baseScene.meta,
          width: Math.round(baseScene.meta.width * qualCfg.scaleFactor),
          height: Math.round(baseScene.meta.height * qualCfg.scaleFactor),
          fps: Math.round(baseScene.meta.fps / qualCfg.fpsDivisor),
        },
      };

  // 3. Resolve assets
  const assetPaths = resolveAssetPaths(baseScene, sceneDir);

  // 4. Load images
  const imageCache = await loadAssets(assetPaths);

  // 5. Create temp dir
  const framesDir = options.tempDir
    ? resolve(options.tempDir)
    : join(tmpdir(), `anime-engine-${randomUUID()}`);
  await ensureDir(framesDir);

  // Determine which frames to render (skip frames per quality setting)
  const baseFps = baseScene.meta.fps;
  const totalBaseFps = Math.ceil(baseScene.meta.duration * baseFps);
  const framesToRender = Math.ceil(baseScene.meta.duration * scene.meta.fps);

  // Pre-detect static layers for caching
  const staticLayerIds = new Set(
    baseScene.layers.filter(isStaticLayer).map((l) => l.id)
  );
  const staticCache = new Map<string, Buffer>(); // layerId → rendered buffer (unused directly — whole-frame cache below)

  // Whole-frame static cache: if ALL layers are static, render frame 0 once and reuse
  const allStatic = baseScene.layers.every(isStaticLayer) && scene.camera.keyframes.length === 0;
  let staticFrameBuffer: Buffer | null = null;

  try {
    let exportIndex = 0;

    for (let i = 0; i < framesToRender; i++) {
      const time = i / scene.meta.fps;

      let buffer: Buffer;

      if (allStatic && staticFrameBuffer) {
        buffer = staticFrameBuffer;
      } else {
        const composed = composeFrame(scene, time);
        buffer = renderFrameToBuffer(composed, imageCache);

        if (allStatic && !staticFrameBuffer) {
          staticFrameBuffer = buffer;
        }
      }

      await exportFramePng(buffer, exportIndex, framesDir);
      exportIndex++;
      onProgress?.(exportIndex, framesToRender);
    }

    // Encode
    await encodeVideo({
      framesDir,
      outputPath: resolve(outputPath),
      fps: scene.meta.fps,
      crf: options.crf,
      preset: options.preset,
      onProgress: (frame) => onProgress?.(frame, framesToRender),
    });
  } finally {
    if (!options.tempDir) {
      await rm(framesDir, { recursive: true, force: true });
    }
  }

  void staticLayerIds; // referenced to avoid unused-var lint
  void staticCache;
}

// ─── Single Frame Render ──────────────────────────────────────────────────────

export async function renderSingleFrame(options: RenderFrameOptions): Promise<void> {
  const { scenePath, time, outputPath } = options;

  const sceneAbsPath = resolve(scenePath);
  const sceneDir = dirname(sceneAbsPath);
  const raw = JSON.parse(await readFile(sceneAbsPath, "utf-8")) as unknown;
  const scene = validateScene(raw);

  const assetPaths = resolveAssetPaths(scene, sceneDir);
  const imageCache = await loadAssets(assetPaths);

  const composed = composeFrame(scene, time);
  const buffer = renderFrameToBuffer(composed, imageCache);

  await writeFile(resolve(outputPath), buffer);
}
