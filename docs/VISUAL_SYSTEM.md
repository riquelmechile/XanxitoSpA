# XanxitoSpA Visual System — The Company Deck V2

## Intent

XanxitoSpA should not look like an AI dashboard, generic workflow graph or SaaS starter. The visual system should make the product thesis obvious:

> A company is an organized cast of functions that can reason, compete, coordinate, act, verify and evolve.

The Company Deck turns stable business functions into a memorable roster. The target is the emotional clarity and character memorability of premium game key art while remaining wholly original XanxitoSpA IP.

## V2 correction

V1 used repeated geometric busts. They proved the frame language but failed the character test: changing color/icon was doing too much of the identity work.

V2 separates responsibilities:

- **character art** = anatomy, face, pose, prop, story, environment, materials and silhouette;
- **SVG** = frame, crest, typography, effects, responsive roster and technical diagrams.

The repository currently ships full-body **vector character concepts** to lock pose/silhouette/composition. Final painterly art is specified in `assets/characters/character-dna.json` and V1 renders it through the GPT/OpenAI native image-generation path; only the art layer changes, not the card system.

## Core palette

| Token | Value | Use |
| --- | --- | --- |
| Obsidian | `#050812` | world/background |
| Deep Navy | `#0B1120` | depth / garments / panels |
| Ivory | `#F7F1E2` | primary type / highlights |
| Muted | `#AEB5C2` | secondary type |
| Metal Gold | `#D8B86A` | authority / shared structure |

### Department accents

| Function | Archetype | Accent | Primary silhouette cue |
| --- | --- | --- | --- |
| Executive | The Sovereign | Gold | tall vertical coat + open decision gesture |
| Commercial | The Hunter | Crimson | forward diagonal + opportunity lens |
| Finance | The Keeper | Emerald | grounded symmetry + ledger rings |
| Operations | The Forge | Amber | broad shoulder/tool triangle |
| Customer | The Envoy | Cyan | open hand + signal scarf |
| Administration & Risk | The Sentinel | Violet | shield-plane + verify gesture |
| Data | The Oracle | Indigo | elongated observer + evidence prism |
| Creative | The Shaper | Magenta | twisting body + transforming surface |

## Character world

Near-future enterprise mythology — tactile, architectural and human. Gold is structural rather than decorative. Department colors appear as rim light/material accents, not full neon floods. Technology must perform a function; random circuitry is banned.

The roster should be diverse in body silhouette, pose, material, age/face language and movement. No two roles may use the same primary prop category or stance.

For detailed briefs, see [`CHARACTER_ART_DIRECTION.md`](CHARACTER_ART_DIRECTION.md).

## Card anatomy V2

1. character is the focal point and occupies most of the upper card;
2. frame is thin and secondary;
3. environment supports the role fantasy but is lower contrast than the figure;
4. top crest is small, structural and original;
5. bottom plate contains only function + archetype;
6. no paragraph text/motto inside the card;
7. art is cropped so face, hand gesture and signature prop survive;
8. card remains readable at ~180 px width.

## Responsive roster

A four-column HTML table is prohibited for detailed card art because GitHub mobile compresses it too aggressively.

README uses `<picture>`:

- desktop board: 4 × 2;
- mobile board: 2 × 4.

The mobile board is a separately composed SVG, not a browser-scaled desktop afterthought.

## Diagram grammar V2

Technical diagrams retain the same world but optimize comprehension over character spectacle.

- authority/decision edges: gold;
- competitive candidates: opposing accents;
- verified outcomes: emerald;
- data/evidence: indigo;
- creative: magenta;
- risk/escalation: violet.

Complex diagrams ship in two compositions:

- landscape desktop;
- portrait mobile with larger text and vertical flow.

## GitHub delivery invariants

All standalone SVGs must:

- be well-formed XML;
- escape entities such as `&amp;`;
- include `viewBox`, `role="img"`, `aria-labelledby`, `<title>` and `<desc>`;
- contain no external/raster `<image>` content;
- contain no script, event handlers, `foreignObject`, JavaScript or data-image payloads;
- use unique IDs.

`pnpm run visuals:check` parses every SVG as XML and maps every README raw URL back to a repository asset. The validator exists specifically so the `Admin & Risk` unescaped-ampersand failure cannot recur.

## Character-art pipeline

```text
business function truth
→ Character DNA
→ silhouette exploration
→ pose/value composition
→ original final raster illustration
→ originality/crop review
→ deterministic SVG frame/title overlay
→ desktop/mobile boards
→ public GitHub render review
```

V1 does not competitively route image models. Creative direction may COMPETE between Sol/xhigh branches, while rendering uses the native image-generation tool under the same OpenAI model policy. Switching to another generative model provider is a constitutional/evaluated change, not normal visual routing.

## Originality boundary

Never reproduce another game's:

- characters or likenesses;
- costumes/weapons/faction marks;
- card frame or trade dress;
- logos or typography;
- lore/naming language.

High craft is an ambition, not a license to copy visual identity.

## README sequence

1. hero / thesis;
2. Company Deck character roster;
3. Competitive branching;
4. Corporate evolution;
5. Kernel/planes;
6. capability/data/creative explanations;
7. verified runtime evidence;
8. quick start and deep docs.

## Future extensions

The same system can represent:

- temporary workers as smaller operative cards;
- champion/challenger process variants through frame state;
- lifecycle modes as environments;
- business-unit spawning as new decks;
- providers as tools/portals, never people;
- a future Control Plane without changing the visual mythology.


## Current Company OS architecture visual

The architecture state introduced on 2026-08-25 adds one canonical technical overview in two compositions:

- `assets/diagrams/company-os-current.svg` — landscape README / desktop;
- `assets/diagrams/company-os-current-mobile.svg` — portrait mobile.

The diagram uses four sequential concepts rather than one dense systems map:

```text
DISCOVER → CONSTITUTE → ATTEND → ACT
```

Visual semantics are intentionally aligned with runtime semantics:

- indigo = evidence/discovery;
- gold = constitutional authority and signed mandates;
- cyan = attention/wake;
- emerald = verified execution/outcomes;
- muted slate = infrastructure/trust context that does not itself grant authority.

The fail-closed trust chain is shown separately from the operational flow so OAuth/MCP write access cannot be visually confused with Founder/Owner authority. Every public architecture visual should preserve the visible invariants `xspa.write ≠ owner authority`, `wake ≠ authority` and `Work ≠ authority` where space permits.
