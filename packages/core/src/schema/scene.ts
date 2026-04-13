import { z } from "zod";
import { LayerSchema } from "./layer.js";
import { AudioTrackSchema } from "./audio.js";
import { EasingTypeSchema } from "./keyframe.js";

// ─── Asset Reference ──────────────────────────────────────────────────────────

const AssetSourceGenerateSchema = z.object({
  prompt: z.string(),
  negative_prompt: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  style: z.enum(["cartoon_flat", "watercolor", "pastel"]).optional(),
});

export const AssetRefSchema = z
  .object({
    id: z.string(),
    type: z.enum(["image", "spritesheet", "audio"]),
    source: z
      .object({
        path: z.string().optional(),
        assetDb: z.string().optional(),
        generate: AssetSourceGenerateSchema.optional(),
      })
      .refine((s) => s.path !== undefined || s.assetDb !== undefined || s.generate !== undefined, {
        message: "At least one of path, assetDb, or generate must be provided",
      }),
    frames: z
      .record(
        z.string(),
        z.object({
          path: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
          w: z.number().optional(),
          h: z.number().optional(),
        })
      )
      .optional(),
  });

export type AssetRef = z.infer<typeof AssetRefSchema>;

// ─── Camera ───────────────────────────────────────────────────────────────────

export const CameraKeyframeSchema = z.object({
  time: z.number().min(0),
  x: z.number().optional(),
  y: z.number().optional(),
  zoom: z.number().positive().optional(),
  shake: z
    .object({
      intensity: z.number().positive(),
      frequency: z.number().positive(),
      duration: z.number().positive(),
    })
    .optional(),
  easing: EasingTypeSchema,
});

export type CameraKeyframe = z.infer<typeof CameraKeyframeSchema>;

export const CameraTrackSchema = z.object({
  initialTransform: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().positive(),
  }),
  keyframes: z.array(CameraKeyframeSchema),
});

export type CameraTrack = z.infer<typeof CameraTrackSchema>;

// ─── Scene Meta ───────────────────────────────────────────────────────────────

export const SceneMetaSchema = z.object({
  title: z.string(),
  fps: z.number().int().positive().default(24),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration: z.number().positive(),
});

export type SceneMeta = z.infer<typeof SceneMetaSchema>;

// ─── Scene Root ───────────────────────────────────────────────────────────────

export const SceneSchema = z.object({
  version: z.literal("1.0"),
  meta: SceneMetaSchema,
  assets: z.array(AssetRefSchema),
  layers: z.array(LayerSchema),
  camera: CameraTrackSchema,
  audio: z.array(AudioTrackSchema),
});

export type Scene = z.infer<typeof SceneSchema>;
