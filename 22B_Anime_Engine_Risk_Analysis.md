# 22B Anime Engine — Risk Analysis & Mitigation Spec v1.0

> **Project**: 22B Anime Engine
> **Author**: 22B Labs / The 4th Path
> **Date**: 2026-04-13
> **Purpose**: Codex handoff supplement — anticipated problems and pre-built solutions

---

## 1. Rendering & Performance

### 1.1 Headless PixiJS + node-canvas Limitations

**Problem**: PixiJS is designed for WebGL browser rendering. node-canvas only supports Canvas 2D context, not WebGL. PixiJS filters (blur, glow, color matrix) and blend modes may not work in headless mode.

**Solution**:
- Use `@pixi/node` (official Node.js adapter for PixiJS v8) which provides headless WebGL via `headless-gl`
- If `headless-gl` fails on Boss workstation (GPU driver issues), fallback chain:
  1. `@pixi/node` + headless-gl (best: full WebGL)
  2. Puppeteer + Chromium headless (medium: browser-based, slower)
  3. Pure Canvas 2D renderer (worst: no filters, basic compositing only)
- Implement renderer abstraction so all three backends share the same API
- **Test in Phase 0**: Verify headless-gl works with RTX 4080 Super drivers before committing

### 1.2 Render Speed Bottleneck

**Problem**: 1080p @ 24fps = 720 frames per 30s scene. At 500ms/frame = 6 minutes per scene. For a 10-scene episode, that's 1 hour render time.

**Solution**:
- Render at 720p → Real-ESRGAN upscale to 1080p/4K (net faster than native 1080p)
- Implement frame caching: unchanged frames between keyframes → copy previous frame
- Static background layer: render once, composite as cached bitmap
- Parallel frame rendering: split frame ranges across CPU threads (Ryzen 9 7950X3D = 16 cores)
- Animatic mode: skip every other frame + no anti-aliasing → 10x faster preview

### 1.3 FFmpeg Audio/Video Sync Drift

**Problem**: Frame-based video + time-based audio can drift, especially on long scenes. Lip sync becomes misaligned.

**Solution**:
- Always use constant frame rate (`-r 24`) and audio sample rate (`-ar 48000`)
- Calculate exact audio offset per track: `startTime * sampleRate`
- Use FFmpeg `-itsoffset` for precise per-track delay
- Post-render validation: extract audio timestamps and compare against lip sync cue times
- CLI command: `anime validate-sync output.mp4` — checks A/V alignment

---

## 2. 2D → 3D → Multi-View Pipeline

### 2.1 TripoSR Output Quality

**Problem**: TripoSR generates 3D mesh from single image, but cartoon characters with flat colors and simple shapes often produce poor 3D geometry — back of head may be distorted, limbs may merge.

**Solution**:
- Use **Wonder3D** instead for multi-view generation (6 consistent views without explicit 3D mesh)
- If 3D mesh needed: TripoSR → manual cleanup pass in Blender (one-time per character)
- **Best approach**: Generate front + side view with ComfyUI (character sheet prompt), then use Wonder3D for remaining angles. Two input views >> one input view for quality.
- Add `quality_check` flag in character manifest: if multi-view PNGs fail visual QC, fallback to manually drawn angle variants

### 2.2 Style Consistency Across Views

**Problem**: AI-generated multi-view images may have inconsistent colors, line weights, or proportions between angles.

**Solution**:
- Post-process all generated views through a style normalization pipeline:
  1. Color palette extraction from front view → apply to all views
  2. Edge detection + consistent line weight via OpenCV
  3. Background removal + consistent canvas size via rembg
- Store a `style_reference.png` per character, use as ControlNet reference for all ComfyUI generations
- Implement `anime asset normalize --character mimi` CLI command

### 2.3 Parts Separation from Multi-View

**Problem**: TripoSR/Wonder3D outputs full-body images, not separated parts (head, body, arms). Auto-segmentation may cut incorrectly.

**Solution**:
- Use SAM2 (Segment Anything Model 2) for automatic part segmentation
- Codex provides text prompts per part: "head", "left arm", "body" → SAM2 segments
- Fallback: Boss manually separates parts for the front view only; other views use full-body sprite switching (simpler but effective for cutout animation)
- For simple characters (like Pororo-style round bodies), full-body sprite switching per angle may be sufficient — no part separation needed

