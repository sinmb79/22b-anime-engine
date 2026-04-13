import { basename } from "node:path";
import type { NarrativeBeat, NarrativePayload, SceneArchetype, ShotType } from "./narrative.js";

export interface ScenarioMetadata {
  runtime?: string;
  lesson?: string;
  culturalElements?: string;
  cast: string[];
  backgroundUsage: Array<{ code: string; label?: string }>;
  shortMoments: string[];
}

export interface ScenarioDialogueLine {
  speaker: string;
  text: string;
}

export interface ScenarioScene {
  sceneNumber: number;
  id: string;
  actTitle: string;
  title: string;
  durationSec: number;
  markedForShorts: boolean;
  description: string;
  backgroundText?: string;
  backgroundCodes: string[];
  mood?: string;
  camera?: string;
  bgm?: string;
  sfx?: string;
  effect?: string;
  dialogues: ScenarioDialogueLine[];
  rawLines: string[];
}

export interface ScenarioDocument {
  sourcePath: string;
  storyId: string;
  episodeId?: string;
  title: string;
  metadata: ScenarioMetadata;
  acts: string[];
  scenes: ScenarioScene[];
}

const META_RE = /^>\s+\*\*(.+?)\*\*:\s*(.+)$/;
const BG_RE = /^\*\*배경\*\*:\s*(.+?)(?:\s+\|\s+\*\*무드\*\*:\s*(.+))?$/;
const NOTE_RE = /^\*\*(카메라|BGM|SFX|이펙트)\*\*:\s*(.+)$/;
const DIALOGUE_RE = /^-\s+\*\*(.+?)\*\*:\s*(.+)$/;
const SCENE_HEADING_RE = /^씬\s*(\d+)\s*[—-]\s*(.+?)\s*\((\d+)초\)\s*(⭐\s*숏폼 추출 구간)?$/;

const PROP_KEYWORDS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /달빛돌/giu, value: "달빛돌" },
  { pattern: /조약돌|돌멩이/giu, value: "조약돌" },
  { pattern: /나무 상자|상자/giu, value: "나무 상자" },
  { pattern: /간식|바구니/giu, value: "간식 바구니" },
  { pattern: /나뭇잎/giu, value: "나뭇잎" },
  { pattern: /산딸기/giu, value: "산딸기" },
];

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/giu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalizeLookup(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function extractEpisodeId(sourcePath: string): string | undefined {
  const match = basename(sourcePath).match(/EP(\d{2,3})/i);
  return match ? `ep${match[1]}` : undefined;
}

function parseBackgroundUsage(value: string): Array<{ code: string; label?: string }> {
  return [...value.matchAll(/(BG\d{2})(?:\(([^)]+)\))?/g)].map((match) => ({
    code: match[1],
    label: match[2]?.trim(),
  }));
}

