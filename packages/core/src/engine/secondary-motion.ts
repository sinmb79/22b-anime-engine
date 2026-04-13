/**
 * Secondary Motion System
 *
 * Auto-generates subtle secondary animations that make cutout animation feel alive:
 * - Breathing: body scale oscillation (scaleY ±2% over 3s loop)
 * - Blink: eye sprite switch every 3-5 seconds
 * - Anticipation: small reverse motion before main action
 *
 * All modifications are additive — existing keyframes are preserved.
 * Returns a new scene; input is never mutated.
 */
import type { Scene } from "../schema/scene.js";
import type { CharacterLayer, CharacterPart } from "../schema/layer.js";
import type { Keyframe } from "../schema/keyframe.js";

export interface SecondaryMotionOptions {
  /** Auto-generate breathing idle loop on body part. Default: true */
  breathing?: boolean;
  /** Auto-generate random eye blinks. Default: true */
  blink?: boolean;
  /** Insert small reverse anticipation motion before large movements. Default: false */
  anticipation?: boolean;
  /**
   * Which character layer IDs to affect.
   * If omitted, applies to all character layers.
   */
  characterIds?: string[];
}

// ─── Breathing ────────────────────────────────────────────────────────────────

/**
 * Generates breathing keyframes for the body part.
 * Oscillates scaleY between 1.0 and 1.02 on a 3-second cycle.
 * Does not add keyframes if body already has scaleY keyframes.
 */
function applyBreathing(part: CharacterPart, duration: number): CharacterPart {
  if (part.id !== "body") return part;

  // Don't override if user already defined scaleY keyframes
  const hasScaleY = part.keyframes?.some(
    (kf) => kf.transform.scaleY !== undefined
  );
  if (hasScaleY) return part;

  const CYCLE = 3.0;
  const breathKfs: Keyframe[] = [];

  for (let t = 0; t <= duration; t += CYCLE / 2) {
    const clamped = Math.min(t, duration);
    const isExpand = Math.round(t / (CYCLE / 2)) % 2 === 1;
    breathKfs.push({
      time: parseFloat(clamped.toFixed(3)),
      transform: { scaleY: isExpand ? 1.02 : 1.0 },
      easing: "ease-in-out",
    });
  }

  // Merge with existing keyframes (breathing only touches scaleY)
  const merged = mergeKeyframes(part.keyframes ?? [], breathKfs);

  return { ...part, keyframes: merged };
}

// ─── Blink ────────────────────────────────────────────────────────────────────

/**
 * Generates random eye blink sprite switch keyframes.
 * Places blinks every 3-5 seconds using a seeded deterministic pattern.
 * Does not add blinks if the eyes part already has spriteSwitch keyframes.
 */
function applyBlink(part: CharacterPart, duration: number): CharacterPart {
  if (part.id !== "eyes" && part.id !== "eye") return part;
  if (!part.spriteSwitch) return part;

  // Don't override if user already defined switch keyframes
  if (part.spriteSwitch.keyframes.length > 0) return part;

  const BLINK_DURATION = 0.1; // seconds: open → closed → open
  const MIN_INTERVAL = 3.0;
  const MAX_INTERVAL = 5.0;

  // Deterministic pseudo-random intervals (seed based on part id)
  const blinkKfs: Array<{ time: number; frame: string }> = [];
  let t = 2.0; // first blink after 2 seconds
  let seed = 42;

  function nextRand(): number {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  }

  while (t < duration) {
    if (t + BLINK_DURATION < duration) {
      blinkKfs.push({ time: parseFloat(t.toFixed(3)), frame: "closed" });
      blinkKfs.push({
        time: parseFloat((t + BLINK_DURATION).toFixed(3)),
        frame: "open",
      });
    }
    t += MIN_INTERVAL + nextRand() * (MAX_INTERVAL - MIN_INTERVAL);
  }

  return {
    ...part,
    spriteSwitch: {
      ...part.spriteSwitch,
      keyframes: blinkKfs,
    },
  };
}

