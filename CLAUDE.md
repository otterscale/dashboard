# Dashboard: notes for coding agents

SvelteKit 2 + Svelte 5 (runes) + Tailwind 4 + shadcn-svelte (Bits UI). Node 24 (engine-strict), pnpm.

## Commands

- `pnpm install`, then `pnpm dev`
- `pnpm check` (svelte-check), `pnpm lint` (prettier + eslint), `pnpm format`
- `pnpm exec vitest --run src/lib/components/dashboard`

## Where things are

- Theme tokens (colours, radius, fonts): `src/app.css`
- App shell and sidebar: `src/routes/(auth)/+layout.svelte`, `src/lib/components/layout/` (`nav-main`, `nav-secondary`, `nav-user`, `workspace-switcher`)
- dashboard/overview: `src/routes/(auth)/[cluster]/[workspace]/dashboard/overview/`, widgets in `src/lib/components/dashboard/workspace/`
- dashboard/cluster: `src/routes/(auth)/[cluster]/[workspace]/dashboard/cluster/`, widgets in `src/lib/components/dashboard/cluster/`
- Widgets are registered in `overview/widgets.ts` and laid out by `$lib/components/custom/widget-grid`
- Vendored shadcn-svelte primitives: `src/lib/components/ui/`

## Svelte

- Svelte 5 runes only: `$state`, `$derived`, `$effect`, `$props`, snippets. No `export let`, no `on:` directives, no slots.
- Look up Svelte and SvelteKit APIs through the `svelte` MCP server before writing a component, and run its `svelte-autofixer` on every component you create or edit until it reports nothing.
- Look up shadcn-svelte components through the `shadcn-svelte` MCP server. Restyle vendored primitives through tokens or the `class` prop first; edit files under `ui/` only when that is not enough.

## Facts that are easy to get wrong

- Use Tailwind token names (`bg-card`, `text-muted-foreground`); never hard-code a colour.
- `thresholdClasses()` in `src/lib/prometheus.ts` maps healthy to `text-chart-2` and warning to `text-chart-1`. Many pages rely on this, so those two tokens carry meaning. Light and dark keep the same hues for `chart-1` to `chart-5`.
- The sidebar has its own tokens (`sidebar`, `sidebar-foreground`, `sidebar-accent`, `sidebar-primary`, ...). Several sidebar children currently use general tokens such as `text-muted-foreground`; check them if you change sidebar colours.
- `src/app.css` tokens are global: a change there affects every page.
- In light mode the page and the cards are both white. A dashboard card is set apart by `shadow-(--card-frame)` (a soft shadow in light mode, a hairline in dark mode); a card with a coloured ground (`bg-mint`, `bg-attention`) carries none.
- Charts use LayerChart through `$lib/components/ui/chart`.
- User-facing strings come from `m.*()` in `$lib/messages` (Paraglide). Some dashboard strings are still hard-coded English; leave copy changes out of scope.
- `.claude/` is git-ignored, so project-level skills are not committed.

## Checking UI work

Open the page through the `chrome-devtools` MCP server after a visual change: light and dark mode, a narrow width, and the loading, empty and error states, not only the populated one.
