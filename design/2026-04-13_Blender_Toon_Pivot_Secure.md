# Blender Toon Pivot In Secure Environment

## Thesis

The Blender pivot still makes sense in a secure environment, but only if the pipeline is designed as **local-first** from the start.
If a critical step depends on an external web service, then the architecture is not production-ready for this workspace.

## What Changes Under Security Constraints

The visual decision stays the same:

- keep the current 2D engine for previz
- use Blender toon-shaded 3D for final render

The operational decision changes:

- prefer local binaries, local models, and local files
- treat any internet-dependent tool as optional preprocessing, not a required production dependency
- keep one canonical Scene JSON so review and final render do not diverge

## Secure Pipeline

```text
Scene JSON
    -> local validation
    -> local previz render
    -> local Blender scene build
    -> local toon-shaded render
    -> local FFmpeg mux
    -> final MP4
```

## Tool Policy

### Allowed As Core Production Dependencies

- Blender 4.x
- FFmpeg
- Rhubarb Lip Sync
- GPT-SoVITS if hosted locally
- TripoSR / Wonder3D only if installed and executed locally
- local Python scripts for rigging, import, cleanup, and render automation

### Not Safe As Required Runtime Dependencies

- Mixamo as a mandatory online step
- hosted mesh-generation services
- cloud-only asset generation
- pipelines that require public API calls during render or review

## Practical Interpretation

There are two acceptable modes:

1. **Fully local mode**
   Every step runs inside the secure environment.
   This is the target architecture.

2. **Airlock ingest mode**
   Some external preprocessing happens outside the secure zone, then only approved outputs are imported.
   Example: a rigged FBX or cleaned mesh enters the environment after review.
   This can be useful during R&D, but should not become the permanent production assumption.

## Recommended Replacements

If Mixamo is blocked, do this instead:

- keep a local library of approved idle, walk, run, and gesture actions in `.fbx` or `.blend`
- retarget those actions inside Blender with local scripts
- build one reusable baseline rig per character family

If external 3D generation is blocked, do this instead:

- use the 2D art as the source package
- create one cleaned hero mesh manually in Blender
- reuse and iterate that asset rather than regenerating from scratch

## Implementation Order

1. Stabilize the current 2D previz engine.
2. Add a local Blender package to the repo for scene build and render scripts.
3. Prove one secure end-to-end shot with no network dependency.
4. Only after that, evaluate whether outside-the-zone preprocessing is worth the operational cost.

## Decision Rule

Do not let convenience leak into the trust boundary.
If the render path cannot survive without the internet, it is still a prototype.
