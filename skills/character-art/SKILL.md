# XanxitoSpA Character Art v2 — Enterprise Archetypes

## Purpose

Create original, high-impact character illustrations for the XanxitoSpA Company Deck. The target is **premium game-key-art quality and memorability**, not imitation of any existing game/IP.

The character must communicate its business function before the viewer reads the label.

## Pipeline

`business truth → Character DNA → 2 blind Sol/xhigh directions → owner decision → native image_generation → crop test → SVG frame → GitHub mobile test`

V1 uses GPT-5.6 Sol as the only cognitive model and the built-in OpenAI image-generation tool as renderer. The art direction contract is stable; no secondary model provider is used.

## V1 GPT-only generation contract

Preferred output:

- portrait 4:5, minimum 1536×1920;
- original stylized cinematic digital painting;
- full/three-quarter character, not a floating head;
- readable face/gesture;
- strong foreground/midground/background separation;
- clean outer silhouette;
- one dominant key light + colored rim light;
- controlled detail density: face/hands/prop high detail, secondary areas quieter;
- no text, logos, watermarks or UI inside the illustration;
- no copyrighted character resemblance or recognizable franchise costume language.

## Prompt anatomy

Each prompt MUST specify:

1. role fantasy;
2. body/silhouette;
3. pose/action;
4. facial attitude;
5. costume/material hierarchy;
6. signature prop;
7. environment;
8. palette;
9. lighting;
10. camera/lens/composition;
11. areas of detail vs rest;
12. exclusions/negative constraints.

Never prompt only with words like `epic`, `cinematic`, `premium` and expect coherent art.

## Quality gates

### Silhouette gate
At 128 px tall and without color, the role remains recognizable.

### Narrative gate
A one-sentence story can be inferred from pose, face, prop and environment.

### Function gate
The visual metaphor supports the business function without becoming literal office stock art.

### Roster gate
No two characters share the same stance, shoulder silhouette, prop category or dominant shape language.

### Originality gate
Reject outputs that strongly resemble existing game/movie characters, recognizable costumes, weapons, insignia or card frames.

### Crop gate
The 4:5 crop must preserve head, hands/signature prop and the dominant silhouette. No critical information may depend on the bottom 15%, which can be covered by the card title plate.

### GitHub gate
Final composite must survive at ~180 px wide in a two-column mobile roster and ~320 px wide on desktop.

## Visual world rules

Shared across the roster:

- near-future enterprise mythology, not medieval fantasy;
- obsidian/navy world with warm ivory/gold structural accents;
- department color appears mostly as rim light, material insert or environmental energy;
- tactile materials: fabric, metal, glass, ceramic, carbon, paper, industrial wear;
- faces remain human and emotionally legible;
- technology is purposeful, not random cyberpunk circuitry.

## Anti-patterns

Reject:

- same body/pose with color swaps;
- generic hooded hacker;
- generic fantasy knight/mage/archer;
- corporate person in suit holding a laptop;
- excessive neon/cyberpunk noise;
- photobashed logos, charts or UI behind the character;
- text generated inside the image;
- over-dark faces;
- hands/props cropped accidentally;
- empty glamour pose that does not explain the role.


## Roster V2 style lock

Before rendering any final roster asset, load `assets/characters/character-dna.json` and `assets/characters/character-missions.json`. The shared world lock is evidence, not optional flavor. Every character must share the same finishing language while remaining individually unmistakable.

Default COMPETE directions:

- `archetype-motion` — strongest silhouette, role fantasy, action line and environmental story;
- `human-material` — strongest face, emotion, tactile material response and premium portrait finish.

Both are GPT-5.6 Sol/xhigh branches and may render in parallel. The Creative Supervisor evaluates both with the same VisualFitness rubric. Do not expose either candidate to chat before adjudication.

### Style champion protocol

The first selected character becomes a temporary style champion only for rendering language: contrast curve, edge hierarchy, skin treatment, material response, atmospheric depth and crop behavior. It must **not** donate its face, pose, costume silhouette or prop to other characters. Once 3+ roster members are selected, replace the single-image anchor with a roster style board assembled from all champions to avoid clone drift.

### Character identity guard

Reject a candidate if its face geometry, shoulder silhouette, coat shape, hand pose or prop category is materially interchangeable with another roster member. Department color alone never counts as differentiation.

### Background runtime law

Generation is a company job. If the OpenAI runtime credential or artifact sink is unavailable, the mission remains `STAGED`/queued and consumes no render attempt. Never fall back to chat rendering or another model provider merely to complete the asset.
