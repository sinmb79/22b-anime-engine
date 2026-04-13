import type { Scene } from "../schema/scene.js";
import type { Layer, CharacterLayer, CharacterPart } from "../schema/layer.js";
import type { Transform } from "../schema/keyframe.js";
import { DefaultTransform } from "../schema/keyframe.js";
import { interpolateKeyframes } from "./interpolator.js";
import { resolveSpriteFrame } from "./sprite-switcher.js";
import { resolveCamera, type ResolvedCamera } from "./camera.js";

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface ResolvedDrawCall {
  /** Asset ID to look up in the asset registry. */
  assetId: string;
  /** For sprite-switched assets: which frame/variant to use. */
  frame?: string;
  /** Absolute world-space transform (parent chain fully resolved). */
  worldTransform: Transform;
  opacity: number;
}

export interface ResolvedLayer {
  id: string;
  type: Layer["type"];
  zIndex: number;
  visible: boolean;
  opacity: number;
  items: ResolvedDrawCall[];
}

export interface ComposedFrame {
  width: number;
  height: number;
  camera: ResolvedCamera;
  layers: ResolvedLayer[];
}

// ─── 2D Affine Matrix ─────────────────────────────────────────────────────────

interface Matrix2D {
  a: number; b: number;
  c: number; d: number;
  tx: number; ty: number;
}

function identityMatrix(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
}

function fromTransform(t: Transform): Matrix2D {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    a: cos * t.scaleX,
    b: sin * t.scaleX,
    c: -sin * t.scaleY,
    d: cos * t.scaleY,
    tx: t.x,
    ty: t.y,
  };
}

function multiplyMatrix(parent: Matrix2D, child: Matrix2D): Matrix2D {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  };
}

function matrixToTransform(m: Matrix2D, original: Transform): Transform {
  const scaleX = Math.sqrt(m.a * m.a + m.b * m.b);
  const scaleY = Math.sqrt(m.c * m.c + m.d * m.d);
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return {
    x: m.tx,
    y: m.ty,
    rotation,
    scaleX,
    scaleY,
    anchorX: original.anchorX ?? 0.5,
    anchorY: original.anchorY ?? 0.5,
  };
}

// ─── Topological Sort for Character Parts ────────────────────────────────────

function topoSortParts(parts: CharacterPart[]): CharacterPart[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const ordered: CharacterPart[] = [];
  const visited = new Set<string>();

  function visit(part: CharacterPart): void {
    if (visited.has(part.id)) return;
    if (part.parentPartId) {
      const parent = byId.get(part.parentPartId);
      if (parent) visit(parent);
    }
    visited.add(part.id);
    ordered.push(part);
  }

  for (const part of parts) visit(part);
  return ordered;
}

// ─── Character Part Resolution ────────────────────────────────────────────────

function resolveCharacterParts(
  charLayer: CharacterLayer,
  currentTime: number,
  layerOpacity: number
): ResolvedDrawCall[] {
  const sortedParts = topoSortParts(charLayer.parts);
  const worldMatrices = new Map<string, Matrix2D>();

  // Character root matrix
  const charTransform = charLayer.keyframes?.length
    ? interpolateKeyframes(charLayer.keyframes, currentTime, charLayer.transform)
    : charLayer.transform;
  const charMatrix = fromTransform(charTransform);
  worldMatrices.set("__root__", charMatrix);

  const drawCalls: ResolvedDrawCall[] = [];

  for (const part of sortedParts) {
    const partTransform = part.keyframes?.length
      ? interpolateKeyframes(part.keyframes, currentTime, part.transform)
      : part.transform;

    const localMatrix = fromTransform(partTransform);
    const parentMatrix = part.parentPartId
      ? (worldMatrices.get(part.parentPartId) ?? charMatrix)
      : charMatrix;

    const worldMatrix = multiplyMatrix(parentMatrix, localMatrix);
    worldMatrices.set(part.id, worldMatrix);

    const worldTransform = matrixToTransform(worldMatrix, partTransform);

    // Main part draw
    if (part.spriteSwitch) {
      const frame = resolveSpriteFrame(
        part.spriteSwitch.keyframes,
        currentTime,
        "X"
      );
      drawCalls.push({
        assetId: part.spriteSwitch.assetId,
        frame,
        worldTransform,
        opacity: layerOpacity,
      });
    } else {
      drawCalls.push({
        assetId: part.assetId,
        worldTransform,
        opacity: layerOpacity,
      });
    }
  }

  return drawCalls;
}

// ─── Frame Compositor ─────────────────────────────────────────────────────────

/**
 * Composes all layers at the given time into a renderable frame description.
 * Does NOT interact with any rendering API — purely data transformation.
 */
export function composeFrame(scene: Scene, currentTime: number): ComposedFrame {
  const camera = resolveCamera(scene.camera, currentTime);

  // Sort layers ascending by zIndex (bottom to top render order)
  const sortedLayers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);

  const resolvedLayers: ResolvedLayer[] = [];

  for (const layer of sortedLayers) {
    if (!layer.visible) {
      resolvedLayers.push({
        id: layer.id,
        type: layer.type,
        zIndex: layer.zIndex,
        visible: false,
        opacity: layer.opacity,
        items: [],
      });
      continue;
    }

    const items: ResolvedDrawCall[] = [];

    if (layer.type === "background") {
      const transform = layer.keyframes?.length
        ? interpolateKeyframes(layer.keyframes, currentTime, layer.transform)
        : layer.transform;
      items.push({ assetId: layer.assetId, worldTransform: transform, opacity: layer.opacity });
    } else if (layer.type === "character") {
      items.push(...resolveCharacterParts(layer, currentTime, layer.opacity));
    } else if (layer.type === "prop") {
      const transform = layer.keyframes?.length
        ? interpolateKeyframes(layer.keyframes, currentTime, layer.transform)
        : layer.transform;
      items.push({ assetId: layer.assetId, worldTransform: transform, opacity: layer.opacity });
    } else if (layer.type === "effect") {
      // Effect layers resolved at render time — pass params via a sentinel draw call
      items.push({
        assetId: `__effect__${layer.effectType}`,
        worldTransform: DefaultTransform,
        opacity: layer.opacity,
      });
    }

    resolvedLayers.push({
      id: layer.id,
      type: layer.type,
      zIndex: layer.zIndex,
      visible: true,
      opacity: layer.opacity,
      items,
    });
  }

  return {
    width: scene.meta.width,
    height: scene.meta.height,
    camera,
    layers: resolvedLayers,
  };
}
