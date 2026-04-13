# 22B Anime Engine — Development Specification v1.0

> **Project**: 22B Anime Engine (codename: `anime-engine`)
> **Author**: 22B Labs / The 4th Path
> **License**: MIT
> **Target**: Claude Code (Codex) implementation
> **Date**: 2026-04-13
> **Direction Update**: Keep the JSON-driven 2D engine for previz, but use Blender toon-shaded 3D as the primary final-render path.
> **Security Constraint**: Production workflow must remain operable in a controlled local environment without mandatory cloud dependencies.
> **Design Note**: See `design/2026-04-13_Blender_Toon_Pivot_Secure.md` for the local-first variant of this pivot.
> **Production Strategy Update**: Long-form episodes now come first. Shorts are derivatives extracted from approved long-form scenes, not the other way around.
> **Asset Status Update**: Image assets have been reorganized and saved by prompt/theme groupings. Canonical asset mapping should follow the new folder taxonomy, not the older flat layout assumptions.
> **Scenario Status Update**: Season 1 scenario source now exists in `scenes/Dalis_Creek_EP01_Full.md`, `scenes/Dalis_Creek_EP02_EP10.md`, `scenes/Dalis_Creek_EP11_EP20.md`, and `scenes/Dalis_Creek_Series_Bible.md`.

---

## 1. Project Overview

### 1.1 What Is This

A **headless-first 2D cutout animation engine** designed to be driven entirely by AI (Codex).
Produces children's animation in the style of Pororo/Pinkfong using layer-based composition — no frame-by-frame drawing, no AI video generation.

### 1.2 Core Principle

**Everything is JSON.** The engine consumes a Scene JSON file and outputs MP4 video.
Codex writes the JSON. Boss reviews the preview. That's the entire workflow.

### 1.3 Architecture Summary

```
┌─────────────────────────────────────────────────┐
│                  Codex (AI Agent)                │
│  scenario → asset list → scene JSON → revisions │
└──────────────┬──────────────────────┬───────────┘
               │                      │
               ▼                      ▼
┌──────────────────────┐  ┌───────────────────────┐
│   Asset Pipeline     │  │   Animation Engine     │
│  • Public asset DB   │  │  • Scene JSON parser   │
│  • ComfyUI gen       │  │  • Layer compositor    │
│  • Character parts   │  │  • Keyframe interp     │
│  • Rhubarb lip sync  │  │  • Sprite switcher     │
│  • GPT-SoVITS TTS    │  │  • Camera system       │
└──────────┬───────────┘  └──────────┬────────────┘
           │                         │
           ▼                         ▼
┌──────────────────────┐  ┌───────────────────────┐
│   Preview Server     │  │   Headless Renderer    │
│  Tauri + PixiJS      │  │  Node.js + node-canvas │
│  (Boss inspection)   │  │  → FFmpeg → MP4        │
└──────────────────────┘  └───────────────────────┘
```

---

## 2. Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Monorepo** | Turborepo + pnpm | Multi-package orchestration |
| **Language** | TypeScript (strict) | Shared types across all packages |
| **Preview App** | Tauri v2 + React + PixiJS v8 | Boss desktop review tool |
| **Headless Renderer** | Node.js + node-canvas + PixiJS | Server-side frame export |
| **Video Encoder** | FFmpeg (system) | Frame sequence → MP4/WebM |
| **Lip Sync** | Rhubarb Lip Sync (CLI binary) | Audio → mouth cue JSON |
| **Voice Clone** | GPT-SoVITS (Python, local) | Family voice synthesis |
| **Asset Generation** | ComfyUI API (localhost:8188) | Background/prop image gen |
| **Asset DB** | SQLite + file system | Local asset indexing/search |
| **CLI** | Commander.js | Codex-facing command interface |

---

## 3. Monorepo Structure

