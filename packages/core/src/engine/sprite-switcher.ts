import type { SpriteSwitchKeyframe } from "../schema/keyframe.js";

/**
 * Returns the active sprite frame at the given time using a step function.
 * Returns the last keyframe whose time <= currentTime.
 * Falls back to defaultFrame if no keyframe has fired yet.
 */
export function resolveSpriteFrame(
  keyframes: SpriteSwitchKeyframe[],
  currentTime: number,
  defaultFrame: string
): string {
  if (!keyframes || keyframes.length === 0) return defaultFrame;

  let active = defaultFrame;
  for (const kf of keyframes) {
    if (kf.time <= currentTime) {
      active = kf.frame;
    } else {
      break;
    }
  }
  return active;
}
