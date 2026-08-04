# Nexus product design system

## Visual direction

Nexus is a precise, light analytical workspace. It should feel composed and
dependable: near-neutral surfaces, compact information density, clear writing,
and a single cool-indigo signal for actions and focus. The interface helps a
person understand their data; it must never compete with it.

## Foundations

- **Canvas:** soft blue-grey white; use white only for working surfaces and
  overlays.
- **Accent:** indigo is reserved for primary actions, active navigation, focus,
  and the smallest amount of high-priority status.
- **Type:** use the product sans for every operational heading and body. Mono is
  only for source labels, technical metadata, and compact status labels.
- **Spacing:** prefer 8px rhythm, generous page edges, and tight relationships
  inside related controls. Use dividers and alignment before cards.
- **Depth:** borders establish ordinary separation. Shadows are subtle and only
  reinforce an interactive surface or overlay.

## Product composition

- **Analyze** is the home surface. A first-time person should understand the
  path: add data, see what Nexus found, then ask a question.
- **Data** supports analysis. It contains uploads, datasets, and connections.
  Sequences are opened from their data context, never promoted above analysis.
- Content pages start with a compact eyebrow, direct title, one sentence of
  utility copy, then the working surface. Do not add marketing heroes.
- Chat answers are adaptive. Do not force a report template; show tables,
  visualizations, citations, caveats, and methodology when the question or
  analysis calls for them.

## Components and states

- Buttons have one primary action per working region. Secondary actions are
  quiet, bordered or text-level; destructive actions stay explicit.
- Input and composer focus uses the indigo ring and a subtle elevation shift.
- Empty states explain what is missing and offer the next useful action. Avoid
  large boxed illustrations or generic welcome copy.
- Loading states preserve page geometry. AI progress uses short plain-language
  stages and may reveal supporting detail; never expose prompts or raw traces.
- Errors state what failed, preserve user input when possible, and offer the
  appropriate retry or recovery action.
- Files, chats, and results are private by default. Explain source and sharing
  scope near the relevant action, without interrupting routine work.

## Responsive behavior

- Desktop (1024px+) optimizes for an always-visible workspace, compact rail,
  and readable data tables.
- Tablet (768–1023px) preserves the core working surface while reducing gutters
  and secondary chrome.
- Mobile (<768px) supports upload, chat, result review, and basic data actions.
  Do not compress a complex table or sequence canvas into an unusable layout.
- Every interactive target is at least 40px. Keyboard focus and non-color status
  cues are mandatory at every size.

## Guardrails

Do not use dark-first palettes, lime accents, decorative gradients, glass cards,
oversized serif headings, dense card mosaics, status colours as decoration, or
ornamental AI imagery. A screen should remain clear if shadows and icons are
removed.
