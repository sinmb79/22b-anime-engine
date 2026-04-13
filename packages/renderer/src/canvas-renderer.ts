/**
 * Headless 2D compositor using @napi-rs/canvas.
 *
 * Phase 0 uses @napi-rs/canvas for reliability on Windows (prebuilt binaries,
 * no Visual Studio required). PixiJS v8 will be introduced in Phase 4 (Preview App / Tauri).
 */
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import type { ComposedFrame } from "@22b/anime-core";

export type ImageCache = Map<string, Image>;

/**
 * Loads all unique image assets referenced in a scene's asset list into memory.
 * Returns a Map keyed by assetId.
 *
 * @param assetPaths - Map from assetId → absolute file path
 */
export async function loadAssets(assetPaths: Map<string, string>): Promise<ImageCache> {
  const cache: ImageCache = new Map();
  const entries = [...assetPaths.entries()];
  await Promise.all(
    entries.map(async ([id, filePath]) => {
      try {
        const img = await loadImage(filePath) as unknown as Image;
        cache.set(id, img);
      } catch (err) {
        throw new Error(`Failed to load asset "${id}" from "${filePath}": ${(err as Error).message}`);
      }
    })
  );
  return cache;
}

/**
 * Renders a single ComposedFrame to a node-canvas Buffer (PNG).
 *
 * Camera transform is applied to the entire scene canvas:
 *   1. Translate to canvas center
 *   2. Scale by camera.zoom
 *   3. Translate by -camera.(x,y) to pan
 *
 * Layers are drawn in ascending zIndex order (already sorted by compositor).
 */
export function renderFrameToBuffer(composed: ComposedFrame, cache: ImageCache): Buffer {
  const { width, height, camera, layers } = composed;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Clear with transparency
  ctx.clearRect(0, 0, width, height);

  // Apply camera transform
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  for (const layer of layers) {
    if (!layer.visible || layer.items.length === 0) continue;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));

    for (const call of layer.items) {
      // Skip engine-internal effect sentinels (handled separately in future phases)
      if (call.assetId.startsWith("__effect__")) continue;

      const img = cache.get(call.assetId);
      if (!img) continue;

      const t = call.worldTransform;
      const ax = (t.anchorX ?? 0.5) * img.width;
      const ay = (t.anchorY ?? 0.5) * img.height;

      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * Math.max(0, Math.min(1, call.opacity));
      ctx.translate(t.x, t.y);
      ctx.rotate((t.rotation * Math.PI) / 180);
      ctx.scale(t.scaleX, t.scaleY);
      ctx.drawImage(img as unknown as Parameters<typeof ctx.drawImage>[0], -ax, -ay);
      ctx.restore();
    }

    ctx.restore();
  }

  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
