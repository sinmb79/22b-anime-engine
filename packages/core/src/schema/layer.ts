import { z } from "zod";
import { KeyframeSchema, TransformSchema, SpriteSwitchKeyframeSchema } from "./keyframe.js";

// ─── Base Layer ───────────────────────────────────────────────────────────────

const BaseLayerSchema = z.object({
  id: z.string(),
  visible: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),
  /**
   * Render order: layers are composited bottom-to-top in ascending zIndex order.
   * Layer with zIndex=0 is drawn first (bottom), higher values appear on top.
   */
  zIndex: z.number().int(),
});

// ─── Background Layer ─────────────────────────────────────────────────────────

export const BackgroundLayerSchema = BaseLayerSchema.extend({
  type: z.literal("background"),
  assetId: z.string(),
  transform: TransformSchema,
  keyframes: z.array(KeyframeSchema).optional(),
});

export type BackgroundLayer = z.infer<typeof BackgroundLayerSchema>;

// ─── Character Part ───────────────────────────────────────────────────────────

export const CharacterPartSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  pivot: z.object({ x: z.number(), y: z.number() }),
  parentPartId: z.string().optional(),
  transform: TransformSchema,
  keyframes: z.array(KeyframeSchema).optional(),
  spriteSwitch: z
    .object({
      assetId: z.string(),
      keyframes: z.array(SpriteSwitchKeyframeSchema),
    })
    .optional(),
});

export type CharacterPart = z.infer<typeof CharacterPartSchema>;

// ─── Character Layer ──────────────────────────────────────────────────────────

export const CharacterLayerSchema = BaseLayerSchema.extend({
  type: z.literal("character"),
  parts: z.array(CharacterPartSchema),
  pivot: z.object({ x: z.number(), y: z.number() }),
  transform: TransformSchema,
  keyframes: z.array(KeyframeSchema).optional(),
});

export type CharacterLayer = z.infer<typeof CharacterLayerSchema>;

// ─── Prop Layer ───────────────────────────────────────────────────────────────

export const PropLayerSchema = BaseLayerSchema.extend({
  type: z.literal("prop"),
  assetId: z.string(),
  pivot: z.object({ x: z.number(), y: z.number() }),
  transform: TransformSchema,
  keyframes: z.array(KeyframeSchema).optional(),
});

export type PropLayer = z.infer<typeof PropLayerSchema>;

// ─── Effect Layer ─────────────────────────────────────────────────────────────

export const EffectLayerSchema = BaseLayerSchema.extend({
  type: z.literal("effect"),
  effectType: z.enum(["fade", "particle", "overlay"]),
  params: z.record(z.string(), z.unknown()),
  keyframes: z.array(KeyframeSchema).optional(),
});

export type EffectLayer = z.infer<typeof EffectLayerSchema>;

// ─── Layer Union ──────────────────────────────────────────────────────────────

export const LayerSchema = z.discriminatedUnion("type", [
  BackgroundLayerSchema,
  CharacterLayerSchema,
  PropLayerSchema,
  EffectLayerSchema,
]);

export type Layer = z.infer<typeof LayerSchema>;
