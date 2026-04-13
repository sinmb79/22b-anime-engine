import {
  type CameraMove,
  NarrativePayloadSchema,
  type NarrativeBeat,
  type NarrativePayload,
  type SceneArchetype,
  type ShotType,
} from "./narrative.js";
import {
  ScenePlanSchema,
  type AssetRequest,
  type PromptPacket,
  type PromptPacketStage,
  type ReviewGate,
  type ScenePlan,
  type ShotPlan,
} from "./scene-plan.js";

const DEFAULT_NEGATIVE = "3d, photoreal, text, watermark, deformed anatomy, horror artifacts";

function uniqueStrings(values: Iterable<string | undefined>): string[] {
  const items = [...values]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return [...new Set(items)];
}

function roundSeconds(value: number): number {
  return Math.round(value * 100) / 100;
}

function defaultDuration(shotType: ShotType, sceneArchetype: SceneArchetype): number {
  switch (shotType) {
    case "closeup":
      return 3.5;
    case "wide":
      return 5.0;
    case "action":
      return 4.0;
    case "insert":
      return 2.5;
    case "medium":
    default:
      return sceneArchetype === "outdoor" ? 4.5 : 4.0;
  }
}

function inferSceneArchetype(payload: NarrativePayload, beat: NarrativeBeat, shotType: ShotType): SceneArchetype {
  if (beat.sceneArchetype) return beat.sceneArchetype;
  if (shotType === "closeup") return "closeup";
  if (shotType === "wide") return "wide";
  if (shotType === "action") return "action";
  if (payload.sceneArchetype) return payload.sceneArchetype;

  const location = `${beat.location ?? ""} ${payload.location ?? ""}`.toLowerCase();
  if (/(creek|river|forest|field|mountain|outside|garden|outdoor|sky)/.test(location)) {
    return "outdoor";
  }

  return "indoor";
}

function inferCameraMove(shotType: ShotType, sceneArchetype: SceneArchetype): CameraMove {
  switch (shotType) {
    case "closeup":
      return "hold";
    case "wide":
      return "drift";
    case "action":
      return "follow";
    case "insert":
      return "hold";
    case "medium":
    default:
      return sceneArchetype === "outdoor" ? "pan" : "push_in";
  }
}

function formatCharacters(payload: NarrativePayload, beat: NarrativeBeat): string {
  const beatCharacters = uniqueStrings(beat.characters);
  if (beatCharacters.length > 0) {
    return beatCharacters.join(", ");
  }

  return payload.characterDescription ?? "environment focus";
}

function stageParams(stage: PromptPacketStage, sceneArchetype: SceneArchetype, cameraMove: string): Record<string, string | number | boolean | null> {
  switch (stage) {
    case "mood_board":
      return {
        steps: 20,
        cfg: 6.0,
        resolution: "1024x1536",
        target: "global_atmosphere",
      };
    case "character_sheet":
      return {
        steps: 24,
        cfg: 6.5,
        resolution: "1024x1536",
        target: "identity_consistency",
      };
    case "background":
      return {
        steps: 24,
        cfg: 6.5,
        resolution: sceneArchetype === "wide" ? "1536x1024" : "1024x1536",
        target: "location_lock",
      };
    case "sketch":
      return {
        steps: 14,
        cfg: 5.5,
        resolution: "1024x1536",
        target: "composition_lock",
      };
    case "full_render":
      return {
        steps: 30,
        cfg: 7.0,
        resolution: sceneArchetype === "wide" ? "1536x1024" : "1024x1536",
        target: "final_still",
      };
    case "motion":
      return {
        duration_sec: sceneArchetype === "wide" ? 5 : 4,
        fps: 24,
        motion_strength: sceneArchetype === "action" ? 0.6 : 0.45,
        camera_move: cameraMove,
      };
    default:
      return {};
  }
}

function buildGlobalPromptPackets(payload: NarrativePayload): PromptPacket[] {
  const sceneMood = payload.sceneArchetype ?? "story scene";
  const shared = `${payload.title}, ${sceneMood}, ${payload.emotionalTexture}, ${payload.philosophyNote}`;
  const characterFocus = payload.characterDescription ?? uniqueStrings(payload.beats.flatMap((beat) => beat.characters)).join(", ");

  const packets: PromptPacket[] = [
    {
      stage: "mood_board",
      positive: `Storybook toon mood board, ${shared}, location ${payload.location ?? "unspecified"}, emotional continuity, key prop ${payload.keyProp ?? "none"}`,
      negative: DEFAULT_NEGATIVE,
      params: stageParams("mood_board", payload.sceneArchetype ?? "indoor", "hold"),
      tested: false,
      testScore: null,
    },
  ];

  if (characterFocus) {
    packets.push({
      stage: "character_sheet",
      positive: `Storybook toon character sheet, ${characterFocus}, preserve silhouette clarity, neutral turnaround, expression range that fits ${payload.emotionalTexture}`,
      negative: DEFAULT_NEGATIVE,
      params: stageParams("character_sheet", payload.sceneArchetype ?? "indoor", "hold"),
      tested: false,
      testScore: null,
    });
  }

  return packets;
}

