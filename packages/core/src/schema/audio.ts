import { z } from "zod";

// ─── Lip Sync ─────────────────────────────────────────────────────────────────

export const LipSyncCueSchema = z.object({
  time: z.number().min(0),
  shape: z.enum(["A", "B", "C", "D", "E", "F", "X"]),
});

export type LipSyncCue = z.infer<typeof LipSyncCueSchema>;

export const LipSyncSchema = z.object({
  characterLayerId: z.string(),
  cues: z.array(LipSyncCueSchema),
});

export type LipSync = z.infer<typeof LipSyncSchema>;

// ─── Audio Track ──────────────────────────────────────────────────────────────

export const AudioTrackSchema = z.object({
  id: z.string(),
  type: z.enum(["voice", "bgm", "sfx"]),
  source: z.string(),
  startTime: z.number().min(0),
  volume: z.number().min(0).max(1),
  fadeIn: z.number().min(0).optional(),
  fadeOut: z.number().min(0).optional(),
  loop: z.boolean().optional(),
  lipSync: LipSyncSchema.optional(),
});

export type AudioTrack = z.infer<typeof AudioTrackSchema>;