// ─── Anticipation ─────────────────────────────────────────────────────────────

const ANTICIPATION_THRESHOLD_PX = 20; // minimum movement to trigger anticipation
const ANTICIPATION_AMOUNT = 0.15;     // fraction of move distance for reverse
const ANTICIPATION_LEAD_TIME = 0.1;   // seconds before main keyframe

/**
 * Inserts small reverse anticipation keyframes before large positional movements.
 * Example: if char moves right 100px at t=2.0, inserts a -15px keyframe at t=1.9.
 */
function applyAnticipation(keyframes: Keyframe[]): Keyframe[] {
  if (keyframes.length < 2) return keyframes;

  const result: Keyframe[] = [keyframes[0]];

  for (let i = 1; i < keyframes.length; i++) {
    const prev = keyframes[i - 1];
    const curr = keyframes[i];

    const dx = (curr.transform.x ?? 0) - (prev.transform.x ?? 0);
    const dy = (curr.transform.y ?? 0) - (prev.transform.y ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= ANTICIPATION_THRESHOLD_PX) {
      const antiTime = Math.max(
        prev.time + 0.05,
        curr.time - ANTICIPATION_LEAD_TIME
      );

      const antiX = prev.transform.x !== undefined
        ? prev.transform.x - dx * ANTICIPATION_AMOUNT
        : undefined;
      const antiY = prev.transform.y !== undefined
        ? prev.transform.y - dy * ANTICIPATION_AMOUNT
        : undefined;

      if (antiTime < curr.time) {
        result.push({
          time: parseFloat(antiTime.toFixed(3)),
          transform: {
            ...(antiX !== undefined && { x: antiX }),
            ...(antiY !== undefined && { y: antiY }),
          },
          easing: "ease-in",
        });
      }
    }

    result.push(curr);
  }

  return result;
}

// ─── Keyframe Merge ───────────────────────────────────────────────────────────

/**
 * Merges two keyframe arrays, combining transform properties at the same time.
 * User keyframes take precedence over generated ones for conflicting properties.
 */
function mergeKeyframes(user: Keyframe[], generated: Keyframe[]): Keyframe[] {
  const timeMap = new Map<number, Keyframe>();

  for (const kf of generated) {
    timeMap.set(kf.time, kf);
  }
  for (const kf of user) {
    const existing = timeMap.get(kf.time);
    if (existing) {
      // User transform takes precedence over generated
      timeMap.set(kf.time, {
        ...existing,
        transform: { ...existing.transform, ...kf.transform },
        easing: kf.easing,
      });
    } else {
      timeMap.set(kf.time, kf);
    }
  }

  return [...timeMap.values()].sort((a, b) => a.time - b.time);
}

// ─── Apply to Character Layer ─────────────────────────────────────────────────

function applyToCharacter(
  layer: CharacterLayer,
  duration: number,
  options: SecondaryMotionOptions
): CharacterLayer {
  let parts = layer.parts.map((part) => {
    let p = part;
    if (options.breathing !== false) p = applyBreathing(p, duration);
    if (options.blink !== false) p = applyBlink(p, duration);
    return p;
  });

  let layerKeyframes = layer.keyframes ?? [];
  if (options.anticipation) {
    layerKeyframes = applyAnticipation(layerKeyframes);
  }

  return { ...layer, parts, keyframes: layerKeyframes };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a new scene with secondary motion keyframes injected.
 * Input scene is not mutated.
 *
 * @param scene - Validated Scene object
 * @param options - Which secondary motions to apply and to which characters
 */
export function applySecondaryMotion(
  scene: Scene,
  options: SecondaryMotionOptions = {}
): Scene {
  const targetIds = options.characterIds
    ? new Set(options.characterIds)
    : null;

  const layers = scene.layers.map((layer) => {
    if (layer.type !== "character") return layer;
    if (targetIds && !targetIds.has(layer.id)) return layer;
    return applyToCharacter(layer, scene.meta.duration, options);
  });

  return { ...scene, layers };
}