---

## 3. Motion Data Pipeline

### 3.1 3D BVH → 2D Keyframe Projection Errors

**Problem**: When projecting 3D joint rotations to 2D, depth information is lost. Arms crossing the body, turning motions, and foreshortening create incorrect 2D poses.

**Solution**:
- Project from camera angle matching the current character view (front/side/3-4)
- Implement view-aware projection: if character faces camera → frontal projection; if character turns → switch to appropriate view + re-project
- Simplify: for cutout animation, only extract **rotation angles** (not positions) from BVH. Cutout parts rotate around pivots — no need for full IK chain.
- Create a `motion_simplifier` module that:
  1. Reads BVH joint rotations
  2. Maps to character part hierarchy (BVH "LeftArm" → manifest "arm_l")
  3. Clamps rotation ranges to prevent unnatural poses (arm max ±90°)
  4. Outputs anime-engine keyframe JSON

### 3.2 Mixamo Skeleton Mismatch

**Problem**: Mixamo uses a complex humanoid skeleton (65+ bones). Boss's characters have 6-8 parts. Mapping is not 1:1.

**Solution**:
- Create a `skeleton_map.json` config:
```json
{
  "mixamo_to_anime": {
    "mixamorig:Hips": "body",
    "mixamorig:Spine2": "body",
    "mixamorig:Head": "head",
    "mixamorig:LeftArm": "arm_l",
    "mixamorig:LeftForeArm": "arm_l",
    "mixamorig:RightArm": "arm_r",
    "mixamorig:RightForeArm": "arm_r",
    "mixamorig:LeftUpLeg": "leg_l",
    "mixamorig:LeftLeg": "leg_l",
    "mixamorig:RightUpLeg": "leg_r",
    "mixamorig:RightLeg": "leg_r"
  },
  "combine_strategy": "sum_rotations"
}
```
- Multiple Mixamo bones → single part: sum rotations with weight
- Pre-build mapping configs for: Mixamo, CMU MoCap, Rokoko

### 3.3 Stiff/Robotic Motion

**Problem**: Cutout animation inherently looks stiffer than frame-by-frame animation. Simple rotation keyframes lack squash-and-stretch, anticipation, and follow-through.

**Solution**:
- **Secondary motion system**: auto-generate subtle secondary animations
  - Hair/accessories: delayed follow (spring physics sim)
  - Body: breathing idle loop always active
  - Eyes: random blink every 3-5 seconds
  - Head: micro-nod during speech
- **Easing presets**: never use linear interpolation for character motion. Default to ease-in-out. Provide "snappy" (overshoot) and "heavy" (slow ease) presets.
- **Squash-and-stretch via scale keyframes**: on impact/landing, briefly scaleX +5% scaleY -5%, then restore
- **Anticipation**: auto-insert small reverse motion before main action (raise arm = briefly lower first)
- These can be implemented as **motion modifiers** that Codex applies to raw keyframe data:
  ```
  anime motion apply-secondary scene.json --character char_mimi
  anime motion add-anticipation scene.json --character char_mimi
  ```

---

## 4. Audio & Lip Sync

### 4.1 Rhubarb Korean Language Support

**Problem**: Rhubarb's PocketSphinx recognizer only supports English. Korean dialogue will produce inaccurate mouth shapes.

**Solution**:
- Use Rhubarb's `--recognizer phonetic` mode — language-independent, analyzes audio waveform patterns rather than speech recognition
- Provide `--dialogFile` with romanized Korean text to improve accuracy
- If phonetic mode is insufficient: build a Korean phoneme → mouth shape mapping layer:
  1. Use Whisper to transcribe Korean audio → timestamped phonemes
  2. Map Korean phonemes (ㅏ,ㅓ,ㅗ,ㅜ,ㅡ,ㅣ,ㅂ,ㅁ,...) to Rhubarb shapes (A-F,X)
  3. Output same JSON format as Rhubarb
- CLI: `anime lipsync audio.wav --lang ko` (auto-selects Korean pipeline)

### 4.2 GPT-SoVITS Voice Clone Quality

**Problem**: 5-minute audio samples may not capture all phonemes, leading to artifacts on certain sounds. Children's voices are harder to clone (higher pitch, less consistent).

