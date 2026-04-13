export { probeBlender, requireBlenderBinary } from "./blender-path.js";
export type { BlenderProbeResult } from "./blender-path.js";

export { buildShotPackage } from "./build-shot.js";
export type {
  BlenderShotManifest,
  BlenderResolvedAsset,
  BlenderResolvedAudioTrack,
  BuildShotPackageOptions,
  BuildShotPackageResult,
} from "./build-shot.js";

export { renderShot } from "./render-shot.js";
export type { RenderShotOptions, RenderShotResult } from "./render-shot.js";
