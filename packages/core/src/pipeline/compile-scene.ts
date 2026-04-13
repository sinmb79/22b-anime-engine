import { dirname, relative, resolve } from "node:path";
import { SceneSchema, type AssetRef, type Scene } from "../schema/scene.js";
import type { BackgroundLayer, CharacterLayer, PropLayer } from "../schema/layer.js";
import type { Keyframe } from "../schema/keyframe.js";
import { DefaultTransform } from "../schema/keyframe.js";
import { validateScene, preflightValidate } from "../schema/validate.js";
import { applySecondaryMotion } from "../engine/secondary-motion.js";
import { ScenePlanSchema, type ScenePlan, type ShotPlan } from "./scene-plan.js";
import {
  buildDefaultAssetCatalog,
  loadAssetCatalog,
  type AssetCatalog,
  type AssetCatalogEntry,
} from "./asset-catalog.js";

export interface CompileSceneOptions {
  plan: unknown;
  outputPath: string;
  workspaceRoot?: string;
  assetCatalog?: unknown;
  assetCatalogPath?: string;
  width?: number;
  height?: number;
  fps?: number;
  applySecondaryMotion?: boolean;
  allowUnresolved?: boolean;
}

export interface CompiledSceneResult {
  scene: Scene;
  warnings: string[];
  unresolved: Array<{ kind: string; name: string; reason: string }>;
}

const EPSILON = 0.01;

function normalizeKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/giu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function makeRelativeAssetPath(outputPath: string, assetPath: string): string {
  return relative(dirname(resolve(outputPath)), resolve(assetPath)).split("\\").join("/");
}

function scoreEntry(entry: AssetCatalogEntry, requestName: string, preferredAlias?: string): number {
  const request = normalizeKey(requestName);
  const preferred = preferredAlias ? normalizeKey(preferredAlias) : undefined;
  const candidates = [entry.id, entry.name, ...entry.aliases].map(normalizeKey);
  let score = 0;

  if (preferred && candidates.includes(preferred)) score = Math.max(score, 100);
  if (candidates.includes(request)) score = Math.max(score, 90);
  if (candidates.some((candidate) => request.includes(candidate) || candidate.includes(request))) score = Math.max(score, 70);
  return score;
}

