# XanxitoSpA SVG Craft v3 — Character Systems + Technical Clarity

## Scope

This is a **project-local XanxitoSpA skill**. It does not modify Xanxittoo's built-in `svg-craft` skill.

SVG is no longer asked to fake painterly character illustration. Use it where vector is strongest: frames, crests, title systems, technical diagrams, geometric effects, masks and responsive documentation art.

For premium role cards, use a hybrid pipeline:

`Character DNA → original splash/concept raster → SVG frame/crest/title overlay → README composition`

If no governed image generator is available, ship an explicit vector **concept silhouette**, not a generic polygon face and never pretend it is final splash art.

## Core laws

1. **Character first, card second.** The figure must be memorable before the frame is added.
2. **Silhouette before detail.** At 160 px tall, each role must still be distinguishable by body shape, pose and prop.
3. **Fantasy must encode function.** Visual storytelling must explain the business function without prose.
4. **One world, eight identities.** Shared material/lighting rules; different anatomy, pose, shape language and environment.
5. **Mobile is a primary delivery surface.** GitHub 360–430 px is a target, not an afterthought.
6. **Technical diagrams optimize comprehension, not spectacle.** Fewer words, larger labels, vertical flow on mobile.
7. **Pure vector frame.** Never embed raster in SVG with `<image>`/base64. Raster and SVG stay separate assets in the source pipeline.
8. **Original IP only.** Never copy Riot/LoL characters, costumes, frames, logos, UI, typography, lore or trade dress. Quality ambition may be high; visual identity must be XanxitoSpA's own.

## Character-card anatomy

Premium card target:

- 4:5 or 2:3 illustration crop;
- character occupies 65–80% of visual area;
- eyes/face or signature prop near an upper-third focal point;
- one dominant directional light and one colored rim/accent;
- environment suggests department function, but stays quieter than the figure;
- frame is thin and secondary;
- text zone is short: function + archetype only;
- no paragraph copy inside card art;
- no emoji/glyph dependence for primary crest.

## Character readability checklist

Before accepting character art, remove the text and mentally desaturate it. Ask:

- Is the pose unique in the roster?
- Is the body silhouette unique?
- Can the signature prop be recognized?
- Does the material language differ (tailoring, armor, toolwear, fabric, glass, etc.)?
- Is there one clear face/gesture/story beat?
- Is there a hierarchy of detail (focal detail + rest areas)?
- Does the environment support the function instead of competing?

If two roles become interchangeable silhouettes, redesign one.

## Roster DNA

- **Executive — The Sovereign:** tall vertical silhouette; asymmetric command coat; calm open stance; gold/ivory; architectural/boardroom light; authority without monarchy cosplay.
- **Commercial — The Hunter:** forward diagonal silhouette; agile tailoring; trajectory/market motifs; crimson; confident pursuit, not literal bow-hunter cliché.
- **Finance — The Keeper:** grounded symmetrical silhouette; ledger/vault geometry; emerald; composed expression; protective rather than miserly.
- **Operations — The Forge:** broad kinetic silhouette; industrial utility wear/exoskeletal tooling; amber; physical competence; sparks/production depth.
- **Customer — The Envoy:** open human silhouette; scarf/signal lines; cyan; visible empathy and attention; human contact as focal gesture.
- **Administration & Risk — The Sentinel:** defensive offset silhouette; shield/gate/document-seal language; violet; vigilant, not authoritarian.
- **Data — The Oracle:** elongated/light silhouette; crystal/optic/data constellation language; indigo; observation and evidence, not mystical fortune-telling.
- **Creative — The Shaper:** dynamic twisting silhouette; ribbons/prism/modeling surfaces; magenta; transformation across 2D/video/3D/CAD.

## SVG technical rules

Standalone SVG MUST include:

- `viewBox`;
- `role="img"`;
- `aria-labelledby`;
- non-empty `<title>` and `<desc>`;
- well-formed XML with escaped entities (`&amp;`, etc.);
- unique IDs.

Reject:

- `<image>`;
- base64/data URI image payloads;
- external HTTP assets;
- scripts;
- event handlers;
- `javascript:`;
- `<foreignObject>`;
- bare `&` or malformed XML;
- tiny text that only works when zoomed.

## GitHub/mobile delivery

README must not place four detailed cards in one HTML table row. Use either:

- a 2-column roster; or
- `<picture>` with separate desktop and mobile board assets.

For complex diagrams, create two assets:

- desktop landscape;
- mobile portrait.

Use `<picture><source media="(max-width: 700px)" ...>` and verify the public GitHub page after push.

Text-size floor for technical SVGs: design labels to remain readable when the full asset is shown at ~380 px wide. Prefer 30–44 px source text on a ~900–1000 px-wide mobile viewBox.

## Validation workflow

`technical truth → Character DNA → silhouette thumbnails → art/placeholder → SVG frame → desktop/mobile composition → XML validation → URL/path validation → small/normal/large visual review → public GitHub render → delivery`

CI/validators prove syntax and references. They do **not** prove taste. Visual review remains mandatory.
