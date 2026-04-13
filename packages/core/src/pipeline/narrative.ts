import { z } from "zod";

export const SceneArchetypeSchema = z.enum(["indoor", "outdoor", "closeup", "wide", "action"]);
export type SceneArchetype = z.infer<typeof SceneArchetypeSchema>;

export const ShotTypeSchema = z.enum(["closeup", "medium", "wide", "action", "insert"]);
export type ShotType = z.infer<typeof ShotTypeSchema>;

export const CameraMoveSchema = z.enum(["hold", "push_in", "pan", "drift", "follow"]);
export type CameraMove = z.infer<typeof CameraMoveSchema>;

export const NarrativeBeatSchema = z.object({
  id: z.string(),
  summary: z.string(),
  dialogue: z.string().optional(),
  visualIntent: z.string().optional(),
  emotionalHint: z.string().optional(),
  durationSec: z.number().positive().optional(),
  shotType: ShotTypeSchema.optional(),
  sceneArchetype: SceneArchetypeSchema.optional(),
  backgroundCode: z.string().optional(),
  location: z.string().optional(),
  characters: z.array(z.string()).default([]),
  props: z.array(z.string()).default([]),
  silenceAfterSec: z.number().min(0).optional(),
});

export type NarrativeBeat = z.infer<typeof NarrativeBeatSchema>;

export const NarrativePayloadSchema = z.object({
  version: z.literal("1.0"),
  storyId: z.string(),
  episodeId: z.string().optional(),
  sequenceId: z.string().optional(),
  title: z.string(),
  sourceScenario: z.string().optional(),
  locale: z.string().default("ko-KR"),
  visualStyle: z.string().default("storybook_toon"),
  sceneArchetype: SceneArchetypeSchema.optional(),
  philosophyNote: z.string(),
  emotionalTexture: z.string(),
  narrativeChecks: z.array(z.string()).default([]),
  keyProp: z.string().optional(),
  keySilenceSec: z.number().min(0).default(0),
  characterDescription: z.string().optional(),
  location: z.string().optional(),
  beats: z.array(NarrativeBeatSchema).min(1),
});

export type NarrativePayload = z.infer<typeof NarrativePayloadSchema>;