function buildShotPromptPackets(payload: NarrativePayload, beat: NarrativeBeat, shot: Pick<ShotPlan, "shotType" | "sceneArchetype" | "cameraMove">): PromptPacket[] {
  const location = beat.location ?? payload.location ?? "unspecified location";
  const emotionalHint = beat.emotionalHint ?? payload.emotionalTexture;
  const characters = formatCharacters(payload, beat);
  const visualIntent = beat.visualIntent ?? beat.summary;
  const keyProp = uniqueStrings([payload.keyProp, ...beat.props]).join(", ") || "none";

  return [
    {
      stage: "background",
      positive: `Storybook toon background concept, ${location}, ${visualIntent}, ${payload.philosophyNote}, emotional tone ${emotionalHint}, key prop ${keyProp}, no character`,
      negative: `${DEFAULT_NEGATIVE}, character`,
      params: stageParams("background", shot.sceneArchetype, shot.cameraMove),
      tested: false,
      testScore: null,
    },
    {
      stage: "sketch",
      positive: `Shot sketch, ${beat.summary}, shot type ${shot.shotType}, camera ${shot.cameraMove}, location ${location}, characters ${characters}, key prop ${keyProp}, clear staging for previz`,
      negative: DEFAULT_NEGATIVE,
      params: stageParams("sketch", shot.sceneArchetype, shot.cameraMove),
      tested: false,
      testScore: null,
    },
    {
      stage: "full_render",
      positive: `Storybook toon final still, ${beat.summary}, ${visualIntent}, ${payload.philosophyNote}, ${emotionalHint}, location ${location}, characters ${characters}, key prop ${keyProp}, shot type ${shot.shotType}`,
      negative: DEFAULT_NEGATIVE,
      params: stageParams("full_render", shot.sceneArchetype, shot.cameraMove),
      tested: false,
      testScore: null,
    },
    {
      stage: "motion",
      positive: `Gentle toon motion pass, ${beat.summary}, camera ${shot.cameraMove}, shot type ${shot.shotType}, preserve quiet hold of ${beat.silenceAfterSec ?? payload.keySilenceSec} seconds, maintain character continuity for ${characters}`,
      negative: "jitter, flicker, anatomy drift, broken prop continuity, text, watermark",
      params: stageParams("motion", shot.sceneArchetype, shot.cameraMove),
      tested: false,
      testScore: null,
    },
  ];
}

function buildReviewGates(payload: NarrativePayload): ReviewGate[] {
  const narrativeChecklist = payload.narrativeChecks.length > 0
    ? payload.narrativeChecks
    : [
        "Scene intention matches the episode arc.",
        "Philosophy note is visible in the beat design.",
        "Key prop and silence beats are justified.",
      ];

  return [
    {
      stage: "narrative_lock",
      purpose: "Freeze story intent before visual work begins.",
      checklist: narrativeChecklist,
    },
    {
      stage: "mood_board",
      purpose: "Validate atmosphere, scene archetype, and emotional direction.",
      checklist: [
        "Atmosphere matches the scene title and emotional texture.",
        "Color direction supports the philosophy note.",
        "The long-form episode tone remains coherent.",
      ],
    },
    {
      stage: "character_sheet",
      purpose: "Validate identity consistency before asset generation expands.",
      checklist: [
        "Silhouette reads clearly.",
        "Expressions fit the narrative beats.",
        "Character design survives multiple camera distances.",
      ],
    },
    {
      stage: "background",
      purpose: "Lock environment vocabulary and prop continuity.",
      checklist: [
        "Location reads immediately.",
        "Key props exist in the space when required.",
        "Backgrounds support reuse across long-form scenes.",
      ],
    },
    {
      stage: "sketch",
      purpose: "Fail cheaply by locking composition before final render.",
      checklist: [
        "Shot order is emotionally readable.",
        "Camera intent is clear.",
        "Blocking works in previz without final polish.",
      ],
    },
    {
      stage: "previz",
      purpose: "Check timing, continuity, and story rhythm inside the existing JSON engine.",
      checklist: [
        "Beat timing feels intentional.",
        "Transitions do not break continuity.",
        "The scene works even before Blender polish.",
      ],
    },
    {
      stage: "blender_final",
      purpose: "Validate the secure final-render path and quality bar.",
      checklist: [
        "Toon render preserves approved previz intent.",
        "Motion and lighting remain readable.",
        "Local-first render path stays reproducible.",
      ],
    },
    {
      stage: "shorts_extraction",
      purpose: "Protect long-form truth before deriving short clips.",
      checklist: [
        "Only approved long-form beats are extracted.",
        "Short clip preserves episode context.",
        "Metadata and clip framing do not distort the story.",
      ],
    },
  ];
}

