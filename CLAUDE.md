# OtterScale Dashboard

SvelteKit 2 + Svelte 5 (runes) + Tailwind v4 + shadcn-svelte. i18n via Paraglide (`messages/en.json`, `messages/zh-hant.json`; import `m` from `$lib/messages`).

## Do not edit `src/lib/components/ui/`

Vendored shadcn-svelte components, kept pristine so they can be re-pulled from upstream. Restyle through tokens and base-layer selectors in `src/app.css` (e.g. `[data-slot='button']`), or wrap them in `src/lib/components/custom/`.

## Design language

Calm, precise, professional — Linear's restraint, Apple's interaction feel, nothing decorative.

- **Color**: cool neutral grays; orange (`--brand` / `primary`) only for primary actions, focus, selection and small accents. Never large orange surfaces, orange body text, or orange headings. Use `text-foreground` / `text-muted-foreground` for text, not `text-primary`.
- **Status**: `success`, `warning`, `destructive`, `info` tokens. Show status with `StatusBadge` (`$lib/components/custom/status-badge`), never with ad-hoc colored text.
- **Hierarchy**: one focal point per view. Prefer weight and spacing over borders and color. `font-mono` only for identifiers, commands and code. No all-caps watermarks or decorative giant text.
- **Motion**: use `ease-(--ease-smooth)` with `--duration-fast` / `--duration-base`; animate transform/opacity only. Reduced-motion is handled globally.
- **No hardcoded colors** (`bg-blue-500`, hex values) — always tokens, so light and dark both work.
- Contrast must meet WCAG AA (4.5:1 for text).

## Two audiences: simple vs advanced mode

`viewMode` store (`$lib/stores`, persisted) is `'simple'` (executives: plain language, outcomes) or `'advanced'` (engineers: the system as Kubernetes reports it). Toggle lives in the top bar.

When building or changing a view, decide what each mode shows:

- **Simple**: plain-language labels (via `m.*`), status as meaning ("Healthy", "2 of 3 ready"), Kubernetes plumbing hidden (namespaces, labels, selectors, YAML, the Kubernetes nav).
- **Advanced**: exact Kubernetes names and values; nothing hidden.
- Hide, don't remove: simple mode moves defaults, and the raw value stays reachable (tooltip, column menu, or switching mode).

Table helpers: column labels and technical-column list in `dynamic-table/column-labels.ts`; status reading in `dynamic-table/status.ts`; use UI schema `'status'` for Ready/Status/State/Phase columns.

All user-facing strings go through Paraglide in both locales.

## Checks

`pnpm check`, `pnpm lint`, `pnpm test:unit -- --run`.
