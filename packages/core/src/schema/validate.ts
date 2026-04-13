import { ZodError } from "zod";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { SceneSchema, type Scene } from "./scene.js";
import type { Layer } from "./layer.js";

// ─── Validation Error ─────────────────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(public readonly details: string) {
    super(`Scene validation failed:\n${details}`);
    this.name = "ValidationError";
  }
}

// ─── Preflight Issue ──────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  path: string;
  message: string;
  fix?: string;
}

export interface PreflightResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** All issues (errors + warnings) in order of detection. */
  issues: ValidationIssue[];
}

// ─── Format Zod Error ─────────────────────────────────────────────────────────

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `  [${path}] ${issue.message}`;
    })
    .join("\n");
}

// ─── Preflight Checks ─────────────────────────────────────────────────────────

function checkAssetReferences(scene: Scene, sceneDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const definedAssetIds = new Set(scene.assets.map((a) => a.id));

  // Check all assetId references in layers resolve to defined assets
  function checkAssetId(assetId: string, path: string): void {
    if (!definedAssetIds.has(assetId)) {
      issues.push({
        severity: "error",
        code: "ASSET_REF_MISSING",
        path,
        message: `assetId "${assetId}" is not defined in scene.assets`,
        fix: `Add an entry with id "${assetId}" to the scene assets array`,
      });
    }
  }

  for (const layer of scene.layers) {
    if (layer.type === "background") {
      checkAssetId(layer.assetId, `layer[${layer.id}].assetId`);
    } else if (layer.type === "character") {
      for (const part of layer.parts) {
        if (part.spriteSwitch) {
          checkAssetId(part.spriteSwitch.assetId, `layer[${layer.id}].parts[${part.id}].spriteSwitch.assetId`);
        } else {
          checkAssetId(part.assetId, `layer[${layer.id}].parts[${part.id}].assetId`);
        }
      }
    } else if (layer.type === "prop") {
      checkAssetId(layer.assetId, `layer[${layer.id}].assetId`);
    }
  }

  // Check asset files exist on disk (only for path-based assets)
  for (const asset of scene.assets) {
    if (asset.type === "audio") continue;
    if (!asset.source.path) continue;

    const absPath = resolve(sceneDir, asset.source.path);
    if (!existsSync(absPath)) {
      issues.push({
        severity: "error",
        code: "ASSET_FILE_MISSING",
        path: `assets[${asset.id}].source.path`,
        message: `File not found: ${absPath}`,
        fix: `Place the file at "${absPath}" or update source.path`,
      });
    }
  }

  // Check audio files exist
  for (const track of scene.audio) {
    const absPath = resolve(sceneDir, track.source);
    if (!existsSync(absPath)) {
      issues.push({
        severity: "error",
        code: "AUDIO_FILE_MISSING",
        path: `audio[${track.id}].source`,
        message: `Audio file not found: ${absPath}`,
        fix: `Place the audio file at "${absPath}" or update source`,
      });
    }
  }

  return issues;
}

function checkTimelineConsistency(scene: Scene): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  function checkKeyframeOrder(keyframes: Array<{ time: number }>, path: string): void {
    for (let i = 1; i < keyframes.length; i++) {
      if (keyframes[i].time < keyframes[i - 1].time) {
        issues.push({
          severity: "error",
          code: "KEYFRAME_NOT_SORTED",
          path,
          message: `Keyframe at index ${i} (time=${keyframes[i].time}) is before keyframe ${i - 1} (time=${keyframes[i - 1].time})`,
          fix: "Sort keyframes by time in ascending order",
        });
      }
      if (keyframes[i].time === keyframes[i - 1].time) {
        issues.push({
          severity: "warning",
          code: "KEYFRAME_DUPLICATE_TIME",
          path,
          message: `Two keyframes share time=${keyframes[i].time} at indices ${i - 1} and ${i}`,
          fix: "Remove duplicate keyframe or use different times",
        });
      }
    }
  }

  function checkKeyframeRange(keyframes: Array<{ time: number }>, duration: number, path: string): void {
    for (const kf of keyframes) {
      if (kf.time > duration) {
        issues.push({
          severity: "warning",
          code: "KEYFRAME_OUT_OF_RANGE",
          path,
          message: `Keyframe at time=${kf.time} exceeds scene duration (${duration}s)`,
          fix: "Remove keyframe or extend scene duration",
        });
      }
    }
  }

  for (const layer of scene.layers) {
    if (layer.keyframes?.length) {
      checkKeyframeOrder(layer.keyframes, `layer[${layer.id}].keyframes`);
      checkKeyframeRange(layer.keyframes, scene.meta.duration, `layer[${layer.id}].keyframes`);
    }

    if (layer.type === "character") {
      for (const part of layer.parts) {
        if (part.keyframes?.length) {
          checkKeyframeOrder(part.keyframes, `layer[${layer.id}].parts[${part.id}].keyframes`);
          checkKeyframeRange(part.keyframes, scene.meta.duration, `layer[${layer.id}].parts[${part.id}].keyframes`);
        }
        if (part.spriteSwitch?.keyframes.length) {
          checkKeyframeOrder(part.spriteSwitch.keyframes, `layer[${layer.id}].parts[${part.id}].spriteSwitch.keyframes`);
        }
      }
    }
  }

  if (scene.camera.keyframes.length) {
    checkKeyframeOrder(scene.camera.keyframes, "camera.keyframes");
    checkKeyframeRange(scene.camera.keyframes, scene.meta.duration, "camera.keyframes");
  }

  return issues;
}