```
anime-engine/
├── package.json                  # Turborepo root
├── turbo.json
├── pnpm-workspace.yaml
│
├── packages/
│   ├── core/                     # @22b/anime-core
│   │   ├── src/
│   │   │   ├── schema/           # Scene JSON schema + TypeScript types
│   │   │   │   ├── scene.ts      # Root scene type
│   │   │   │   ├── layer.ts      # Layer types (background, character, prop, camera)
│   │   │   │   ├── keyframe.ts   # Keyframe + easing types
│   │   │   │   ├── audio.ts      # Audio track + lip sync types
│   │   │   │   └── validate.ts   # Zod schema validation
│   │   │   ├── engine/           # Animation engine (shared between preview & headless)
│   │   │   │   ├── compositor.ts # Layer composition logic
│   │   │   │   ├── interpolator.ts # Keyframe interpolation (linear, ease, bezier)
│   │   │   │   ├── sprite-switcher.ts # Expression/mouth shape switching
│   │   │   │   ├── camera.ts     # Virtual camera (pan, zoom, shake)
│   │   │   │   └── timeline.ts   # Master timeline controller
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── renderer/                 # @22b/anime-renderer
│   │   ├── src/
│   │   │   ├── pixi-renderer.ts  # PixiJS-based frame renderer (browser + node-canvas)
│   │   │   ├── headless.ts       # Node.js headless rendering pipeline
│   │   │   ├── frame-exporter.ts # PNG frame sequence writer
│   │   │   └── video-encoder.ts  # FFmpeg wrapper (frames → MP4)
│   │   └── package.json
│   │
│   ├── preview/                  # @22b/anime-preview (Tauri app)
│   │   ├── src/                  # React frontend
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── Canvas.tsx    # PixiJS preview canvas
│   │   │   │   ├── Timeline.tsx  # Visual timeline scrubber
│   │   │   │   ├── LayerPanel.tsx # Layer visibility/order
│   │   │   │   └── Controls.tsx  # Play/pause/seek/speed
│   │   │   └── hooks/
│   │   │       └── useEngine.ts  # Bridge to @22b/anime-core
│   │   ├── src-tauri/            # Rust backend
│   │   │   ├── src/main.rs
│   │   │   └── Cargo.toml
│   │   └── package.json
│   │
│   ├── cli/                      # @22b/anime-cli
│   │   ├── src/
│   │   │   ├── index.ts          # CLI entry point
│   │   │   ├── commands/
│   │   │   │   ├── render.ts     # anime render <scene.json> -o output.mp4
│   │   │   │   ├── preview.ts    # anime preview <scene.json> (opens Tauri)
│   │   │   │   ├── validate.ts   # anime validate <scene.json>
│   │   │   │   ├── lipsync.ts    # anime lipsync <audio.wav> -o cues.json
│   │   │   │   ├── asset-search.ts # anime asset search "forest background"
│   │   │   │   ├── asset-import.ts # anime asset import <file> --tag bg:forest
│   │   │   │   └── asset-gen.ts  # anime asset gen --prompt "..." --type background
│   │   │   └── utils/
│   │   │       ├── rhubarb.ts    # Rhubarb CLI wrapper
│   │   │       ├── comfyui.ts    # ComfyUI API client
│   │   │       └── ffmpeg.ts     # FFmpeg wrapper
│   │   └── package.json
│   │
│   └── asset-db/                 # @22b/anime-assets
│       ├── src/
│       │   ├── db.ts             # SQLite asset index
│       │   ├── importer.ts       # Bulk import + auto-tagging
│       │   ├── search.ts         # Tag-based + semantic search
│       │   └── schema.sql        # Asset DB schema
│       ├── package.json
│       └── seeds/                # Default CC0 asset packs
│           └── README.md         # Download instructions for Kenney, OpenGameArt, etc.
│
├── assets/                       # Local asset storage
│   ├── backgrounds/
│   ├── characters/               # Boss-created character parts
│   │   └── {character_name}/
│   │       ├── body.png
│   │       ├── head.png
│   │       ├── arm_l.png
│   │       ├── arm_r.png
│   │       ├── leg_l.png
│   │       ├── leg_r.png
│   │       ├── mouth_a.png       # Rhubarb shapes A-F + X
│   │       ├── mouth_b.png
│   │       ├── mouth_c.png
│   │       ├── mouth_d.png
│   │       ├── mouth_e.png
│   │       ├── mouth_f.png
│   │       ├── mouth_x.png       # Closed/silent
│   │       ├── eye_open.png
│   │       ├── eye_closed.png
│   │       ├── eye_happy.png
│   │       └── manifest.json     # Part registry + pivot points
│   ├── props/
│   ├── effects/
│   └── audio/
│       ├── voices/               # Recorded & AI-generated voice files
│       └── bgm/
│
├── scenes/                       # Scene JSON files (Codex workspace)
│   └── episode_001/
│       ├── scene_001.json
│       ├── scene_002.json
│       └── episode.json          # Episode manifest (scene order + transitions)
│
└── output/                       # Rendered output
    └── episode_001/
        ├── scene_001.mp4
        └── episode_001_final.mp4
```

---

## 4. Scene JSON Schema

This is the **most critical specification**. Codex generates this JSON to produce animation.

### 4.1 Root Scene Object

