# Longform-First Production Strategy

## Thesis

The project is no longer exploring isolated shorts first.
It now has enough narrative mass to behave like a real series pipeline: long-form episodes are the source, and shorts are extracted from the strongest beats after the episode structure is stable.

That sounds slower, but it is actually more coherent.
Shorts made in isolation drift toward momentary spectacle.
Shorts derived from a finished episode inherit emotional context, recurring motifs, and character continuity for free.

## What Changed

### 1. Scenario Source Exists

Season 1 is no longer hypothetical.
The story source now lives in:

- `scenes/Dalis_Creek_EP01_Full.md`
- `scenes/Dalis_Creek_EP02_EP10.md`
- `scenes/Dalis_Creek_EP11_EP20.md`
- `scenes/Dalis_Creek_Series_Bible.md`

This means the next bottleneck is not brainstorming.
It is conversion: scenario -> episode breakdown -> shot plan -> scene JSON -> previz -> final render.

### 2. Asset Library Was Reorganized

Image assets were re-saved into prompt/theme-oriented folders such as:

- `assets/backgrounds/CORE LOCATIONS (4 Seasonal Variants Each)/`
- `assets/characters/Dali's Creek (달이네 냇가) — Character Design/`
- `assets/characters/KEY PROPS/`
- `assets/characters/SUPPORTING CHARACTERS/`
- `assets/NATURE ELEMENTS (4 generations)/`
- `assets/FOOD ITEMS (4 generations)/`
- `assets/SERIES UI (3 generations)/`

This is a better creative structure than the earlier flat file layout, but it breaks old hard-coded scene references.
The system should now treat the new folder taxonomy as reality and build canonical asset IDs on top of it.

### 3. Shorts Became Derived Outputs

The scenario files already annotate many moments as `⭐ 숏폼 추출 구간`.
That is the right relationship:

- long-form establishes story truth
- shorts harvest the strongest emotional or visual moments

The shorts pipeline should therefore start after episode structure, not before it.

## Strategic Consequences

### Primary Unit Of Production

The unit is now the **episode**, not the short clip.

That means planning should move in this order:

1. episode scenario lock
2. scene segmentation
3. asset coverage check
4. previz render
5. final render
6. short extraction
7. metadata generation

### Primary Source Of Truth

The source of truth is now:

- scenario markdown for story intent
- scene JSON for shot execution

Shorts should never become an alternate truth source.

### Asset Discipline

The renderer and any future asset DB should not assume legacy filenames like `forest_day.png`.
They should resolve against the reorganized prompt-based folders and then expose stable canonical IDs upward.

## Recommended Immediate Work

1. Create a canonical asset manifest that maps the new folder structure to stable IDs.
2. Create a season production map that lists episode priority, short extraction moments, and likely reusable locations.
3. Choose one pilot long-form episode, ideally `EP01`, as the end-to-end proof.
4. Only after `EP01` previz is stable, generate shorts from its marked extraction scenes.

## Working Rule

The episode is the river.
Shorts are what we bottle from it.
