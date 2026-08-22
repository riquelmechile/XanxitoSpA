# XanxitoSpA SVG Craft v2 — Worldbuilding Systems

## Purpose

Create repository-native SVG documentation that behaves like a coherent visual universe, not decorative clip-art. Every asset must clarify architecture, role, flow or state while remaining memorable enough that a reader can recognize the system by silhouette alone.

This is a **project-local skill for XanxitoSpA**. It does not modify or replace Xanxittoo's built-in `svg-craft` skill.

## Core law

> One system, many artifacts, one unmistakable visual language.

An SVG is successful only when it does all three:

1. communicates its technical idea without prose;
2. belongs unmistakably to the XanxitoSpA visual world;
3. survives GitHub rendering, small screens and monochrome/low-detail viewing.

## Visual world

### Base palette

- Obsidian: `#070B14`
- Deep Navy: `#0D1321`
- Slate: `#172033`
- Ivory: `#F6F0DF`
- Muted Ivory: `#B9B2A3`
- Metal Gold: `#D6B56B`

Department accents are sparse and role-specific. Gold is structure/authority, never a flood fill.

### The Company Deck

Stable functions are represented as original premium archetype cards:

- Executive — **The Sovereign** — gold — compass/crown geometry
- Commercial — **The Hunter** — crimson — target/trajectory geometry
- Finance — **The Keeper** — emerald — vault/ledger geometry
- Operations — **The Forge** — orange — forge/gear geometry
- Customer — **The Envoy** — cyan — signal/speech geometry
- Administration & Risk — **The Sentinel** — violet — shield/watch geometry
- Data — **The Oracle** — indigo — eye/node geometry
- Creative — **The Shaper** — magenta — prism/form geometry

These are original archetypes. Never reproduce an existing game's characters, card frames, logos, UI, typography or trade dress.

## Card anatomy

Every premium role card should have:

1. strong outer silhouette with chamfered or cut corners;
2. crest/role glyph in a top medallion;
3. one large geometric portrait/silhouette occupying ~55–65% of height;
4. role accent used in 10–20% of the composition;
5. functional role title before lore name;
6. short motto (3–7 words);
7. restrained technical metadata, never paragraph text;
8. a clear visual hierarchy at 320px height.

The face/portrait is abstract and symbolic: layered polygons, masks, light planes, orbit lines, node constellations, forge plates, shield planes, etc. It should feel characterful without requiring raster illustration.

## Diagram grammar

Use the same visual vocabulary as the cards:

- Executive/authority edges: gold
- Work/delegation: ivory/slate
- Competitive branches: paired opposing accents
- Verified outcomes: emerald/gold
- Risk/escalation: violet
- Data flows: indigo
- Creative flows: magenta

Nodes should look like parts of the same universe rather than default flowchart boxes. Prefer crests, cut-corner panels and curved paths.

## Composition rules

- Prefer one focal concept per asset.
- Negative space is a structural element.
- Use asymmetric balance when possible; avoid dashboard grids unless the subject is literally a roster/board.
- No glassmorphism, generic neon cyberpunk, random gradients, excessive pills or UI-kit cards.
- Gradients are allowed only to describe material/light/depth and should have a clear directional reason.
- Limit decorative micro-lines; every ornament should reinforce role, hierarchy or motion.

## Silhouette test

Before accepting a card or diagram, mentally remove:

- all text;
- all small labels;
- all accent colors.

The main shape should still communicate a different identity from the other assets. If every card becomes the same rectangle with a different icon, redesign it.

## Pure SVG rules

Standalone SVG MUST include:

- `viewBox`
- `role="img"`
- `aria-labelledby`
- non-empty `<title>`
- non-empty `<desc>`

Default to pure vector:

- no `<image>`
- no base64/data URI raster content
- no external HTTP assets
- no scripts
- no inline event handlers
- no `javascript:`
- no `<foreignObject>`

Use system/local font stacks only. IDs must be unique within each file.

## GitHub delivery

Repository-owned SVGs embedded with HTML in README should use canonical URLs:

`https://raw.githubusercontent.com/riquelmechile/XanxitoSpA/main/<path>.svg`

Every raw URL must map to a real committed file. After push, verify the public repository README and at least one raw SVG URL resolve successfully.

## Accessibility

- Text/background contrast should be readable at normal GitHub scale.
- Do not encode essential meaning only by color.
- `<title>` states what the asset is.
- `<desc>` states what the reader should understand from it.
- Decorative shapes do not need individual accessibility labels.

## Multi-size gate

Review at three mental/render sizes:

- **small**: 320–420px wide — silhouette and primary title survive;
- **normal**: README width — hierarchy is crisp;
- **large**: source/zoom — no clipping, broken joins or sloppy line collisions.

## World consistency gate

Before delivery, compare all current assets side by side:

- same border language?
- same lighting/material logic?
- role accents consistent?
- same typography family?
- same crest grammar?
- no one card looks like it came from another product?

## Technical truth gate

Visual storytelling must never invent architecture. Diagram labels and claims must match the canonical XanxitoSpA docs and current verified runtime state.

## Workflow

`intent → technical truth → visual metaphor → silhouette → vector construction → structural validation → README delivery mapping → multi-size visual review → world consistency review → push → public GitHub render verification`

## Anti-patterns

Reject:

- stock illustrations;
- copied game aesthetics;
- same card repeated with only color/icon swapped;
- huge paragraphs inside SVG;
- meaningless circuitry/hexagon backgrounds;
- fake metrics;
- overly detailed portraits that collapse at README scale;
- SVGs that only work on one background;
- unverified raw GitHub URLs.
