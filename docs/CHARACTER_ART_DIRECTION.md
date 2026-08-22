# XanxitoSpA — Character Art Direction V2

## Why V2 exists

The first Company Deck proved the card/worldbuilding idea but the portraits were too geometric and repeated the same bust structure. That made the functions look like icon variants instead of characters.

V2 separates the problem correctly:

- **character illustration** carries personality, anatomy, pose, story, material and silhouette;
- **SVG** carries frame, crest, typography, responsive board composition and technical diagrams.

The ambition is premium game key art. The identity remains original XanxitoSpA IP.

## Visual thesis

> Eight business functions should feel like eight people you could identify from silhouette alone.

Shared world: near-future enterprise mythology. The world is dark, architectural and tactile; gold communicates structure/authority and each department owns one restrained accent color. Technology is purposeful rather than generic cyberpunk decoration.

The roster should read like a cast, not a dashboard.

## The eight archetypes

### Executive — The Sovereign

Tall vertical silhouette; calm open decision gesture; asymmetric command coat; compass-like baton; warm architectural decision chamber. Authority without royal costume cliché.

### Commercial — The Hunter

Forward diagonal; agile asymmetrical tailoring; long directional scarf-panel; transparent opportunity lens; market paths. Pursuit without literal bow/gun hunter language.

### Finance — The Keeper

Grounded symmetry; stable layered mantle; circular ledger/vault instrument; emerald glass and brass; quiet treasury depth. Protective optionality rather than greed.

### Operations — The Forge

Broad asymmetric work silhouette; reinforced shoulder; compact industrial torque tool; production hall and controlled sparks. A builder, not a fantasy blacksmith.

### Customer — The Envoy

Open human gesture; soft signal scarf; listening pin; visible empathy; communication arcs and distant people. No call-center headset cliché.

### Administration & Risk — The Sentinel

Offset defensive stance; translucent policy shield-plane; verification staff; raised stop/verify gesture; layered thresholds. Vigilant and fair, never authoritarian.

### Data — The Oracle

Elongated observer silhouette; evidence prism; optical glass; sparse traces; skeptical attentive face. Evidence and observation rather than mystical prophecy or hooded-hacker tropes.

### Creative — The Shaper

Dynamic twisting pose; a luminous surface visibly transforming 2D → film → 3D; physical models in a studio void. Transformation is the story.

## Production pipeline

```text
Company function truth
        ↓
Character DNA
        ↓
6 silhouette thumbnails
        ↓
2 pose/value compositions
        ↓
color + material + lighting pass
        ↓
final 4:5 splash/concept illustration
        ↓
quality/originality/crop review
        ↓
SVG frame + title overlay
        ↓
desktop/mobile roster
        ↓
GitHub public render review
```

V1 rendering is intentionally single-provider at the model layer: GPT-5.6 Sol owns the brief and the built-in Responses `image_generation` tool renders the image. The current specialized backend is GPT Image 2, but it is a renderer rather than another principal. Secondary model providers are not part of the V1 art pipeline.

## Current repository state

The public GitHub surface now ships **Raster Roster V1** instead of the vector concept deck. It contains eight committed synthetic human visual identities plus a raster hero and 4×2 Company Deck:

- `assets/brand/hero-real.jpg` / `hero-real-mobile.jpg`;
- `assets/brand/company-deck-real.jpg` / `company-deck-real-mobile.jpg`;
- `assets/characters/roster-v1/portrait-*.jpg`;
- `assets/characters/roster-v1/card-*.jpg`;
- `assets/characters/roster-v1/manifest.json`.

The visual language follows the approved Company OS reference: obsidian/navy atmosphere, human faces, warm structural typography, restrained department accents and a clearly dominant Executive composition. The eight cards are a **public visual identity layer**, not a runtime principal registry. A portrait does not create employment status, Work ownership, authority, budget, credentials or capability access.

`assets/characters/character-dna.json` remains the canonical art-direction specification. It contains the richer silhouette/pose/prop/environment target for The Sovereign, Hunter, Keeper, Forge, Envoy, Sentinel, Oracle and Shaper. Raster Roster V1 gives GitHub a real human roster immediately; the native GPT image pipeline may later replace individual portrait/card assets with higher-fidelity cinematic key art without changing Company OS semantics or README structure.

The committed faces are synthetic visual identities and are not depictions of real employees or public figures. Asset provenance is recorded in `assets/characters/roster-v1/README.md` and `manifest.json`.

## Mobile/GitHub rules

- 4 detailed cards in one README table row is prohibited.
- The roster provides desktop 4×2 and mobile 2×4 board assets selected through `<picture>`.
- Complex architecture diagrams provide a portrait mobile version with larger labels.
- The card itself must remain useful at ~180 px width.
- Text inside illustration is forbidden; frame text stays short and large.

## Originality boundary

High craft is the target; copying another franchise is not.

Do not reproduce:

- existing characters or facial likenesses;
- recognizable costumes, weapons or insignia;
- another game's card frame/trade dress;
- franchise logos, fonts, lore or faction language.

The design should be recognizably XanxitoSpA even if every label is removed.

## Review gates

1. **Silhouette:** each role distinct in black-and-white thumbnail.
2. **Narrative:** pose/face/prop imply a story.
3. **Function:** metaphor supports the real business role.
4. **Roster:** no duplicated pose/material/prop category.
5. **Anatomy:** believable proportions/hands/face.
6. **Lighting:** character separates from environment at small size.
7. **Originality:** no strong resemblance to existing entertainment IP.
8. **Crop:** face, hands and signature prop survive 4:5 framing.
9. **Mobile:** card reads at GitHub phone width.
10. **Technical truth:** role description matches canonical architecture.