function linkedShotIds(shots: ShotPlan[], predicate: (shot: ShotPlan) => boolean): string[] {
  return shots.filter(predicate).map((shot) => shot.id);
}

function buildAssetRequests(payload: NarrativePayload, shots: ShotPlan[]): AssetRequest[] {
  const requests: AssetRequest[] = [];

  for (const name of uniqueStrings(shots.flatMap((shot) => shot.characters))) {
    requests.push({
      kind: "character",
      name,
      reason: "Required by approved narrative beats and prompt packets.",
      linkedShotIds: linkedShotIds(shots, (shot) => shot.characters.includes(name)),
    });
  }

  for (const name of uniqueStrings(shots.map((shot) => shot.location))) {
    requests.push({
      kind: "background",
      name,
      reason: "Location appears in the scene plan and should map to a stable asset ID.",
      linkedShotIds: linkedShotIds(shots, (shot) => shot.location === name),
    });
  }

  for (const name of uniqueStrings([payload.keyProp, ...shots.flatMap((shot) => shot.props)])) {
    requests.push({
      kind: "prop",
      name,
      reason: "Prop continuity is part of the story contract.",
      linkedShotIds: linkedShotIds(shots, (shot) => shot.props.includes(name)),
    });
  }

  return requests;
}

export function validateNarrativePayload(raw: unknown): NarrativePayload {
  return NarrativePayloadSchema.parse(raw);
}

export function buildScenePlan(rawPayload: unknown): ScenePlan {
  const payload = validateNarrativePayload(rawPayload);
  let currentTime = 0;

  const shots: ShotPlan[] = payload.beats.map((beat, index) => {
    const shotType = beat.shotType ?? "medium";
    const sceneArchetype = inferSceneArchetype(payload, beat, shotType);
    const cameraMove = inferCameraMove(shotType, sceneArchetype);
    const beatDuration = beat.durationSec ?? defaultDuration(shotType, sceneArchetype);
    const silenceAfterSec = beat.silenceAfterSec ?? 0;
    const durationSec = roundSeconds(beatDuration + silenceAfterSec);
    const startTimeSec = roundSeconds(currentTime);
    const endTimeSec = roundSeconds(startTimeSec + durationSec);

    const shot: ShotPlan = {
      id: `shot_${String(index + 1).padStart(3, "0")}`,
      beatId: beat.id,
      index,
      title: beat.summary,
      summary: beat.summary,
      startTimeSec,
      durationSec,
      endTimeSec,
      shotType,
      sceneArchetype,
      cameraMove,
      backgroundCode: beat.backgroundCode,
      location: beat.location ?? payload.location,
      characters: uniqueStrings(beat.characters),
      props: uniqueStrings([payload.keyProp, ...beat.props]),
      dialogue: beat.dialogue,
      promptPackets: buildShotPromptPackets(payload, beat, {
        shotType,
        sceneArchetype,
        cameraMove,
      }),
      reviewFocus: uniqueStrings([
        beat.dialogue ? "dialogue clarity" : undefined,
        beat.visualIntent ? "visual intent" : undefined,
        beat.emotionalHint ? "emotional readability" : "story rhythm",
        payload.keyProp ? "prop continuity" : undefined,
      ]),
      notes: uniqueStrings([
        beat.visualIntent,
        silenceAfterSec > 0 ? `Hold ${silenceAfterSec.toFixed(1)}s after the beat.` : undefined,
      ]),
    };

    currentTime = roundSeconds(endTimeSec);
    return shot;
  });

  const plan: ScenePlan = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    payload,
    totalDurationSec: roundSeconds(currentTime),
    assetRequests: buildAssetRequests(payload, shots),
    globalPromptPackets: buildGlobalPromptPackets(payload),
    reviewGates: buildReviewGates(payload),
    shots,
  };

  return ScenePlanSchema.parse(plan);
}