```typescript
interface Scene {
  version: "1.0";
  meta: {
    title: string;           // "Episode 1 - Scene 3"
    fps: number;             // 24 (default)
    width: number;           // 1920
    height: number;          // 1080
    duration: number;        // Total duration in seconds
  };
  assets: AssetRef[];        // All assets referenced in this scene
  layers: Layer[];           // Bottom to top render order
  camera: CameraTrack;       // Virtual camera
  audio: AudioTrack[];       // Voice + BGM + SFX
}
```

### 4.2 Asset Reference

```typescript
interface AssetRef {
  id: string;                // Unique ID within scene: "bg_forest", "char_mimi_body"
  type: "image" | "spritesheet" | "audio";
  source: {
    path?: string;           // Relative path: "assets/backgrounds/forest_day.png"
    assetDb?: string;        // Asset DB query: "tag:background tag:forest"
    generate?: {             // ComfyUI generation fallback
      prompt: string;
      negative_prompt?: string;
      width: number;
      height: number;
      style?: string;        // "cartoon_flat" | "watercolor" | "pastel"
    };
  };
  // For spritesheets (expression/mouth sets)
  frames?: Record<string, {  // "mouth_a": { x, y, w, h } or separate files
    path?: string;            // If separate PNG per frame
    x?: number; y?: number;   // If packed spritesheet
    w?: number; h?: number;
  }>;
}
```

### 4.3 Layer

```typescript
type Layer = BackgroundLayer | CharacterLayer | PropLayer | EffectLayer;

interface BaseLayer {
  id: string;                // "bg_main", "char_mimi", "prop_ball"
  type: "background" | "character" | "prop" | "effect";
  visible: boolean;
  opacity: number;           // 0.0 - 1.0
  zIndex: number;            // Render order (higher = on top)
}

interface BackgroundLayer extends BaseLayer {
  type: "background";
  assetId: string;           // References AssetRef.id
  transform: Transform;      // Static or animated
  keyframes?: Keyframe[];    // For parallax scrolling etc.
}

interface CharacterLayer extends BaseLayer {
  type: "character";
  parts: CharacterPart[];    // Body parts with individual transforms
  pivot: { x: number; y: number }; // Character anchor point
  transform: Transform;      // Whole-character transform
  keyframes?: Keyframe[];
}

interface CharacterPart {
  id: string;                // "head", "body", "arm_l", "mouth"
  assetId: string;           // References AssetRef.id
  pivot: { x: number; y: number }; // Rotation pivot relative to part
  parentPartId?: string;     // Bone hierarchy: "arm_l" parent is "body"
  transform: Transform;      // Relative to parent part
  keyframes?: Keyframe[];
  // For switchable parts (mouth, eyes)
  spriteSwitch?: {
    assetId: string;         // Spritesheet or multi-file asset
    keyframes: SpriteSwitchKeyframe[];
  };
}

interface PropLayer extends BaseLayer {
  type: "prop";
  assetId: string;
  pivot: { x: number; y: number };
  transform: Transform;
  keyframes?: Keyframe[];
}

interface EffectLayer extends BaseLayer {
  type: "effect";
  effectType: "fade" | "particle" | "overlay";
  params: Record<string, any>;
  keyframes?: Keyframe[];
}
```

### 4.4 Transform & Keyframes

```typescript
interface Transform {
  x: number;                 // Position X (pixels from left)
  y: number;                 // Position Y (pixels from top)
  rotation: number;          // Degrees
  scaleX: number;            // 1.0 = original
  scaleY: number;
  anchorX?: number;          // 0-1, default 0.5 (center)
  anchorY?: number;
}

interface Keyframe {
  time: number;              // Seconds from scene start
  transform: Partial<Transform>; // Only changed properties
  easing: EasingType;
}

type EasingType =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "bounce"
  | "elastic"
  | { type: "cubic-bezier"; points: [number, number, number, number] };

interface SpriteSwitchKeyframe {
  time: number;
  frame: string;             // Frame name: "mouth_a", "eye_closed"
}
```

### 4.5 Camera

```typescript
interface CameraTrack {
  initialTransform: {
    x: number;               // Camera center X
    y: number;               // Camera center Y
    zoom: number;            // 1.0 = fit scene, 2.0 = 2x zoom
  };
  keyframes: CameraKeyframe[];
}

interface CameraKeyframe {
  time: number;
  x?: number;
  y?: number;
  zoom?: number;
  shake?: {                  // Camera shake
    intensity: number;       // Pixels
    frequency: number;       // Hz
    duration: number;        // Seconds
  };
  easing: EasingType;
}
```

### 4.6 Audio

