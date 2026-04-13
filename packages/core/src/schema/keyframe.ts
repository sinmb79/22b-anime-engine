import { z } from "zod";

// ─── Easing ───────────────────────────────────────────────────────────────────

export const CubicBezierEasingSchema = z.object({
  type: z.literal("cubic-bezier"),
  points: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export const EasingTypeSchema = z.union([
  z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "bounce", "elastic"]),
  CubicBezierEasingSchema,
]);

export type EasingType = z.infer<typeof EasingTypeSchema>;

// ─── Transform ────────────────────────────────────────────────────────────────

export const TransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  rotation: z.number(),      // degrees
  scaleX: z.number(),
  scaleY: z.number(),
  anchorX: z.number().min(0).max(1).default(0.5),
  anchorY: z.number().min(0).max(1).default(0.5),
});

export type Transform = z.infer<typeof TransformSchema>;

export const DefaultTransform: Transform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  anchorX: 0.5,
  anchorY: 0.5,
};

// ─── Keyframe ─────────────────────────────────────────────────────────────────

export const KeyframeSchema = z.object({
  time: z.number().min(0),
  transform: TransformSchema.partial(),
  easing: EasingTypeSchema,
});

export type Keyframe = z.infer<typeof KeyframeSchema>;

// ─── Sprite Switch Keyframe ───────────────────────────────────────────────────

export const SpriteSwitchKeyframeSchema = z.object({
  time: z.number().min(0),
  frame: z.string(),
});

export type SpriteSwitchKeyframe = z.infer<typeof SpriteSwitchKeyframeSchema>;
