# Copilot Instructions — The Match Signal OS

When generating or modifying UI/UX code in this repository, follow the Design Context below verbatim. It is the binding source for all visual and interaction decisions and is mirrored from `.impeccable.md` at the project root.

## Design Context

### Users

**One operator. Just David.** This is a private console, not a SaaS dashboard.

- Context: Used during matchday windows (pre-match, live, post-match) and in early-morning prep slots to assemble briefs.
- Job-to-be-done: Look at a fixture, understand the signal in under five seconds, ship Telegram + social copy in under two minutes, log accuracy after the whistle.
- The operator already knows the domain. The UI does not need to teach football, the model, or its own affordances. It needs to disappear into the work.
- Density is welcome. Hand-holding is not. Loading states, empty states, and confirmations should be terse — one line, no illustrations.

### Brand Personality

- **Three words**: editorial, composed, opinionated.
- **Voice rules baked into product copy**: "Say what to watch, not what is guaranteed", "Use short sentences and concrete match language", "Avoid official World Cup affiliation claims", "Keep betting language out of public social copy."
- **Emotional goal**: the calm of a broadsheet matchday section the morning of a knockout tie. Authority without volume.

### Aesthetic Direction

**Editorial broadsheet. FT / The Athletic / Bloomberg Businessweek with a tactical scout's discipline.** Light only — no dark mode, no theme switch.

- **Reference vibe**: print edition of the FT pink pages, The Athletic's tactical longreads, a UEFA technical report PDF, a Monocle data spread.
- **Anti-references — do NOT do these**:
  - Glassmorphism / backdrop-filter blur on cards.
  - Glow effects / `box-shadow: 0 0 X rgba(green, .25)`.
  - Gradient text (e.g. white-to-gray h1).
  - Neon green (#10b981) or any AI cyan-on-dark palette.
  - Cards inside cards inside cards.
  - Dark mode with green accents.
  - Generic icon-above-heading templating.
  - Bounce or elastic easing.

### Palette

| Role            | Token             | Value      | Use                                                     |
| --------------- | ----------------- | ---------- | ------------------------------------------------------- |
| Paper           | `--paper`         | `#F4EFE3`  | Page canvas. Warm cream, never pure white.              |
| Paper raised    | `--paper-raised`  | `#FBF7EC`  | Inset panels, table backgrounds.                        |
| Ink             | `--ink`           | `#141612`  | Primary text, rules, headers. Never pure black.         |
| Ink muted       | `--ink-muted`     | `#5C5A52`  | Secondary text, labels, captions.                       |
| Ink quiet       | `--ink-quiet`     | `#8B8678`  | Hint text, disabled, helper copy.                       |
| Pitch green     | `--pitch`         | `#13513F`  | Brand accent. Eyebrows, links, key numbers. **Sparingly.** |
| Signal gold     | `--gold`          | `#B8862A`  | Editorial rule lines, pull-quotes, lead-story tag.      |
| Pressure red    | `--red`           | `#9F3A31`  | Data semantic only — risk, alerts, live.                |
| Analysis blue   | `--blue`          | `#254E70`  | Data semantic only — informational tags.                |

### Typography

- **Display (serif)**: Fraunces, variable, opsz tuned. Use opsz max for h1/h2.
- **Body (sans)**: Inter Tight, tracking -0.01em.
- **Mono**: JetBrains Mono — only inside `<code>`, fixture IDs, API console.
- **Drop**: Outfit, Plus Jakarta Sans.
- **Numbers in Fraunces** with `font-variant-numeric: tabular-nums`.

### Layout & Space

- 4px baseline grid. Workspace max-width 1440px, centered, side gutters `clamp(20px, 4vw, 56px)`.
- Replace cards with hairline rules (1px ink-muted-12).
- Asymmetric columns by default. Never 50/50 unless intentional.
- Tables: tabular-nums, no zebra, ruled rows, sticky thead with hairline bottom.
- Large stat numbers set in Fraunces 500 opsz 60.

### Motion

- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`. No bounce, no elastic.
- Durations: 180ms state / 260ms entrance / 400ms staggered.
- Transform and opacity only — never animate layout properties.
- Respect `prefers-reduced-motion: reduce`.

### Interaction

- Three button tiers: primary, ghost, destructive. Hover is an underline, not a glow or translate.
- Inputs: bottom-rule only, no boxed input. Focus thickens the rule.
- Selected row: 2px gold left rule, paper-raised background.
- Empty states: one ink-muted sentence, no illustration.
- Loading: 1px gold progress bar at workspace top, not spinners over content.

### Design Principles

1. **Ink on paper, not pixels on glass.** No blur, no glow, no gradient backgrounds.
2. **Three colors do all the work.** Paper, ink, pitch-green. Gold hairline accent. Red and blue only when data demands.
3. **The serif carries the brand.** Authority comes from typography, not chrome.
4. **Rhythm > containers.** Hairline rules and baseline rhythm replace card nesting.
5. **Density with composure.** Show everything that matters, but each element earns its weight.
6. **Disappear into the work.** Motion for state changes only. Loading is a 1px bar. Hover is an underline.