```typescript
interface AudioTrack {
  id: string;
  type: "voice" | "bgm" | "sfx";
  source: string;            // Path to audio file
  startTime: number;         // When to start playing (scene time)
  volume: number;            // 0.0 - 1.0
  fadeIn?: number;           // Seconds
  fadeOut?: number;
  loop?: boolean;
  // For voice tracks — auto-populated by Rhubarb
  lipSync?: {
    characterLayerId: string; // Which character layer to animate
    cues: LipSyncCue[];
  };
}

interface LipSyncCue {
  time: number;              // Relative to audio startTime
  shape: "A" | "B" | "C" | "D" | "E" | "F" | "X"; // Rhubarb shapes
}
```

---

## 5. CLI Commands (Codex Interface)

These are the commands Codex will invoke. All input/output is JSON or file paths.

### 5.1 Core Commands

```bash
# Validate a scene JSON
anime validate scenes/ep001/scene_001.json

# Render scene to MP4
anime render scenes/ep001/scene_001.json -o output/ep001/scene_001.mp4
anime render scenes/ep001/scene_001.json -o output/ --format mp4 --quality high

# Render single frame (for preview/debugging)
anime render-frame scenes/ep001/scene_001.json --time 3.5 -o frame.png

# Preview in Tauri app (Boss review)
anime preview scenes/ep001/scene_001.json

# Concatenate scenes into episode
anime concat scenes/ep001/episode.json -o output/ep001/episode_final.mp4
```

### 5.2 Lip Sync Commands

```bash
# Generate lip sync cues from audio
anime lipsync audio/voices/ep001_sc001_mimi.wav -o cues.json
anime lipsync audio/voices/ep001_sc001_mimi.wav --recognizer phonetic  # Korean

# Inject lip sync cues into existing scene JSON
anime lipsync-inject scenes/ep001/scene_001.json \
  --audio audio/voices/ep001_sc001_mimi.wav \
  --character char_mimi \
  --start-time 2.5
```

### 5.3 Asset Commands

```bash
# Search local asset database
anime asset search "forest background daytime"
anime asset search --tags "background,nature,forest"

# Import assets into DB with tags
anime asset import ./downloaded/kenney_bg/ --tags "background,kenney,cc0"
anime asset import ./my_character/ --type character --name "mimi"

# Generate asset via ComfyUI
anime asset gen \
  --prompt "cute cartoon forest background, flat colors, children illustration style" \
  --negative "realistic, photographic, dark, scary" \
  --width 1920 --height 1080 \
  --style cartoon_flat \
  -o assets/backgrounds/forest_day.png

# Bulk download public asset packs
anime asset download-pack kenney-backgrounds
anime asset download-pack opengameart-nature
```

### 5.4 Voice Commands

```bash
# Generate voice using GPT-SoVITS (assumes model already trained)
anime voice generate \
  --model son \
  --text "안녕하세요! 오늘 숲에서 놀자!" \
  -o audio/voices/ep001_sc001_son_line01.wav

# List available voice models
anime voice list
```

---

## 6. Asset Database Schema

```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY,            -- UUID
  name TEXT NOT NULL,
  type TEXT NOT NULL,             -- 'background' | 'character' | 'prop' | 'effect' | 'audio'
  subtype TEXT,                   -- 'body_part' | 'mouth' | 'eye' | 'full'
  path TEXT NOT NULL,             -- Relative file path
  width INTEGER,
  height INTEGER,
  source TEXT NOT NULL,           -- 'kenney' | 'opengameart' | 'comfyui' | 'custom'
  license TEXT NOT NULL,          -- 'cc0' | 'cc-by' | 'custom' | 'generated'
  created_at TEXT DEFAULT (datetime('now')),
  metadata TEXT                   -- JSON: { prompt, style, character_name, etc. }
);

CREATE TABLE asset_tags (
  asset_id TEXT REFERENCES assets(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (asset_id, tag)
);

CREATE INDEX idx_tags ON asset_tags(tag);
CREATE INDEX idx_type ON assets(type);
```

---

## 7. Character Manifest Format

Each character directory contains a `manifest.json`:

