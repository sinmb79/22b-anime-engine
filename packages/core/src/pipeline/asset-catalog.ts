import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

export const AssetCatalogEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["background", "character", "prop"]),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  path: z.string().optional(),
  assetDb: z.string().optional(),
  defaultScale: z.number().positive().optional(),
  anchorY: z.number().min(0).max(1).optional(),
}).refine((entry) => entry.path !== undefined || entry.assetDb !== undefined, {
  message: "Asset catalog entry must provide path or assetDb.",
});

export type AssetCatalogEntry = z.infer<typeof AssetCatalogEntrySchema>;

export const AssetCatalogSchema = z.object({
  version: z.literal("1.0"),
  assets: z.array(AssetCatalogEntrySchema),
});

export type AssetCatalog = z.infer<typeof AssetCatalogSchema>;

function entryExists(workspaceRoot: string, relativePath: string): boolean {
  return existsSync(join(workspaceRoot, relativePath));
}

function makeEntry(workspaceRoot: string, entry: AssetCatalogEntry): AssetCatalogEntry | null {
  if (entry.path && !entryExists(workspaceRoot, entry.path)) return null;
  return entry;
}

export function loadAssetCatalog(raw: unknown, catalogPath?: string): AssetCatalog {
  const parsed = AssetCatalogSchema.parse(raw);

  if (!catalogPath) return parsed;
  const baseDir = dirname(resolve(catalogPath));
  return {
    ...parsed,
    assets: parsed.assets.map((entry) => ({
      ...entry,
      path: entry.path ? (isAbsolute(entry.path) ? entry.path : resolve(baseDir, entry.path)) : undefined,
    })),
  };
}

export function buildDefaultAssetCatalog(workspaceRoot: string): AssetCatalog {
  const entries = [
    makeEntry(workspaceRoot, {
      id: "bg_bg01_creek_spring",
      kind: "background",
      name: "냇가 봄",
      aliases: ["BG01", "냇가", "냇가 봄", "sunlit creek path in early spring", "봄 냇가"],
      path: "assets/backgrounds/CORE LOCATIONS (4 Seasonal Variants Each)/[BG01-04] 냇가 (The Creek) — 메인 배경/[BG01] 냇가 — 봄.png",
    }),
    makeEntry(workspaceRoot, {
      id: "bg_bg05_home_exterior",
      kind: "background",
      name: "집 외부",
      aliases: ["BG05", "수달 가족 집", "집 외부", "otter family home exterior"],
      path: "assets/backgrounds/CORE LOCATIONS (4 Seasonal Variants Each)/[BG05-06] 수달 가족 집 (Otter Family Home)/[BG05] 집 외부.png",
    }),
    makeEntry(workspaceRoot, {
      id: "bg_bg06_home_interior",
      kind: "background",
      name: "집 내부",
      aliases: ["BG06", "집 내부", "수달 가족 집 내부", "otter family home interior"],
      path: "assets/backgrounds/CORE LOCATIONS (4 Seasonal Variants Each)/[BG05-06] 수달 가족 집 (Otter Family Home)/[BG06] 집 내부.png",
    }),
    makeEntry(workspaceRoot, {
      id: "bg_bg10_forest_entrance",
      kind: "background",
      name: "숲 입구",
      aliases: ["BG10", "숲 입구", "forest entrance"],
      path: "assets/backgrounds/CORE LOCATIONS (4 Seasonal Variants Each)/[BG09-10] 특수 배경 — 봄/[BG10] 숲 입구 (Forest Entrance).png",
    }),
    makeEntry(workspaceRoot, {
      id: "bg_bg14_creek_evening",
      kind: "background",
      name: "냇가 둑 저녁",
      aliases: ["BG14", "냇가 저녁", "냇가 둑 저녁", "creek bank sunset"],
      path: "assets/backgrounds/CORE LOCATIONS (4 Seasonal Variants Each)/[BG13-14] 특수 배경 — 가을/[BG14] 냇가 둑 저녁 (Creek Bank — Sunset).png",
    }),
    makeEntry(workspaceRoot, {
      id: "char_dali",
      kind: "character",
      name: "달이",
      aliases: ["dali"],
      path: "assets/characters/anim/dali.png",
      defaultScale: 0.34,
      anchorY: 0.85,
    }),
    makeEntry(workspaceRoot, {
      id: "char_dori",
      kind: "character",
      name: "돌이",
      aliases: ["dori", "doli"],
      path: "assets/characters/anim/dori.png",
      defaultScale: 0.32,
      anchorY: 0.85,
    }),
    makeEntry(workspaceRoot, {
      id: "char_papa_otter",
      kind: "character",
      name: "아빠수달",
      aliases: ["아빠", "papa otter", "papa"],
      path: "assets/characters/anim/papa-otter.png",
      defaultScale: 0.38,
      anchorY: 0.85,
    }),
    makeEntry(workspaceRoot, {
      id: "char_mama_otter",
      kind: "character",
      name: "엄마수달",
      aliases: ["엄마", "mama otter", "mama"],
      path: "assets/characters/anim/mama-otter.png",
      defaultScale: 0.36,
      anchorY: 0.85,
    }),
    makeEntry(workspaceRoot, {
      id: "char_bami",
      kind: "character",
      name: "밤이",
      aliases: ["bami"],
      path: "assets/characters/anim/bami.png",
      defaultScale: 0.3,
      anchorY: 0.85,
    }),
    makeEntry(workspaceRoot, {
      id: "char_poljjak",
      kind: "character",
      name: "폴짝이",
      aliases: ["poljjak"],
      path: "assets/characters/anim/poljjak.png",
      defaultScale: 0.28,
      anchorY: 0.85,
    }),
    makeEntry(workspaceRoot, {
      id: "prop_moonlight_stone",
      kind: "prop",
      name: "달빛돌",
      aliases: ["moonlight stone"],
      path: "assets/characters/KEY PROPS/[P1] 달빛돌 (Moonlight Stone).png",
      defaultScale: 0.18,
      anchorY: 0.5,
    }),
  ].filter((entry): entry is AssetCatalogEntry => Boolean(entry));

  return {
    version: "1.0",
    assets: entries,
  };
}
