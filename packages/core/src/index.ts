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