```json
{
  "name": "mimi",
  "displayName": "미미",
  "version": "1.0",
  "style": "cartoon_flat",
  "baseSize": { "width": 400, "height": 600 },
  "parts": {
    "body": {
      "file": "body.png",
      "pivot": { "x": 0.5, "y": 0.7 },
      "parent": null
    },
    "head": {
      "file": "head.png",
      "pivot": { "x": 0.5, "y": 0.8 },
      "parent": "body",
      "offset": { "x": 0, "y": -120 }
    },
    "arm_l": {
      "file": "arm_l.png",
      "pivot": { "x": 0.9, "y": 0.1 },
      "parent": "body",
      "offset": { "x": -80, "y": -40 }
    },
    "arm_r": {
      "file": "arm_r.png",
      "pivot": { "x": 0.1, "y": 0.1 },
      "parent": "body",
      "offset": { "x": 80, "y": -40 }
    },
    "leg_l": {
      "file": "leg_l.png",
      "pivot": { "x": 0.5, "y": 0.0 },
      "parent": "body",
      "offset": { "x": -30, "y": 80 }
    },
    "leg_r": {
      "file": "leg_r.png",
      "pivot": { "x": 0.5, "y": 0.0 },
      "parent": "body",
      "offset": { "x": 30, "y": 80 }
    }
  },
  "switchables": {
    "mouth": {
      "parent": "head",
      "offset": { "x": 0, "y": 30 },
      "frames": {
        "A": "mouth_a.png",
        "B": "mouth_b.png",
        "C": "mouth_c.png",
        "D": "mouth_d.png",
        "E": "mouth_e.png",
        "F": "mouth_f.png",
        "X": "mouth_x.png"
      },
      "default": "X"
    },
    "eyes": {
      "parent": "head",
      "offset": { "x": 0, "y": -10 },
      "frames": {
        "open": "eye_open.png",
        "closed": "eye_closed.png",
        "happy": "eye_happy.png",
        "surprised": "eye_surprised.png"
      },
      "default": "open"
    }
  },
  "animations": {
    "idle": {
      "description": "Slight breathing motion",
      "loop": true,
      "keyframes": {
        "body": [
          { "time": 0, "transform": { "scaleY": 1.0 }, "easing": "ease-in-out" },
          { "time": 1.5, "transform": { "scaleY": 1.02 }, "easing": "ease-in-out" },
          { "time": 3.0, "transform": { "scaleY": 1.0 }, "easing": "ease-in-out" }
        ]
      }
    },
    "wave": {
      "description": "Wave right arm",
      "loop": false,
      "keyframes": {
        "arm_r": [
          { "time": 0, "transform": { "rotation": 0 }, "easing": "ease-out" },
          { "time": 0.3, "transform": { "rotation": -45 }, "easing": "ease-in-out" },
          { "time": 0.6, "transform": { "rotation": -30 }, "easing": "ease-in-out" },
          { "time": 0.9, "transform": { "rotation": -45 }, "easing": "ease-in-out" },
          { "time": 1.2, "transform": { "rotation": 0 }, "easing": "ease-in" }
        ]
      }
    },
    "walk": {
      "description": "Walking cycle",
      "loop": true,
      "keyframes": {
        "leg_l": [
          { "time": 0, "transform": { "rotation": -15 }, "easing": "ease-in-out" },
          { "time": 0.3, "transform": { "rotation": 15 }, "easing": "ease-in-out" },
          { "time": 0.6, "transform": { "rotation": -15 }, "easing": "ease-in-out" }
        ],
        "leg_r": [
          { "time": 0, "transform": { "rotation": 15 }, "easing": "ease-in-out" },
          { "time": 0.3, "transform": { "rotation": -15 }, "easing": "ease-in-out" },
          { "time": 0.6, "transform": { "rotation": 15 }, "easing": "ease-in-out" }
        ],
        "arm_l": [
          { "time": 0, "transform": { "rotation": 10 }, "easing": "ease-in-out" },
          { "time": 0.3, "transform": { "rotation": -10 }, "easing": "ease-in-out" },
          { "time": 0.6, "transform": { "rotation": 10 }, "easing": "ease-in-out" }
        ],
        "arm_r": [
          { "time": 0, "transform": { "rotation": -10 }, "easing": "ease-in-out" },
          { "time": 0.3, "transform": { "rotation": 10 }, "easing": "ease-in-out" },
          { "time": 0.6, "transform": { "rotation": -10 }, "easing": "ease-in-out" }
        ]
      }
    },
    "blink": {
      "description": "Eye blink",
      "loop": false,
      "switchFrames": {
        "eyes": [
          { "time": 0, "frame": "open" },
          { "time": 0.05, "frame": "closed" },
          { "time": 0.15, "frame": "open" }
        ]
      }
    }
  }
}
```

---

## 8. Rendering Pipeline

### 8.1 Headless Rendering Flow