**Solution**:
- Record at least 10 minutes of clean audio per family member
- Record in quiet environment, consistent mic distance
- Include diverse phonemes: read a prepared Korean pangram script
- For children: record multiple sessions, select best segments
- Post-process with noise reduction (RNNoise, open source) before training
- Implement quality check: generate test sentences → Boss listens and approves before production use
- Fallback: use recorded audio for main characters, AI voice only for minor/background characters

### 4.3 Audio Mixing Clipping/Balance

**Problem**: Multiple audio tracks (voice + BGM + SFX) may clip or have poor balance. BGM drowning out dialogue is a common issue in amateur animation.

**Solution**:
- Implement automatic **ducking**: when voice track is active, reduce BGM volume by 60%
- FFmpeg sidechain compression: `-filter_complex "[1]volume=0.3[bgm];[0][bgm]amix"`
- Standardize levels: voice at -6dB, SFX at -12dB, BGM at -18dB
- Add `audio.ducking` field to Scene JSON:
```json
{
  "audio_mix": {
    "voice_level": -6,
    "sfx_level": -12,
    "bgm_level": -18,
    "ducking": { "trigger": "voice", "reduce": "bgm", "amount": -12, "attack": 0.1, "release": 0.5 }
  }
}
```

---

## 5. Asset Management

### 5.1 License Compliance Tracking

**Problem**: Mixing CC0, CC-BY, and custom assets. Accidentally using CC-BY assets without attribution, or using non-commercial assets commercially.

**Solution**:
- Asset DB enforces `license` field as required (NOT NULL)
- On render, auto-generate credits file from all referenced assets:
  `anime render scene.json → output/credits.txt`
- Block import of assets with incompatible licenses:
  `anime asset import file.png --license nc` → WARNING: non-commercial only
- Default filter: asset search only returns CC0 + custom + generated assets
- CLI: `anime asset audit episode.json` → lists all assets with license status

### 5.2 Asset Style Inconsistency

**Problem**: Mixing Kenney (pixel/geometric), Freepik (vector), ComfyUI (painted), and Boss's custom art. Visual styles clash.

**Solution**:
- Define project-level `style_config.json`:
```json
{
  "style": "cartoon_flat",
  "color_palette": ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"],
  "outline": { "weight": 2, "color": "#2D3436" },
  "shading": "flat"
}
```
- ComfyUI prompt template includes style constraints automatically
- Post-process all imported assets through style normalization:
  1. Color quantization to palette
  2. Edge detection + outline enforcement
  3. Shading removal (flatten to solid colors)
- `anime asset normalize file.png --style cartoon_flat`

### 5.3 Asset DB Growth / Storage

**Problem**: Public asset packs (Kenney = 60k+) + generated assets can grow to tens of GB. Search becomes slow.

**Solution**:
- SQLite with FTS5 (full-text search) for tag search — stays fast up to millions of rows
- Only index metadata in DB, actual files on disk with structured directory
- Implement `anime asset prune --unused` to remove assets not referenced by any scene
- Lazy download: don't bulk-download all public packs. Download on-demand when Codex searches and finds a match in remote index.

---

## 6. Codex / AI Agent Integration

### 6.1 Scene JSON Validation Failures

**Problem**: Codex (LLM) may generate invalid JSON — missing required fields, wrong types, referencing non-existent assets, overlapping keyframe times.

**Solution**:
- Zod schema validation with **detailed error messages** pointing to exact field
- Pre-flight validation before any render:
  1. Schema validation (types, required fields)
  2. Asset existence check (all assetId references resolve to files)
  3. Timeline consistency (keyframes in chronological order, no gaps)
  4. Layer z-index uniqueness check
  5. Audio file existence + format check
- `anime validate scene.json` outputs machine-readable JSON errors that Codex can parse and self-correct
- Provide Codex with a **JSON schema file** + **example scenes** in the repo for few-shot learning

### 6.2 Codex Generates Unrealistic Animations

**Problem**: LLM may produce keyframes that result in unnatural motion — arms rotating 360°, characters teleporting, limbs penetrating body.

**Solution**:
- Implement **constraint validation** in the engine:
  - Joint rotation limits per part (defined in character manifest)
  - Maximum velocity limit (pixels/second) to prevent teleportation
  - Collision detection: warn if parts overlap beyond threshold
