import type { Keyframe, Transform, EasingType } from "../schema/keyframe.js";
import { DefaultTransform } from "../schema/keyframe.js";

// ─── Easing Functions ─────────────────────────────────────────────────────────

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    t -= 1.5 / d1;
    return n1 * t * t + 0.75;
  } else if (t < 2.5 / d1) {
    t -= 2.25 / d1;
    return n1 * t * t + 0.9375;
  } else {
    t -= 2.625 / d1;
    return n1 * t * t + 0.984375;
  }
}

function elasticOut(t: number): number {
  if (t === 0) return 0;
  if (t === 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;
}

function cubicBezier(t: number, [x1, y1, x2, y2]: [number, number, number, number]): number {
  // Newton-Raphson to find parameter for given x, then evaluate y
  const EPSILON = 1e-6;
  const MAX_ITER = 10;

  function sampleX(s: number): number {
    return 3 * x1 * s * (1 - s) * (1 - s) + 3 * x2 * s * s * (1 - s) + s * s * s;
  }
  function sampleY(s: number): number {
    return 3 * y1 * s * (1 - s) * (1 - s) + 3 * y2 * s * s * (1 - s) + s * s * s;
  }
  function sampleDerivX(s: number): number {
    return 3 * (1 - s) * (1 - s) * x1 + 6 * (1 - s) * s * (x2 - x1) + 3 * s * s * (1 - x2);
  }

  let s = t;
  for (let i = 0; i < MAX_ITER; i++) {
    const xErr = sampleX(s) - t;
    if (Math.abs(xErr) < EPSILON) break;
    const d = sampleDerivX(s);
    if (Math.abs(d) < 1e-10) break;
    s -= xErr / d;
    s = Math.max(0, Math.min(1, s));
  }
  return sampleY(s);
}

export function applyEasing(t: number, easing: EasingType): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (easing === "linear") return t;
  if (easing === "ease-in") return t * t;
  if (easing === "ease-out") return 1 - (1 - t) * (1 - t);
  if (easing === "ease-in-out") {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  if (easing === "bounce") return bounceOut(t);
  if (easing === "elastic") return elasticOut(t);
  if (typeof easing === "object" && easing.type === "cubic-bezier") {
    return cubicBezier(t, easing.points);
  }
  return t;
}

// ─── Rotation Shortest Path ───────────────────────────────────────────────────

function lerpRotation(a: number, b: number, t: number): number {
  // Normalize delta to [-180, 180] to take shortest arc
  const delta = ((((b - a) % 360) + 540) % 360) - 180;
  return a + delta * t;
}

// ─── Linear Interpolation ─────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Main Interpolator ────────────────────────────────────────────────────────

/**
 * Interpolates keyframes at the given currentTime, merging the result onto baseTransform.
 * Only properties present in keyframes are interpolated; others keep the baseTransform value.
 *
 * The easing function of the DESTINATION keyframe describes how you arrive at it
 * (matches CSS/GSAP convention).
 *
 * @param keyframes - Must be sorted ascending by time.
 * @param currentTime - Current playback time in seconds.
 * @param baseTransform - The layer's static transform (used as fallback for unspecified props).
 */
export function interpolateKeyframes(
  keyframes: Keyframe[],
  currentTime: number,
  baseTransform: Transform
): Transform {
  if (!keyframes || keyframes.length === 0) return baseTransform;

  // Clamp to range
  if (currentTime <= keyframes[0].time) {
    return { ...baseTransform, ...keyframes[0].transform };
  }
  if (currentTime >= keyframes[keyframes.length - 1].time) {
    return { ...baseTransform, ...keyframes[keyframes.length - 1].transform };
  }

  // Find bracket
  let beforeIdx = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].time <= currentTime && currentTime < keyframes[i + 1].time) {
      beforeIdx = i;
      break;
    }
  }

  const before = keyframes[beforeIdx];
  const after = keyframes[beforeIdx + 1];
  const duration = after.time - before.time;
  const rawT = duration === 0 ? 1 : (currentTime - before.time) / duration;
  const easedT = applyEasing(rawT, after.easing);

  // Merge: start from base, overlay before keyframe values, then interpolate to after
  const result: Transform = { ...baseTransform };

  // Gather all keys present in either keyframe
  const keys = new Set([
    ...Object.keys(before.transform),
    ...Object.keys(after.transform),
  ]) as Set<keyof Transform>;

  for (const key of keys) {
    const fromVal = (before.transform[key] as number | undefined) ?? (baseTransform[key] as number);
    const toVal = (after.transform[key] as number | undefined) ?? (baseTransform[key] as number);

    if (key === "rotation") {
      (result as Record<string, number>)[key] = lerpRotation(fromVal, toVal, easedT);
    } else {
      (result as Record<string, number>)[key] = lerp(fromVal, toVal, easedT);
    }
  }

  return result;
}

export { DefaultTransform };