```
Scene JSON
    │
    ▼
[1] Parse & Validate (Zod)
    │
    ▼
[2] Resolve Assets (load PNGs into memory)
    │
    ▼
[3] For each frame (0 to duration * fps):
    │   ├─ Calculate current time
    │   ├─ Interpolate all keyframes at current time
    │   ├─ Resolve sprite switches (mouth/eye frame)
    │   ├─ Apply camera transform
    │   ├─ Compose layers bottom-to-top via PixiJS
    │   └─ Export frame as PNG to temp directory
    │
    ▼
[4] FFmpeg encode:
    ffmpeg -framerate 24 -i frames/%06d.png \
           -i audio_mixed.wav \
           -c:v libx264 -preset medium -crf 18 \
           -c:a aac -b:a 192k \
           -pix_fmt yuv420p \
           output.mp4
```

### 8.2 Audio Mixing (pre-render)

```
[1] Collect all AudioTrack entries
[2] For each voice track:
    ├─ If lipSync not populated → run Rhubarb → inject cues
    └─ Apply volume + fade
[3] Mix all tracks using FFmpeg:
    ffmpeg -i voice1.wav -i voice2.wav -i bgm.wav \
           -filter_complex "[0]adelay=2500|2500[v1];[1]adelay=5000|5000[v2];[2]volume=0.3[b];[v1][v2][b]amix=inputs=3" \
           audio_mixed.wav
```

### 8.3 Interpolation Engine

```typescript
function interpolate(
  keyframes: Keyframe[],
  currentTime: number
): Partial<Transform> {
  // 1. Find surrounding keyframes (before, after)
  // 2. Calculate progress (0-1) between them
  // 3. Apply easing function to progress
  // 4. Lerp each transform property
  // Edge cases:
  //   - Before first keyframe → use first keyframe values
  //   - After last keyframe → use last keyframe values
  //   - Rotation: use shortest path (handle 359° → 1°)
}
```

### 8.4 Supported Easing Functions

| Name | Formula |
|------|---------|
| `linear` | `t` |
| `ease-in` | `t²` |
| `ease-out` | `1 - (1-t)²` |
| `ease-in-out` | `t < 0.5 ? 2t² : 1 - (-2t+2)²/2` |
| `bounce` | Standard bounce equation |
| `elastic` | `sin(13π/2 * t) * 2^(10*(t-1))` |
| `cubic-bezier` | De Casteljau with custom control points |

---

## 9. Development Phases

### Phase 0: Foundation (Priority: CRITICAL)

**Goal**: Minimal working pipeline — JSON in, MP4 out.

- [ ] Initialize monorepo (Turborepo + pnpm)
- [ ] Define TypeScript types for Scene JSON schema
- [ ] Implement Zod validation for scene JSON
- [ ] Build keyframe interpolation engine (linear + ease-in-out)
- [ ] Build layer compositor using PixiJS (node-canvas backend)
- [ ] Build headless frame renderer (PNG sequence)
- [ ] Build FFmpeg wrapper (frames → MP4)
- [ ] Create CLI: `anime validate` + `anime render` + `anime render-frame`
- [ ] **Test**: Hand-write a minimal scene JSON with 1 background + 1 static character → MP4

### Phase 1: Character Animation

**Goal**: Movable character parts with sprite switching.

- [ ] Implement character part hierarchy (parent-child bone chain)
- [ ] Implement sprite switching (mouth shapes, eye states)
- [ ] Implement character manifest parser
- [ ] Implement preset animations from manifest (idle, walk, wave, blink)
- [ ] Create CLI: `anime lipsync` (Rhubarb wrapper)
- [ ] Create CLI: `anime lipsync-inject`
- [ ] **Test**: Character with lip sync speaking a line → MP4

### Phase 2: Camera & Effects

**Goal**: Dynamic camera and visual polish.

- [ ] Implement camera system (pan, zoom, ease)
- [ ] Implement camera shake
- [ ] Implement scene transitions (fade, cut, wipe)
- [ ] Implement effect layers (fade overlay, color tint)
- [ ] Implement audio mixing via FFmpeg
- [ ] **Test**: Multi-character dialogue scene with camera cuts → MP4

### Phase 3: Asset Pipeline

**Goal**: Codex can discover and generate assets automatically.

- [ ] Build SQLite asset database
- [ ] Build asset importer (bulk import with auto-tagging by directory)
- [ ] Build asset search (tag-based + filename fuzzy match)
- [ ] Build ComfyUI API wrapper for asset generation
- [ ] Write seed scripts for Kenney / OpenGameArt CC0 asset packs
- [ ] Create CLI: `anime asset search/import/gen/download-pack`
- [ ] **Test**: Codex searches "forest background" → gets path → uses in scene JSON

### Phase 4: Preview App