function splitCommaList(value: string): string[] {
  return value
    .split(/,\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSceneHeader(header: string): Omit<ScenarioScene, "actTitle" | "description" | "backgroundText" | "backgroundCodes" | "mood" | "camera" | "bgm" | "sfx" | "effect" | "dialogues" | "rawLines"> {
  const match = header.match(SCENE_HEADING_RE);
  if (!match) {
    throw new Error(`Unsupported scene heading: ${header}`);
  }

  const sceneNumber = parseInt(match[1], 10);
  return {
    sceneNumber,
    id: `scene_${String(sceneNumber).padStart(3, "0")}`,
    title: match[2].trim(),
    durationSec: parseInt(match[3], 10),
    markedForShorts: Boolean(match[4]),
  };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function chunkArray<T>(items: T[], count: number): T[][] {
  if (count <= 1) return [items];
  const result: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => {
    result[index % count].push(item);
  });
  return result;
}

function inferShotType(text: string): ShotType {
  const source = text.toLowerCase();
  if (/클로즈|클로즈업|매크로|줌인/.test(source)) return "closeup";
  if (/와이드|롱샷|풍경|패닝|전경/.test(source)) return "wide";
  if (/슬로모션|핸드헬드|난관|액션|돌진|발견/.test(source)) return "action";
  if (/손|소품|조약돌|달빛돌|물방울/.test(source)) return "insert";
  return "medium";
}

function inferSceneArchetype(text: string, shotType: ShotType): SceneArchetype {
  if (shotType === "closeup") return "closeup";
  if (shotType === "wide") return "wide";
  if (shotType === "action") return "action";
  return /집 내부|실내|다락|방 안/.test(text) ? "indoor" : "outdoor";
}

function extractProps(text: string): string[] {
  const hits: string[] = [];
  for (const keyword of PROP_KEYWORDS) {
    if (keyword.pattern.test(text)) hits.push(keyword.value);
  }
  return [...new Set(hits)];
}

function normalizeSpeakerName(speaker: string): string[] {
  return speaker
    .split(/[+,/]/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseSceneBlock(actTitle: string, header: string, lines: string[]): ScenarioScene {
  const scene = parseSceneHeader(header);
  const descriptionLines: string[] = [];
  const dialogues: ScenarioDialogueLine[] = [];
  let backgroundText: string | undefined;
  let mood: string | undefined;
  let camera: string | undefined;
  let bgm: string | undefined;
  let sfx: string | undefined;
  let effect: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "---") continue;

    const bgMatch = line.match(BG_RE);
    if (bgMatch) {
      backgroundText = bgMatch[1].trim();
      mood = bgMatch[2]?.trim();
      continue;
    }

    const noteMatch = line.match(NOTE_RE);
    if (noteMatch) {
      const [, label, value] = noteMatch;
      if (label === "카메라") camera = value.trim();
      if (label === "BGM") bgm = value.trim();
      if (label === "SFX") sfx = value.trim();
      if (label === "이펙트") effect = value.trim();
      continue;
    }

    const dialogueMatch = line.match(DIALOGUE_RE);
    if (dialogueMatch) {
      dialogues.push({
        speaker: dialogueMatch[1].trim(),
        text: dialogueMatch[2].trim(),
      });
      continue;
    }

    if (!line.startsWith("**")) {
      descriptionLines.push(line);
    }
  }

  return {
    ...scene,
    actTitle,
    description: descriptionLines.join(" "),
    backgroundText,
    backgroundCodes: [...new Set((backgroundText ?? "").match(/BG\d{2}/g) ?? [])],
    mood,
    camera,
    bgm,
    sfx,
    effect,
    dialogues,
    rawLines: lines,
  };
}

export function parseScenarioMarkdown(sourcePath: string, markdown: string): ScenarioDocument {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const metadata: ScenarioMetadata = {
    cast: [],
    backgroundUsage: [],
    shortMoments: [],
  };
  const acts: string[] = [];
  const scenes: ScenarioScene[] = [];
  let title = basename(sourcePath);
  let currentActTitle = "";
  let currentSceneHeader: string | null = null;
  let currentSceneLines: string[] = [];

  function flushScene(): void {
    if (!currentSceneHeader) return;
    scenes.push(parseSceneBlock(currentActTitle, currentSceneHeader, currentSceneLines));
    currentSceneHeader = null;
    currentSceneLines = [];
  }

  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      continue;
    }

    const metaMatch = line.match(META_RE);
    if (metaMatch) {
      const key = metaMatch[1].trim();
      const value = metaMatch[2].trim();
      if (key === "러닝타임") metadata.runtime = value;
      if (key === "교훈") metadata.lesson = value;
      if (key === "한국 요소") metadata.culturalElements = value;
      if (key === "등장인물") metadata.cast = splitCommaList(value);
      if (key === "배경 사용") metadata.backgroundUsage = parseBackgroundUsage(value);
      if (key === "숏폼 추출 구간") metadata.shortMoments = splitCommaList(value);
      continue;
    }

    if (line.startsWith("## ")) {
      flushScene();
      currentActTitle = line.slice(3).trim();
      acts.push(currentActTitle);
      continue;
    }

    if (line.startsWith("### ")) {
      const header = line.slice(4).trim();
      if (SCENE_HEADING_RE.test(header)) {
        flushScene();
        currentSceneHeader = header;
        currentSceneLines = [];
      } else {
        flushScene();
      }
      continue;
    }

    if (currentSceneHeader) {
      currentSceneLines.push(line);
    }
  }

  flushScene();

  return {
    sourcePath,
    storyId: slugify(title),
    episodeId: extractEpisodeId(sourcePath),
    title,
    metadata,
    acts,
    scenes,
  };
}

function pickBackgroundCode(scene: ScenarioScene, beatIndex: number, beatCount: number): string | undefined {
  if (scene.backgroundCodes.length === 0) return undefined;
  if (scene.backgroundCodes.length === 1) return scene.backgroundCodes[0];
  const mappedIndex = Math.min(
    scene.backgroundCodes.length - 1,
    Math.floor((beatIndex / Math.max(beatCount - 1, 1)) * scene.backgroundCodes.length)
  );
  return scene.backgroundCodes[mappedIndex];
}