- Provide Codex with a **motion vocabulary** — predefined animation templates:
  ```
  Available motions: walk, run, wave, nod, shake_head, jump, sit, stand,
  turn_left, turn_right, bow, clap, point, shrug, dance_simple
  ```
- Codex composes scenes from vocabulary rather than generating raw keyframes
- Raw keyframes only for custom motions not in vocabulary

### 6.3 Iteration Speed

**Problem**: Codex generates JSON → render → Boss reviews → feedback → regenerate. If render takes 5 minutes per cycle, iteration is slow.

**Solution**:
- **Three-tier preview system**:
  1. **Wireframe** (instant): colored rectangles representing layers, no image loading
  2. **Animatic** (5 seconds): low-res images, 6fps, no effects
  3. **Draft** (30 seconds): full images, 12fps, basic effects
  4. **Final** (5 minutes): 1080p, 24fps, all effects + upscale
- Codex uses wireframe/animatic for self-validation before presenting to Boss
- Boss reviews animatic for timing → draft for visual → final for delivery
- File watcher in preview app: Boss keeps Tauri open, Codex edits JSON → instant reload

---

## 7. Children's Content Quality

### 7.1 Animation Looks Cheap/Amateur

**Problem**: Cutout animation can look low-budget if not executed well. Comparison with Pororo (full 3D) will be unfavorable.

**Solution**:
- Accept the style difference — target **Pinkfong/Baby Shark style** (2D flat) not Pororo (3D). Pinkfong is massively successful with simple 2D animation.
- Quality multipliers that make 2D cutout look professional:
  1. **Consistent art style**: all assets from same style pipeline
  2. **Smooth easing**: never linear, always ease-in-out minimum
  3. **Secondary motion**: hair, clothes, breathing — adds life
  4. **Sound design**: rich SFX makes simple visuals feel premium
  5. **Camera work**: dynamic camera hides simple animation
  6. **Color grading**: mood-appropriate post-processing
  7. **Timing**: proper comic timing on reactions and dialogue
- Study reference: Charlie and Lola (BBC), Ben and Holly (eOne) — both are cutout animation and critically acclaimed

### 7.2 Uncanny Valley on AI-Generated Assets

**Problem**: ComfyUI-generated backgrounds and props may have subtle AI artifacts (extra fingers on background characters, warped text, inconsistent perspective).

**Solution**:
- Use ComfyUI only for backgrounds and props (no human/character generation)
- Characters are Boss-designed → no AI artifacts on main subjects
- Post-generation QC: Codex runs basic checks (aspect ratio, color range, edge artifacts)
- Boss review gate: all AI-generated assets require approval before use in production scenes
- Build an asset approval workflow:
  ```
  anime asset gen --prompt "..." → pending/
  anime asset approve pending/forest_bg.png → assets/backgrounds/
  anime asset reject pending/forest_bg.png --reason "perspective warped"
  ```

### 7.3 Child Safety / Content Appropriateness

**Problem**: AI-generated content (scenarios, assets, sounds) may inadvertently produce inappropriate content for children.

**Solution**:
- Codex system prompt includes strict children's content guidelines
- Content filter on all AI-generated text/scenarios:
  - No violence beyond slapstick
  - No scary imagery
  - Positive resolution to conflicts
  - Age-appropriate vocabulary
- Asset generation prompts always include: "children's illustration, safe for kids, bright colors, friendly"
- Negative prompts always include: "scary, dark, violent, realistic, creepy"
- Boss reviews every episode before publish — final human gate

---

## 8. Multi-Language Pipeline

### 8.1 Lip Sync Mismatch After Dubbing

**Problem**: Different languages have different phoneme timing. Korean "안녕하세요" and English "Hello" have completely different durations and mouth shapes.

**Solution**:
- Re-run Rhubarb lip sync per language version (not reuse original cues)
- Allow audio tracks to have different durations per language:
  - Adjust scene duration if needed
  - Or adjust speech speed in TTS to match original timing
- `anime localize` command handles full pipeline:
  1. Translate dialogue text
  2. Generate TTS in target language
  3. Re-run Rhubarb on new audio
  4. Adjust scene timing if needed
  5. Re-render with new audio + lip sync

### 8.2 Text on Screen (Signs, Titles)

**Problem**: On-screen text (episode titles, signs in backgrounds) needs translation too.