**Goal**: Boss can review animations before final render.

- [ ] Build Tauri v2 app shell
- [ ] Integrate PixiJS v8 canvas with real-time playback
- [ ] Build timeline scrubber UI
- [ ] Build layer panel (visibility toggles, z-order)
- [ ] Build playback controls (play/pause/seek/speed)
- [ ] File watcher: auto-reload when scene JSON changes
- [ ] Create CLI: `anime preview`

### Phase 5: Voice Pipeline

**Goal**: Complete voice generation and lip sync automation.

- [ ] Build GPT-SoVITS API wrapper
- [ ] Create CLI: `anime voice generate/list`
- [ ] Build automated pipeline: text → TTS → Rhubarb → inject
- [ ] **Test**: Input dialogue text → AI voice generated → lip sync applied → MP4

### Phase 6: Episode Pipeline

**Goal**: Produce full episodes.

- [ ] Define episode manifest format (scene order + transitions)
- [ ] Build scene concatenator with transitions
- [ ] Build batch render pipeline (all scenes → concat → final MP4)
- [ ] Create CLI: `anime concat`
- [ ] **Test**: 3 scenes → single episode MP4 with transitions

---

## 10. External Dependencies

### 10.1 System Requirements

```bash
# Required system packages
sudo apt install ffmpeg           # Video encoding
# Rhubarb Lip Sync — download binary from GitHub releases
# GPT-SoVITS — separate Python environment (conda recommended)
# ComfyUI — separate Python environment (existing on Boss workstation)
```

### 10.2 Node.js Dependencies

```json
{
  "dependencies": {
    "pixi.js": "^8.x",
    "canvas": "^2.x",            // node-canvas for headless rendering
    "zod": "^3.x",               // Schema validation
    "commander": "^12.x",         // CLI framework
    "better-sqlite3": "^11.x",   // Asset DB
    "glob": "^10.x",             // File pattern matching
    "sharp": "^0.33.x",          // Image processing (resize, crop)
    "chalk": "^5.x"              // CLI output coloring
  },
  "devDependencies": {
    "typescript": "^5.x",
    "turbo": "^2.x",
    "vitest": "^2.x",            // Testing
    "@types/node": "^22.x"
  }
}
```

---

## 11. Codex Usage Patterns

### 11.1 Codex Creates Scene JSON

Codex receives a scenario description and outputs a complete scene JSON:

```
Input:  "미미가 숲에서 공을 가지고 놀다가 친구 또또를 만난다. 미미가 '안녕!' 하고 인사한다."
Output: scenes/ep001/scene_003.json (complete Scene JSON with all layers, keyframes, audio refs)
```

### 11.2 Codex Writes ComfyUI Prompts

When an asset doesn't exist in the DB:

```
Need: "sunny forest clearing with a path, children's cartoon style"
Output: anime asset gen --prompt "bright sunny forest clearing with dirt path, 
        flat cartoon illustration, children's book style, vibrant colors, 
        simple shapes, no characters" --width 1920 --height 1080 --style cartoon_flat
```

### 11.3 Codex Iterates on Boss Feedback

```
Boss: "미미가 너무 빨리 걸어. 속도 절반으로."
Codex: Modifies walk keyframe durations in scene JSON (doubles all time values for leg/arm keyframes)
Boss: "anime render-frame scene_003.json --time 4.2" → checks single frame
Boss: "OK. 렌더해."
Codex: "anime render scene_003.json -o output/ep001/scene_003.mp4"
```

---

## 12. Quality & Constraints

### 12.1 Output Specs

| Property | Value |
|----------|-------|
| Resolution | 1920x1080 (default), 1280x720 (optional) |
| Frame Rate | 24 fps (default) |
| Video Codec | H.264 (libx264) |
| Audio Codec | AAC 192kbps |
| Container | MP4 |
| Max Scene Duration | 300 seconds (5 minutes) |

### 12.2 Performance Targets

| Metric | Target |
|--------|--------|
| Validate scene JSON | < 100ms |
| Render single frame | < 500ms |
| Render 30s scene (720 frames) | < 5 minutes |
| Asset DB search | < 50ms |
| Lip sync generation (30s audio) | < 30s |

### 12.3 Code Quality

- TypeScript strict mode
- All public functions documented with JSDoc
- Vitest unit tests for: interpolation, schema validation, layer composition
- ESLint + Prettier

---

## 13. File Naming Conventions