function buildBeats(scene: ScenarioScene): NarrativeBeat[] {
  const cameraSegments = scene.camera
    ? scene.camera.split("→").map((part) => part.trim()).filter(Boolean).slice(0, 4)
    : [];
  const descriptionSegments = splitSentences(scene.description).slice(0, 4);
  const beatCount = Math.min(
    4,
    Math.max(
      scene.dialogues.length >= 4 ? 2 : 1,
      cameraSegments.length,
      descriptionSegments.length > 1 ? descriptionSegments.length : 1
    )
  );
  const dialogueChunks = chunkArray(scene.dialogues, beatCount);
  const props = extractProps(`${scene.title} ${scene.description} ${scene.effect ?? ""}`);
  const silenceBudget = scene.markedForShorts ? 0.4 : 0;
  const contentDuration = Math.max(beatCount, scene.durationSec - silenceBudget);
  const baseDuration = contentDuration / beatCount;
  let usedDuration = 0;

  return Array.from({ length: beatCount }, (_, index) => {
    const cameraSegment = cameraSegments[index];
    const descriptionSegment = descriptionSegments[index] ?? descriptionSegments[descriptionSegments.length - 1] ?? scene.title;
    const chunk = dialogueChunks[index] ?? [];
    const dialogue = chunk.map((line) => `${line.speaker}: ${line.text}`).join(" ");
    const shotSeed = `${cameraSegment ?? ""} ${descriptionSegment} ${scene.title}`;
    const shotType = inferShotType(shotSeed);
    const durationSec = index === beatCount - 1
      ? Math.max(1, round(contentDuration - usedDuration))
      : Math.max(1, round(baseDuration));
    usedDuration = round(usedDuration + durationSec);
    return {
      id: `${scene.id}_beat_${String(index + 1).padStart(2, "0")}`,
      summary: cameraSegment ? `${scene.title} — ${cameraSegment}` : descriptionSegment,
      dialogue: dialogue || undefined,
      visualIntent: descriptionSegment,
      emotionalHint: scene.mood ?? scene.actTitle,
      durationSec,
      shotType,
      sceneArchetype: inferSceneArchetype(`${scene.backgroundText ?? ""} ${shotSeed}`, shotType),
      backgroundCode: pickBackgroundCode(scene, index, beatCount),
      location: scene.backgroundText ?? scene.actTitle,
      characters: [...new Set(chunk.flatMap((line) => normalizeSpeakerName(line.speaker)))],
      props,
      silenceAfterSec: scene.markedForShorts && index === beatCount - 1 ? silenceBudget : undefined,
    };
  });
}

export function buildNarrativePayloadFromScenarioScene(document: ScenarioDocument, sceneSelector: number | string): NarrativePayload {
  const scene = typeof sceneSelector === "number"
    ? document.scenes.find((item) => item.sceneNumber === sceneSelector)
    : document.scenes.find((item) => normalizeLookup(item.id) === normalizeLookup(sceneSelector) || normalizeLookup(item.title) === normalizeLookup(sceneSelector));

  if (!scene) {
    throw new Error(`Scenario scene not found: ${String(sceneSelector)}`);
  }

  const sceneText = `${scene.title} ${scene.description} ${scene.camera ?? ""} ${scene.effect ?? ""}`;
  const props = extractProps(sceneText);
  return {
    version: "1.0",
    storyId: document.storyId,
    episodeId: document.episodeId,
    sequenceId: scene.id,
    title: `${document.title} — ${scene.title}`,
    sourceScenario: document.sourcePath,
    locale: "ko-KR",
    visualStyle: "storybook_toon",
    sceneArchetype: inferSceneArchetype(`${scene.backgroundText ?? ""} ${sceneText}`, inferShotType(sceneText)),
    philosophyNote: document.metadata.lesson
      ? `이 장면은 "${document.metadata.lesson}"의 감각을 잃지 않아야 합니다.`
      : `${scene.actTitle}의 정서를 무너지지 않게 유지합니다.`,
    emotionalTexture: scene.mood ?? scene.actTitle,
    narrativeChecks: [
      `장면의 교훈 축을 유지할 것: ${document.metadata.lesson ?? scene.actTitle}`,
      scene.camera ? `승인된 카메라 흐름을 유지할 것: ${scene.camera}` : undefined,
      scene.backgroundCodes[0] ? `배경 코드 ${scene.backgroundCodes.join(", ")}의 연속성을 유지할 것.` : undefined,
      scene.markedForShorts ? "향후 숏폼으로 잘라 쓰더라도 장면의 맥락이 무너지지 않게 설계할 것." : undefined,
    ].filter((item): item is string => Boolean(item)),
    keyProp: props[0],
    keySilenceSec: scene.markedForShorts ? 0.4 : 0.2,
    characterDescription: document.metadata.cast.join(", "),
    location: scene.backgroundText ?? scene.actTitle,
    beats: buildBeats(scene),
  };
}
