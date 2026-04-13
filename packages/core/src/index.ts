// Schema types
export type { Scene, SceneMeta, AssetRef, CameraTrack, CameraKeyframe } from "./schema/scene.js";
export type { Layer, BackgroundLayer, CharacterLayer, CharacterPart, PropLayer, EffectLayer } from "./schema/layer.js";
export type { Transform, Keyframe, SpriteSwitchKeyframe, EasingType } from "./schema/keyframe.js";
export type { AudioTrack, LipSyncCue, LipSync } from "./schema/audio.js";

// Schema constants
export { DefaultTransform } from "./schema/keyframe.js";

// Validation
export { validateScene, preflightValidate, ValidationError } from "./schema/validate.js";
export type { ValidationIssue, PreflightResult, IssueSeverity } from "./schema/validate.js";

// Engine
export { interpolateKeyframes, applyEasing } from "./engine/interpolator.js";
export { resolveSpriteFrame } from "./engine/sprite-switcher.js";
export { resolveCamera } from "./engine/camera.js";
export type { ResolvedCamera } from "./engine/camera.js";
export { composeFrame } from "./engine/compositor.js";
export type { ComposedFrame, ResolvedLayer, ResolvedDrawCall } from "./engine/compositor.js";
export { frameIterator } from "./engine/timeline.js";
export type { FrameState } from "./engine/timeline.js";

// Secondary motion
export { applySecondaryMotion } from "./engine/secondary-motion.js";
export type { SecondaryMotionOptions } from "./engine/secondary-motion.js";

// Narrative planning
export {
  NarrativePayloadSchema,
  NarrativeBeatSchema,
  SceneArchetypeSchema,
  ShotTypeSchema,
  CameraMoveSchema,
} from "./pipeline/narrative.js";
export type {
  NarrativePayload,
  NarrativeBeat,
  SceneArchetype,
  ShotType,
  CameraMove,
} from "./pipeline/narrative.js";
export {
  parseScenarioMarkdown,
  buildNarrativePayloadFromScenarioScene,
} from "./pipeline/scenario-markdown.js";
export type {
  ScenarioMetadata,
  ScenarioDialogueLine,
  ScenarioScene,
  ScenarioDocument,
} from "./pipeline/scenario-markdown.js";
export {
  ScenePlanSchema,
  ReviewStageSchema,
  PromptPacketStageSchema,
  PromptPacketSchema,
  ReviewGateSchema,
  AssetRequestSchema,
  ShotPlanSchema,
} from "./pipeline/scene-plan.js";
export type {
  ScenePlan,
  ReviewStage,
  PromptPacketStage,
  PromptPacket,
  ReviewGate,
  AssetRequest,
  ShotPlan,
} from "./pipeline/scene-plan.js";
export {
  AssetCatalogEntrySchema,
  AssetCatalogSchema,
  buildDefaultAssetCatalog,
  loadAssetCatalog,
} from "./pipeline/asset-catalog.js";
export type { AssetCatalogEntry, AssetCatalog } from "./pipeline/asset-catalog.js";
export { validateNarrativePayload, buildScenePlan } from "./pipeline/build-scene-plan.js";
export { compileSceneFromPlan } from "./pipeline/compile-scene.js";
export type { CompileSceneOptions, CompiledSceneResult } from "./pipeline/compile-scene.js";