```
assets/backgrounds/{description}_{variant}.png     # forest_day.png, kitchen_night.png
assets/characters/{name}/{part}.png                 # mimi/head.png
assets/props/{category}/{name}.png                  # toys/ball_red.png
assets/audio/voices/{episode}_{scene}_{char}_{line}.wav
assets/audio/bgm/{name}.mp3
scenes/{episode}/scene_{NNN}.json
scenes/{episode}/episode.json
output/{episode}/scene_{NNN}.mp4
output/{episode}/{episode}_final.mp4
```

---

## 14. Example: Minimal Scene JSON

A complete working example for Phase 0 testing:

```json
{
  "version": "1.0",
  "meta": {
    "title": "Test Scene - Forest Hello",
    "fps": 24,
    "width": 1920,
    "height": 1080,
    "duration": 5.0
  },
  "assets": [
    {
      "id": "bg_forest",
      "type": "image",
      "source": { "path": "assets/backgrounds/forest_day.png" }
    },
    {
      "id": "char_mimi_body",
      "type": "image",
      "source": { "path": "assets/characters/mimi/body.png" }
    },
    {
      "id": "char_mimi_head",
      "type": "image",
      "source": { "path": "assets/characters/mimi/head.png" }
    }
  ],
  "layers": [
    {
      "id": "bg_main",
      "type": "background",
      "visible": true,
      "opacity": 1.0,
      "zIndex": 0,
      "assetId": "bg_forest",
      "transform": { "x": 960, "y": 540, "rotation": 0, "scaleX": 1, "scaleY": 1 }
    },
    {
      "id": "char_mimi",
      "type": "character",
      "visible": true,
      "opacity": 1.0,
      "zIndex": 10,
      "pivot": { "x": 200, "y": 300 },
      "transform": { "x": 400, "y": 700, "rotation": 0, "scaleX": 0.5, "scaleY": 0.5 },
      "keyframes": [
        { "time": 0, "transform": { "x": -200 }, "easing": "linear" },
        { "time": 2.0, "transform": { "x": 400 }, "easing": "ease-out" },
        { "time": 5.0, "transform": { "x": 400 }, "easing": "linear" }
      ],
      "parts": [
        {
          "id": "body",
          "assetId": "char_mimi_body",
          "pivot": { "x": 100, "y": 200 },
          "transform": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 },
          "keyframes": []
        },
        {
          "id": "head",
          "assetId": "char_mimi_head",
          "pivot": { "x": 75, "y": 120 },
          "parentPartId": "body",
          "transform": { "x": 0, "y": -120, "rotation": 0, "scaleX": 1, "scaleY": 1 },
          "keyframes": [
            { "time": 2.5, "transform": { "rotation": 0 }, "easing": "ease-out" },
            { "time": 3.0, "transform": { "rotation": -10 }, "easing": "ease-in-out" },
            { "time": 3.5, "transform": { "rotation": 10 }, "easing": "ease-in-out" },
            { "time": 4.0, "transform": { "rotation": 0 }, "easing": "ease-in" }
          ]
        }
      ]
    }
  ],
  "camera": {
    "initialTransform": { "x": 960, "y": 540, "zoom": 1.0 },
    "keyframes": [
      { "time": 2.0, "zoom": 1.3, "x": 500, "y": 500, "easing": "ease-in-out" },
      { "time": 4.0, "zoom": 1.0, "x": 960, "y": 540, "easing": "ease-out" }
    ]
  },
  "audio": []
}
```

---

## 15. Public Asset Sources (Pre-seed)

| Source | URL | License | Content |
|--------|-----|---------|---------|
| Kenney | kenney.nl/assets | CC0 | 60k+ 2D sprites, backgrounds, UI |
| OpenGameArt | opengameart.org | CC0 filter | Nature, indoor, city backgrounds |
| itch.io CC0 | itch.io/game-assets/assets-cc0 | CC0 | 2,500+ asset packs |
| Freepik | freepik.com | Free (attribution) | Vector backgrounds |
| Vecteezy | vecteezy.com | Free (attribution) | Cartoon backgrounds |
| Freesound | freesound.org | CC0 filter | SFX, ambient sounds |

### Asset Download Script (Phase 3)

```bash
# Kenney background pack
anime asset download-pack kenney-backgrounds
# → Downloads, extracts, auto-tags, imports to SQLite

# OpenGameArt nature CC0
anime asset download-pack opengameart-nature
```

---

## END OF SPECIFICATION

**Next Steps for Claude Code:**
1. Initialize the monorepo structure
2. Implement Phase 0 (foundation) first
3. Test with the minimal scene JSON example in Section 14
4. Proceed phase by phase

**Boss Role:**
- Create character PNG parts following the manifest format (Section 7)
- Review previews and provide feedback
- Approve final renders