function checkZIndexUniqueness(scene: Scene): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<number, string>();

  for (const layer of scene.layers) {
    if (seen.has(layer.zIndex)) {
      issues.push({
        severity: "warning",
        code: "ZINDEX_DUPLICATE",
        path: `layer[${layer.id}].zIndex`,
        message: `zIndex ${layer.zIndex} is shared with layer "${seen.get(layer.zIndex)}"`,
        fix: "Assign unique zIndex values to avoid ambiguous render order",
      });
    } else {
      seen.set(layer.zIndex, layer.id);
    }
  }

  return issues;
}

function checkCharacterHierarchy(scene: Scene): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const layer of scene.layers) {
    if (layer.type !== "character") continue;
    const partIds = new Set(layer.parts.map((p) => p.id));

    for (const part of layer.parts) {
      if (part.parentPartId && !partIds.has(part.parentPartId)) {
        issues.push({
          severity: "error",
          code: "PARENT_PART_MISSING",
          path: `layer[${layer.id}].parts[${part.id}].parentPartId`,
          message: `parentPartId "${part.parentPartId}" does not exist in this character's parts`,
          fix: `Add a part with id "${part.parentPartId}" or remove parentPartId`,
        });
      }
    }
  }

  return issues;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates a raw unknown value as a Scene JSON (schema only).
 * Throws ValidationError on failure.
 */
export function validateScene(raw: unknown): Scene {
  const result = SceneSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(formatZodError(result.error));
  }
  return result.data;
}

/**
 * Full 5-stage preflight validation:
 *   1. Schema validation (Zod)
 *   2. Asset reference integrity (all assetIds defined)
 *   3. Asset file existence (files on disk)
 *   4. Timeline consistency (keyframe order, range)
 *   5. Layer z-index uniqueness
 *   +  Character hierarchy integrity
 *
 * @param raw - Raw JSON (unknown type)
 * @param scenePath - Absolute path to the scene JSON file (used to resolve relative asset paths)
 * @returns PreflightResult — always returns, never throws
 */
export function preflightValidate(raw: unknown, scenePath: string): PreflightResult {
  const issues: ValidationIssue[] = [];

  // Stage 1: Schema
  const schemaResult = SceneSchema.safeParse(raw);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      issues.push({
        severity: "error",
        code: "SCHEMA_" + issue.code.toUpperCase(),
        path,
        message: issue.message,
      });
    }
    // Cannot continue without a valid scene object
    const errors = issues.filter((i) => i.severity === "error");
    return { valid: false, errors, warnings: [], issues };
  }

  const scene = schemaResult.data;
  const sceneDir = dirname(resolve(scenePath));

  // Stage 2-3: Asset references and file existence
  issues.push(...checkAssetReferences(scene, sceneDir));

  // Stage 4: Timeline consistency
  issues.push(...checkTimelineConsistency(scene));

  // Stage 5: Z-index uniqueness
  issues.push(...checkZIndexUniqueness(scene));

  // Stage +: Character hierarchy
  issues.push(...checkCharacterHierarchy(scene));

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
  };
}
