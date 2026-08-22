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

The image-generation provider is deliberately not part of this contract. GPT directs the brief; a governed Creative Plane can later route the actual render to the best available image provider.

## Current repository state

The repository currently ships **vector Character Concept V2** portraits. They are intentionally full-body/pose/prop concepts rather than the old repeated polygon busts. They establish:

- silhouette;
- pose;
- role prop;
- department palette;
- environment language;
- responsive card framing.

They are **not claimed to be the final painterly splash-art layer**. The final rendering briefs are stored in:

`assets/characters/character-dna.json`

When a governed image-generation provider is connected, final art can replace the concept layer without rewriting the company architecture or README structure.

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
