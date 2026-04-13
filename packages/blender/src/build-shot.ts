import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  preflightValidate,
  validateScene,
  type Scene,
} from "@22b/anime-core";

export interface BlenderResolvedAsset {
  id: string;
  type: "image" | "spritesheet" | "audio";
  sourcePath?: string;
  absolutePath?: string;
  exists: boolean;
  framePaths?: Record<string, string>;
}

export interface BlenderResolvedAudioTrack {
  id: string;
  type: "voice" | "bgm" | "sfx";
  source: string;
  absolutePath: string;
  exists: boolean;
  startTime: number;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
}

export interface BlenderShotManifest {
  version: "1.0";
  secureMode: true;
  generatedAt: string;
  sourceScenePath: string;
  sceneDir: string;
  render: {
    title: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    totalFrames: number;
    outputStem: string;
  };
  scene: Scene;
  assets: BlenderResolvedAsset[];
  audioTracks: BlenderResolvedAudioTrack[];
  unsupportedFeatures: string[];
  warnings: string[];
}

export interface BuildShotPackageOptions {
  scenePath: string;
  outputDir: string;
}

export interface BuildShotPackageResult {
  outputDir: string;
  manifestPath: string;
  scriptPath: string;
  manifest: BlenderShotManifest;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(moduleDir, "..", "templates");

function formatIssues(prefix: string, issues: Array<{ path: string; message: string }>): string {
  return issues.map((issue) => `${prefix} ${issue.path}: ${issue.message}`).join("\n");
}

function resolveFramePaths(
  sceneDir: string,
  frames?: Record<string, { path?: string }>
): Record<string, string> | undefined {
  if (!frames) return undefined;

  const resolvedEntries = Object.entries(frames)
    .filter(([, frame]) => frame.path)
    .map(([name, frame]) => [name, resolve(sceneDir, frame.path as string)] as const);

  return resolvedEntries.length > 0 ? Object.fromEntries(resolvedEntries) : undefined;
}

function resolveAssets(scene: Scene, sceneDir: string): BlenderResolvedAsset[] {
  return scene.assets.map((asset) => {
    const absolutePath = asset.source.path ? resolve(sceneDir, asset.source.path) : undefined;
    return {
      id: asset.id,
      type: asset.type,
      sourcePath: asset.source.path,
      absolutePath,
      exists: absolutePath ? existsSync(absolutePath) : false,
      framePaths: resolveFramePaths(sceneDir, asset.frames),
    };
  });
}

function resolveAudio(scene: Scene, sceneDir: string): BlenderResolvedAudioTrack[] {
  return scene.audio.map((track) => {
    const absolutePath = resolve(sceneDir, track.source);
    return {
      id: track.id,
      type: track.type,
      source: track.source,
      absolutePath,
      exists: existsSync(absolutePath),
      startTime: track.startTime,
      volume: track.volume,
      fadeIn: track.fadeIn,
      fadeOut: track.fadeOut,
      loop: track.loop,
    };
  });
}

function collectUnsupportedFeatures(scene: Scene): string[] {
  const unsupported = new Set<string>();

  if (scene.layers.some((layer) => layer.type === "effect")) {
    unsupported.add("effect layers are not mapped into Blender yet");
  }
  if (scene.layers.some((layer) => layer.type === "character" && layer.parts.some((part) => part.spriteSwitch))) {
    unsupported.add("spriteSwitch animation is not mapped into Blender yet");
  }
  if (scene.assets.some((asset) => asset.source.assetDb)) {
    unsupported.add("assetDb lookups must be resolved before Blender build");
  }
  if (scene.assets.some((asset) => asset.source.generate)) {
    unsupported.add("generate-backed assets must be materialized to files before Blender build");
  }
  if (scene.camera.keyframes.some((keyframe) => keyframe.shake)) {
    unsupported.add("camera shake metadata is not mapped into Blender yet");
  }

  return [...unsupported];
}

function buildReadme(manifest: BlenderShotManifest): string {
  const unsupportedSection = manifest.unsupportedFeatures.length > 0
    ? manifest.unsupportedFeatures.map((item) => `- ${item}`).join("\n")
    : "- none";

  return [
    "# Blender Shot Package",
    "",
    `Source scene: \`${manifest.sourceScenePath}\``,
    `Title: ${manifest.render.title}`,
    "",
    "This package was generated for a local-first secure render path.",
    "It contains a normalized scene manifest and a Blender Python entrypoint.",
    "",
    "## Files",
    "",
    "- `manifest.json` : normalized scene + resolved local asset paths",
    "- `scene.normalized.json` : schema-validated scene JSON",
    "- `scripts/render-shot.py` : Blender headless render entrypoint",
    "- `frames/` : PNG sequence output target",
    "",
    "## Unsupported Features",
    "",
    unsupportedSection,
    "",
  ].join("\n");
}

export async function buildShotPackage(options: BuildShotPackageOptions): Promise<BuildShotPackageResult> {
  const sourceScenePath = resolve(options.scenePath);
  const sceneDir = dirname(sourceScenePath);
  const outputDir = resolve(options.outputDir);

  const rawText = await readFile(sourceScenePath, "utf8");
  const raw = JSON.parse(rawText.replace(/^\uFEFF/, "")) as unknown;
  const preflight = preflightValidate(raw, sourceScenePath);
  if (!preflight.valid) {
    throw new Error(formatIssues("ERROR", preflight.errors));
  }

  const scene = validateScene(raw);
  const manifest: BlenderShotManifest = {
    version: "1.0",
    secureMode: true,
    generatedAt: new Date().toISOString(),
    sourceScenePath,
    sceneDir,
    render: {
      title: scene.meta.title,
      width: scene.meta.width,
      height: scene.meta.height,
      fps: scene.meta.fps,
      duration: scene.meta.duration,
      totalFrames: Math.max(1, Math.ceil(scene.meta.duration * scene.meta.fps)),
      outputStem: basename(sourceScenePath, extname(sourceScenePath)),
    },
    scene,
    assets: resolveAssets(scene, sceneDir),
    audioTracks: resolveAudio(scene, sceneDir),
    unsupportedFeatures: collectUnsupportedFeatures(scene),
    warnings: preflight.warnings.map((warning) => `${warning.path}: ${warning.message}`),
  };

  const scriptsDir = join(outputDir, "scripts");
  const framesDir = join(outputDir, "frames");
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(framesDir, { recursive: true });

  const manifestPath = join(outputDir, "manifest.json");
  const normalizedScenePath = join(outputDir, "scene.normalized.json");
  const readmePath = join(outputDir, "README.md");
  const scriptPath = join(scriptsDir, "render-shot.py");

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(normalizedScenePath, JSON.stringify(scene, null, 2), "utf8");
  await writeFile(readmePath, buildReadme(manifest), "utf8");
  await copyFile(join(templateDir, "render-shot.py"), scriptPath);

  return {
    outputDir,
    manifestPath,
    scriptPath,
    manifest,
  };
}