**Solution**:
- All on-screen text is a separate text layer in Scene JSON, never baked into background images
- Text layers have `localization` field:
```json
{
  "type": "text",
  "content": { "ko": "숲으로 가자!", "en": "Let's go to the forest!", "ja": "森へ行こう！" },
  "font": "NotoSansKR",
  "size": 48
}
```
- Renderer selects text based on target language
- Font fallback chain: NotoSans (supports CJK + Latin)

---

## 9. Deployment & Operations

### 9.1 Codex Operating Without Developer Assistance

**Problem**: After Claude Code builds the engine, Codex operates it daily. If something breaks (dependency update, FFmpeg version change, CUDA error), Codex may not be able to fix it.

**Solution**:
- Dockerize the entire engine:
  ```dockerfile
  FROM node:22
  RUN apt-get install -y ffmpeg
  COPY . /app
  WORKDIR /app
  RUN pnpm install
  ```
- Pin all dependency versions (exact, no semver ranges)
- Include health check CLI: `anime doctor` — verifies all dependencies (FFmpeg, Rhubarb, node-canvas, GPU)
- Error messages include self-repair hints:
  ```
  ERROR: FFmpeg not found
  FIX: sudo apt install ffmpeg
  ```
- Comprehensive logging: all CLI commands log to `~/.anime-engine/logs/`

### 9.2 Workstation Resource Contention

**Problem**: Boss workstation runs ComfyUI, GPT-SoVITS, anime-engine renderer, and Codex simultaneously. VRAM (16GB) and RAM (32GB) may be insufficient.

**Solution**:
- Pipeline stages are sequential, not parallel:
  1. Asset generation (ComfyUI) → GPU heavy, runs first
  2. Voice generation (GPT-SoVITS) → GPU moderate, runs second
  3. Lip sync (Rhubarb) → CPU only
  4. Render (anime-engine) → GPU light (2D compositing)
  5. Upscale (Real-ESRGAN) → GPU heavy, runs last
- Codex orchestrates stages sequentially with explicit GPU release between stages
- Add `--gpu-wait` flag: polls nvidia-smi, waits until VRAM usage < 2GB before starting
- Emergency fallback: render in CPU-only mode (slower but always works)

### 9.3 Data Loss / Scene Corruption

**Problem**: Power outage or crash during render could corrupt output. Accidental scene JSON edit could break episode.

**Solution**:
- Git-based scene version control:
  ```
  scenes/ is a git repo
  Codex commits after every scene change with descriptive message
  Boss can `git log` and `git revert` any change
  ```
- Render output is never in-place — always writes to temp dir, then atomic move to output
- Auto-backup: `anime backup` copies scenes/ and assets/ to timestamped archive
- Scene JSON includes `checksum` field — renderer verifies before starting

---

## 10. Summary: Risk Priority Matrix

| Risk | Impact | Likelihood | Mitigation Effort | Priority |
|------|--------|-----------|-------------------|----------|
| Headless rendering fails | Critical | Medium | Medium (fallback chain) | **P0** |
| Korean lip sync inaccuracy | High | High | Low (phonetic mode + Whisper) | **P0** |
| Codex generates invalid JSON | High | High | Low (Zod validation) | **P0** |
| Stiff/robotic animation | High | High | Medium (secondary motion system) | **P1** |
| TripoSR quality for cartoon | Medium | High | Medium (Wonder3D + style norm) | **P1** |
| Asset style inconsistency | Medium | Medium | Medium (style normalization) | **P1** |
| Render speed bottleneck | Medium | Medium | Low (720p + upscale) | **P2** |
| BVH → 2D projection errors | Medium | Medium | Medium (view-aware projection) | **P2** |
| VRAM contention | Medium | Low | Low (sequential pipeline) | **P2** |
| Multi-lang lip sync mismatch | Low | Low | Low (re-run per language) | **P3** |
| Data loss | Low | Low | Low (git + backup) | **P3** |

**P0 items must be resolved in Phase 0.**
**P1 items must be resolved by Phase 2.**
**P2/P3 items can be addressed as encountered.**

---

## END OF RISK ANALYSIS

**Integration Note for Claude Code:**
- This document supplements the main Dev Spec (22B_Anime_Engine_Dev_Spec.md)
- P0 mitigations must be built into the Phase 0 foundation
- Each solution described here should be implemented as part of the corresponding development phase
- Test cases for each risk should be included in the Vitest test suite