function resolveCatalogEntry(
  catalog: AssetCatalog,
  kind: AssetCatalogEntry["kind"],
  requestName: string,
  preferredAlias?: string
): AssetCatalogEntry | undefined {
  let best: AssetCatalogEntry | undefined;
  let bestScore = 0;

  for (const entry of catalog.assets) {
    if (entry.kind !== kind) continue;
    const score = scoreEntry(entry, requestName, preferredAlias);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return bestScore > 0 ? best : undefined;
}

function dedupeKeyframes(keyframes: Keyframe[]): Keyframe[] {
  const map = new Map<number, Keyframe>();
  for (const keyframe of keyframes) {
    map.set(round(keyframe.time), {
      ...keyframe,
      time: round(keyframe.time),
    });
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

function baseScaleForShot(shot: ShotPlan, defaultScale: number): number {
  switch (shot.shotType) {
    case "wide":
      return defaultScale * 0.88;
    case "closeup":
      return defaultScale * 1.24;
    case "action":
      return defaultScale * 1.08;
    case "insert":
      return defaultScale * 0.72;
    default:
      return defaultScale;
  }
}

function baseYForShot(shot: ShotPlan, height: number): number {
  if (shot.shotType === "wide") return height * 0.84;
  if (shot.shotType === "closeup") return height * 0.9;
  return height * 0.86;
}

function slotPositions(count: number): number[] {
  if (count <= 1) return [0.5];
  if (count === 2) return [0.34, 0.66];
  if (count === 3) return [0.2, 0.5, 0.8];
  return [0.12, 0.38, 0.62, 0.88];
}

function buildBackgroundKeyframes(index: number, backgrounds: Array<{ activeShots: Set<string> }>, shots: ShotPlan[]): Keyframe[] {
  const activeShots = backgrounds[index].activeShots;
  const keyframes: Keyframe[] = [{
    time: 0,
    transform: {
      scaleX: activeShots.has(shots[0]?.id ?? "") ? 1 : 0.0001,
      scaleY: activeShots.has(shots[0]?.id ?? "") ? 1 : 0.0001,
    },
    easing: "linear",
  }];

  let previousActive = activeShots.has(shots[0]?.id ?? "");
  for (const shot of shots) {
    const active = activeShots.has(shot.id);
    if (active !== previousActive) {
      keyframes.push({
        time: round(shot.startTimeSec),
        transform: { scaleX: active ? 1 : 0.0001, scaleY: active ? 1 : 0.0001 },
        easing: "linear",
      });
      previousActive = active;
    }
  }

  return dedupeKeyframes(keyframes);
}

function buildCharacterKeyframes(
  name: string,
  characterIndex: number,
  shots: ShotPlan[],
  width: number,
  height: number,
  defaultScale: number
): Keyframe[] {
  const offscreenX = characterIndex % 2 === 0 ? -width * 0.24 : width * 1.24;
  const initialActive = shots[0]?.characters.includes(name) ?? false;
  const keyframes: Keyframe[] = [{
    time: 0,
    transform: {
      x: initialActive ? width * 0.5 : offscreenX,
      y: baseYForShot(shots[0], height),
      scaleX: initialActive ? baseScaleForShot(shots[0], defaultScale) : defaultScale,
      scaleY: initialActive ? baseScaleForShot(shots[0], defaultScale) : defaultScale,
    },
    easing: "linear",
  }];

  for (const shot of shots) {
    const activeCharacters = shot.characters;
    const isActive = activeCharacters.includes(name);
    const positions = slotPositions(Math.max(1, activeCharacters.length));
    const positionIndex = Math.max(0, activeCharacters.indexOf(name));
    const targetX = isActive ? width * positions[Math.min(positionIndex, positions.length - 1)] : offscreenX;
    const targetY = baseYForShot(shot, height);
    const targetScale = baseScaleForShot(shot, defaultScale);

    if (isActive) {
      const enterTime = round(shot.startTimeSec);
      const settleTime = round(Math.min(shot.endTimeSec, shot.startTimeSec + (shot.shotType === "action" ? 0.35 : 0.12)));
      keyframes.push({
        time: enterTime,
        transform: {
          x: shot.shotType === "action" ? offscreenX : targetX,
          y: targetY,
          scaleX: targetScale,
          scaleY: targetScale,
        },
        easing: shot.shotType === "action" ? "ease-in" : "ease-in-out",
      });
      keyframes.push({
        time: settleTime,
        transform: { x: targetX, y: targetY, scaleX: targetScale, scaleY: targetScale },
        easing: "ease-out",
      });
      keyframes.push({
        time: round(Math.max(shot.startTimeSec, shot.endTimeSec - EPSILON)),
        transform: { x: targetX, y: targetY, scaleX: targetScale, scaleY: targetScale },
        easing: "linear",
      });
    } else {
      keyframes.push({
        time: round(shot.startTimeSec),
        transform: { x: offscreenX, y: targetY, scaleX: defaultScale, scaleY: defaultScale },
        easing: "ease-in-out",
      });
    }
  }

  return dedupeKeyframes(keyframes);
}

function buildPropKeyframes(name: string, shots: ShotPlan[], width: number, height: number, defaultScale: number): Keyframe[] {
  const keyframes: Keyframe[] = [{
    time: 0,
    transform: { x: width * 0.5, y: height * 0.34, scaleX: 0.0001, scaleY: 0.0001 },
    easing: "linear",
  }];

  for (const shot of shots) {
    const active = shot.props.includes(name);
    const targetScale = active ? defaultScale : 0.0001;
    keyframes.push({
      time: round(shot.startTimeSec),
      transform: {
        x: width * 0.5,
        y: height * (shot.shotType === "insert" ? 0.45 : 0.34),
        scaleX: targetScale,
        scaleY: targetScale,
      },
      easing: active ? "ease-in-out" : "linear",
    });
  }

  return dedupeKeyframes(keyframes);
}

function buildCameraTrack(shots: ShotPlan[], width: number, height: number): Scene["camera"] {
  const first = shots[0];
  const initialZoom = first ? (first.shotType === "wide" ? 1 : first.shotType === "closeup" ? 1.18 : 1.08) : 1;
  const keyframes: Scene["camera"]["keyframes"] = [];

  for (const shot of shots) {
    const baseZoom = shot.shotType === "wide"
      ? 1
      : shot.shotType === "closeup"
        ? 1.22
        : shot.shotType === "action"
          ? 1.12
          : shot.shotType === "insert"
            ? 1.28
            : 1.1;
    const start = round(shot.startTimeSec);
    const end = round(Math.max(shot.startTimeSec, shot.endTimeSec - EPSILON));
    const panOffset = shot.cameraMove === "pan" ? 60 : shot.cameraMove === "follow" ? 90 : shot.cameraMove === "drift" ? 40 : 0;
    const startX = width / 2 - panOffset;
    const endX = width / 2 + panOffset;
    const zoomInDelta = shot.cameraMove === "push_in" ? 0.08 : shot.cameraMove === "drift" ? 0.04 : 0;

    keyframes.push({ time: start, x: startX, y: height / 2, zoom: round(baseZoom), easing: "ease-in-out" });
    keyframes.push({ time: end, x: endX, y: height / 2, zoom: round(baseZoom + zoomInDelta), easing: "ease-in-out" });
  }

  const deduped = new Map<number, Scene["camera"]["keyframes"][number]>();
  for (const keyframe of keyframes) {
    deduped.set(round(keyframe.time), { ...keyframe, time: round(keyframe.time) });
  }

  return {
    initialTransform: { x: width / 2, y: height / 2, zoom: initialZoom },
    keyframes: [...deduped.values()].sort((a, b) => a.time - b.time),
  };
}

export function compileSceneFromPlan(options: CompileSceneOptions): CompiledSceneResult {
  const plan = ScenePlanSchema.parse(options.plan);
  const outputPath = resolve(options.outputPath);
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const catalog = options.assetCatalog
    ? {
        version: "1.0" as const,
        assets: [
          ...loadAssetCatalog(options.assetCatalog, options.assetCatalogPath).assets,
          ...buildDefaultAssetCatalog(workspaceRoot).assets,
        ],
      }
    : buildDefaultAssetCatalog(workspaceRoot);
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const fps = options.fps ?? 24;
  const warnings: string[] = [];
  const unresolved: CompiledSceneResult["unresolved"] = [];
  const assets: AssetRef[] = [];
  const layers: Scene["layers"] = [];
  const assetIds = new Set<string>();

  function pushAsset(asset: AssetRef): void {
    if (assetIds.has(asset.id)) return;
    assets.push(asset);
    assetIds.add(asset.id);
  }

  const backgroundGroups = unique(plan.shots.map((shot) => `${shot.backgroundCode ?? ""}::${shot.location ?? plan.payload.location ?? "scene"}`)).map((key) => {
    const [backgroundCode, location] = key.split("::");
    return {
      backgroundCode: backgroundCode || undefined,
      location,
      activeShots: new Set(plan.shots.filter((shot) => `${shot.backgroundCode ?? ""}::${shot.location ?? plan.payload.location ?? "scene"}` === key).map((shot) => shot.id)),
    };
  });

  backgroundGroups.forEach((group, index) => {
    const resolved = resolveCatalogEntry(catalog, "background", group.location, group.backgroundCode);
    if (!resolved) {
      const reason = `No background mapping found for ${group.backgroundCode ?? group.location}`;
      if (!options.allowUnresolved) throw new Error(reason);
      unresolved.push({ kind: "background", name: group.location, reason });
      return;
    }

    pushAsset({
      id: resolved.id,
      type: "image",
      source: resolved.path ? { path: makeRelativeAssetPath(outputPath, resolved.path) } : { assetDb: resolved.assetDb ?? resolved.id },
    });

    const layer: BackgroundLayer = {
      id: `bg_layer_${index}`,
      type: "background",
      visible: true,
      opacity: 1,
      zIndex: index,
      assetId: resolved.id,
      transform: { ...DefaultTransform, x: width / 2, y: height / 2, scaleX: 1, scaleY: 1 },
      keyframes: backgroundGroups.length > 1 ? buildBackgroundKeyframes(index, backgroundGroups.map((entry) => ({ activeShots: entry.activeShots })), plan.shots) : undefined,
    };
    layers.push(layer);
  });

  const characterNames = unique(plan.shots.flatMap((shot) => shot.characters));
  characterNames.forEach((name, index) => {
    const resolved = resolveCatalogEntry(catalog, "character", name);
    if (!resolved) {
      const reason = `No character mapping found for ${name}`;
      if (!options.allowUnresolved) throw new Error(reason);
      unresolved.push({ kind: "character", name, reason });
      return;
    }

    pushAsset({
      id: resolved.id,
      type: "image",
      source: resolved.path ? { path: makeRelativeAssetPath(outputPath, resolved.path) } : { assetDb: resolved.assetDb ?? resolved.id },
    });

    const defaultScale = resolved.defaultScale ?? 0.34;
    const layer: CharacterLayer = {
      id: `char_${slugify(name)}`,
      type: "character",
      visible: true,
      opacity: 1,
      zIndex: 10 + index,
      pivot: { x: width / 2, y: height / 2 },
      transform: { ...DefaultTransform, x: width / 2, y: height * 0.86, scaleX: defaultScale, scaleY: defaultScale, anchorY: resolved.anchorY ?? 0.85 },
      keyframes: buildCharacterKeyframes(name, index, plan.shots, width, height, defaultScale),
      parts: [{
        id: "body",
        assetId: resolved.id,
        pivot: { x: 0.5, y: resolved.anchorY ?? 0.85 },
        transform: { ...DefaultTransform, anchorY: resolved.anchorY ?? 0.85 },
      }],
    };
    layers.push(layer);
  });

  const propNames = unique(plan.shots.flatMap((shot) => shot.props)).filter((name) => !characterNames.includes(name));
  propNames.forEach((name, index) => {
    const resolved = resolveCatalogEntry(catalog, "prop", name);
    if (!resolved) {
      unresolved.push({ kind: "prop", name, reason: `No prop mapping found for ${name}` });
      warnings.push(`Prop "${name}" is unresolved and will be skipped in previz compile.`);
      return;
    }

    pushAsset({
      id: resolved.id,
      type: "image",
      source: resolved.path ? { path: makeRelativeAssetPath(outputPath, resolved.path) } : { assetDb: resolved.assetDb ?? resolved.id },
    });

    const defaultScale = resolved.defaultScale ?? 0.16;
    const layer: PropLayer = {
      id: `prop_${slugify(name)}`,
      type: "prop",
      visible: true,
      opacity: 1,
      zIndex: 30 + index,
      assetId: resolved.id,
      pivot: { x: 0.5, y: resolved.anchorY ?? 0.5 },
      transform: { ...DefaultTransform, x: width / 2, y: height * 0.34, scaleX: defaultScale, scaleY: defaultScale },
      keyframes: buildPropKeyframes(name, plan.shots, width, height, defaultScale),
    };
    layers.push(layer);
  });

  const baseScene: Scene = {
    version: "1.0",
    meta: { title: plan.payload.title, fps, width, height, duration: round(plan.totalDurationSec) },
    assets,
    layers,
    camera: buildCameraTrack(plan.shots, width, height),
    audio: [],
  };

  const scene = options.applySecondaryMotion === false
    ? baseScene
    : applySecondaryMotion(baseScene, { breathing: true, blink: false, anticipation: true });

  const validated = validateScene(scene);
  const preflight = preflightValidate(validated, outputPath);
  if (!preflight.valid) {
    throw new Error(preflight.errors.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }

  return {
    scene: SceneSchema.parse(validated),
    warnings,
    unresolved,
  };
}
