# Narrative Payload Contract

## Thesis

The engine needed a layer between scenario markdown and Scene JSON.
That missing layer is now formalized as:

`scenario markdown -> narrative payload -> scene plan -> Scene JSON -> previz -> Blender final`

This borrows the strongest pattern from `22b-studio` without importing its heavy runtime assumptions.

## Why This Exists

Scene JSON is execution detail.
Scenario markdown is story intent.
If those two touch directly, planning becomes fragile and every revision leaks into rendering too early.

The narrative payload is the compact story contract.
The scene plan is the production translation of that contract.

## What The Payload Holds

- story and sequence identity
- scene archetype
- philosophy note
- emotional texture
- narrative checks
- key prop and silence
- beat list with shot hints

## What The Scene Plan Adds

- timed shot list
- camera intent per beat
- prompt packets for mood, character, background, sketch, final still, and motion
- review gates
- stable asset requests for later canonical mapping

## CLI Path

```bash
# 1. Inspect scenario scenes
anime scenario list scenes/Dalis_Creek_EP01_Full.md

# 2. Extract one scene into a narrative payload
anime scenario payload scenes/Dalis_Creek_EP01_Full.md --scene 8 -o build/scene08.payload.json

# 3. Build a scene plan package
anime plan build build/scene08.payload.json --output build/scene08_plan

# 4. Compile a renderable Scene JSON
anime scene compile build/scene08_plan/scene-plan.json -o build/scene08.json

# Optional: override built-in asset mappings
anime scene compile build/scene08_plan/scene-plan.json -o build/scene08.json --asset-catalog scenes/plans/examples/asset-catalog.sample.json

# 5. Validate or render
anime validate build/scene08.json
anime render-frame build/scene08.json --time 8 -o build/scene08_frame.png
```

This is now the intended bridge from long-form writing to previz.

## Working Rule

Long-form truth locks first.
Only then should Scene JSON and short extraction begin.
