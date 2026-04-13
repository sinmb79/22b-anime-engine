import { z } from "zod";
import {
  CameraMoveSchema,
  NarrativePayloadSchema,
  SceneArchetypeSchema,
  ShotTypeSchema,
} from "./narrative.js";

export const ReviewStageSchema = z.enum([
  "narrative_lock",
  "mood_board",
  "character_sheet",
  "background",
  "sketch",
  "previz",
  "blender_final",
  "shorts_extraction",
]);

export type ReviewStage = z.infer<typeof ReviewStageSchema>;

export const PromptPacketStageSchema = z.enum([
  "mood_board",
  "character_sheet",
  "background",
  "sketch",
  "full_render",
  "motion",
]);

export type PromptPacketStage = z.infer<typeof PromptPacketStageSchema>;

const PromptParamValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const PromptPacketSchema = z.object({
  stage: PromptPacketStageSchema,
  positive: z.string(),
  negative: z.string().optional(),
  params: z.record(PromptParamValueSchema).default({}),
  tested: z.boolean().default(false),
  testScore: z.number().min(0).max(10).nullable().default(null),
});

export type PromptPacket = z.infer<typeof PromptPacketSchema>;

export const ReviewGateSchema = z.object({
  stage: ReviewStageSchema,
  purpose: z.string(),
  checklist: z.array(z.string()).min(1),
});

export type ReviewGate = z.infer<typeof ReviewGateSchema>;

export const AssetRequestSchema = z.object({
  kind: z.enum(["character", "background", "prop"]),
  name: z.string(),
  reason: z.string(),
  linkedShotIds: z.array(z.string()).default([]),
});

export type AssetRequest = z.infer<typeof AssetRequestSchema>;

export const ShotPlanSchema = z.object({
  id: z.string(),
  beatId: z.string(),
  index: z.number().int().nonnegative(),
  title: z.string(),
  summary: z.string(),
  startTimeSec: z.number().min(0),
  durationSec: z.number().positive(),
  endTimeSec: z.number().positive(),
  shotType: ShotTypeSchema,
  sceneArchetype: SceneArchetypeSchema,
  cameraMove: CameraMoveSchema,
  backgroundCode: z.string().optional(),
  location: z.string().optional(),
  characters: z.array(z.string()).default([]),
  props: z.array(z.string()).default([]),
  dialogue: z.string().optional(),
  promptPackets: z.array(PromptPacketSchema),
  reviewFocus: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export type ShotPlan = z.infer<typeof ShotPlanSchema>;

export const ScenePlanSchema = z.object({
  version: z.literal("1.0"),
  generatedAt: z.string(),
  payload: NarrativePayloadSchema,
  totalDurationSec: z.number().positive(),
  assetRequests: z.array(AssetRequestSchema),
  globalPromptPackets: z.array(PromptPacketSchema),
  reviewGates: z.array(ReviewGateSchema),
  shots: z.array(ShotPlanSchema).min(1),
});

export type ScenePlan = z.infer<typeof ScenePlanSchema>;
