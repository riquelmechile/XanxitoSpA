# XanxitoSpA Character Art v1 — Enterprise Archetypes

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
