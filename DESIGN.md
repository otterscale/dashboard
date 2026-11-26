# DESIGN.md: dashboard design

Scope: the sidebar, dashboard/overview and dashboard/cluster. This document is the design those three areas were built from.

## 1. Design position

The readers are platform administrators watching a cluster and tenants watching their own workspace. They need to answer two questions within a few seconds: "is anything wrong right now" and "how much is left".

- **A quiet ground and very little colour.** A white page, white cards, ink-black text and one mint green. Colour appears in two cases only: healthy (mint) and needs attention (amber, red). There is no decorative colour.
- **The number is the subject.** Every card leads with a number whose unit can be read; a chart takes only a small area beside or below it.
- **The one bold element is the commit bar.** Kubernetes requests and limits go past 100 %, which a ring chart cannot draw. The commit bar marks the allocatable amount with a tick on the track and draws the part beyond it as hatching to the right of the tick, so the overcommit factor is visible at a glance. Everything else stays restrained.
- **The state card's background is the state.** One card at the top left of each page: mint while everything is fine, graphite (`attention`) only once something needs handling. On the cluster page the condition is "nodes not ready > 0"; on the workspace page it is "Not ready plus Error pods > 0". While loading or without data it is an ordinary white card.

## 2. Colour

The design keeps the semantic tokens already in `src/app.css` and adds `--ink`, `--ink-foreground`, `--ink-muted`, `--attention`, `--attention-foreground`, `--attention-muted`, `--mint`, `--mint-foreground` and `--card-frame`. The healthy card's mint ground is split out of `accent`, and `accent` goes back to a neutral selection colour. `primary` flips to white in dark mode, so it cannot stand in for `ink` or `attention`.

| token                             | Light                                          | Dark                                            | Use                                                                                                                       |
| --------------------------------- | ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `background`                      | `oklch(1 0 0)` #FFFFFF                         | `oklch(0.165 0.004 240)` ≈ #111315              | Page ground. Never darker than a card in light mode                                                                       |
| `card` / `popover`                | `oklch(1 0 0)` #FFFFFF                         | `oklch(0.205 0.004 240)` ≈ #1A1C1E              | Cards                                                                                                                     |
| `card-frame` (new)                | Two soft shadows, `rgb(0 55 112)` at 8 % / 4 % | `0 0 0 1px var(--border)`                       | What sets a card apart from the page. Applied as `shadow-(--card-frame)`                                                  |
| `foreground`                      | `oklch(0.20 0.006 240)` ≈ #17191C              | `oklch(0.94 0.008 85)` ≈ #EFECE6 (a warm white) | Main text                                                                                                                 |
| `muted-foreground`                | `oklch(0.50 0.008 240)` ≈ #666B70              | `oklch(0.68 0.006 240)` ≈ #9A9EA2               | Labels and descriptions                                                                                                   |
| `muted` / `secondary`             | `oklch(0.945 0.004 240)` ≈ #ECEEF0             | `oklch(0.245 0.004 240)` ≈ #24272A              | Inner wells and bar tracks                                                                                                |
| `border` / `input`                | `oklch(0.915 0.004 240)` ≈ #E2E5E8             | `oklch(1 0 0 / 8%)`                             | Dividers inside a card; in dark mode also the card's outline                                                              |
| `primary`                         | `oklch(0.20 0.006 240)`                        | `oklch(0.94 0.008 85)`                          | Primary buttons                                                                                                           |
| `accent`                          | `oklch(0.945 0.004 240)` (neutral grey)        | `oklch(0.27 0.004 240)`                         | Hover and selected (menus, select options, ghost buttons, ranking rows); neutral, so a selection never reads as "healthy" |
| `accent-foreground`               | Same as `foreground`                           | Same as `foreground`                            | Text on the selection ground                                                                                              |
| `mint` (new)                      | `oklch(0.93 0.035 178)` ≈ #D5EEE7              | `oklch(0.32 0.045 178)` ≈ #173F3A               | Only the ground of a healthy state card                                                                                   |
| `mint-foreground` (new)           | `oklch(0.30 0.05 178)` ≈ #12403A               | `oklch(0.90 0.06 178)` ≈ #BFEDE2                | Text on the mint ground                                                                                                   |
| `ring`                            | `oklch(0.70 0.07 178)`                         | `oklch(0.60 0.08 178)`                          | Keyboard focus                                                                                                            |
| `destructive`                     | `oklch(0.55 0.20 27)` ≈ #C8372D                | `oklch(0.70 0.17 25)` ≈ #F0766A                 | Failures and values over a threshold                                                                                      |
| `chart-1`                         | `oklch(0.58 0.13 62)` ≈ #A86A12 (amber)        | `oklch(0.78 0.13 75)` ≈ #E0A84A                 | **Warning** (the orange of `thresholdClasses`)                                                                            |
| `chart-2`                         | `oklch(0.52 0.09 178)` ≈ #24806F (mint)        | `oklch(0.76 0.11 178)` ≈ #4CC7B2                | **Healthy** (the green of `thresholdClasses`) and the accent                                                              |
| `chart-3`                         | `oklch(0.27 0.006 240)` ≈ #26292D              | `oklch(0.92 0.006 85)` ≈ #E8E6E1                | First chart series (ink)                                                                                                  |
| `chart-4`                         | `oklch(0.60 0.012 220)` ≈ #7F8A90              | `oklch(0.62 0.008 240)` ≈ #8A8E92               | Second chart series (grey)                                                                                                |
| `chart-5`                         | `oklch(0.80 0.010 220)` ≈ #BCC4C8              | `oklch(0.42 0.006 240)` ≈ #55595D               | Third chart series (light grey)                                                                                           |
| `attention` (new)                 | `oklch(0.36 0.008 240)` (graphite)             | `oklch(0.115 0.003 240)` ≈ #08090A              | Ground of a card that says something needs a look                                                                         |
| `attention-foreground` (new)      | `oklch(0.97 0.004 85)`                         | `oklch(0.94 0.008 85)`                          | Text on the attention ground                                                                                              |
| `attention-muted` (new)           | `oklch(0.84 0.006 240)`                        | `oklch(0.66 0.006 240)`                         | Secondary text on the attention ground                                                                                    |
| `ink` (new)                       | `oklch(0.19 0.006 240)` ≈ #15171A              | `oklch(0.115 0.003 240)` ≈ #08090A              | The darkest surface: chart tooltips                                                                                       |
| `ink-foreground` (new)            | `oklch(0.96 0.006 85)`                         | `oklch(0.94 0.008 85)`                          | Text on ink                                                                                                               |
| `ink-muted` (new)                 | `oklch(0.72 0.006 240)`                        | `oklch(0.66 0.006 240)`                         | Secondary text on ink                                                                                                     |
| `sidebar`                         | `oklch(0.985 0 0)` ≈ #FAFAFA                   | `oklch(0.145 0.004 240)` ≈ #0D0F11              | Sidebar ground: one step off the page, with a hairline between them in light mode                                         |
| `sidebar-foreground`              | Same as `foreground`                           | Same as `foreground`                            |                                                                                                                           |
| `sidebar-accent` / `-foreground`  | `oklch(0.95 0 0)` / same as `foreground`       | `oklch(0.245 0.004 240)` / same as `foreground` | Hover and selected in the sidebar: a grey one step darker than the sidebar ground                                         |
| `sidebar-primary` / `-foreground` | Same as `ink` / `ink-foreground`               | `chart-2` / `ink`                               | Ground of the workspace icon                                                                                              |
| `sidebar-border` / `sidebar-ring` | Same as `border` / `ring`                      | Same as `border` / `ring`                       |                                                                                                                           |

Rules:

- `chart-1` to `chart-5` keep the same hues in light and dark and change only in lightness.
- Contrast: every token used for text reaches at least 4.5:1 on its own ground. `chart-2` and `chart-1` are deep enough for that because `thresholdClasses` uses them as text colours.
- A state is always "an icon or a word, plus colour", never colour alone. A zero uses `muted-foreground` and takes no colour.

## 3. Type

No new typefaces: the installed Inter Variable, Noto Sans TC Variable and JetBrains Mono Variable. Character comes from weight and numeral settings, not from a different face.

| Role                             | Setting                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Page title                       | 30/36, weight 350, tracking -0.02em                                                   |
| Page subtitle                    | 14/20, `muted-foreground`; identifiers inside it in monospace and `foreground`        |
| Card title                       | 14/20, weight 550                                                                     |
| Card description, table headings | 12/16, `muted-foreground`, weight 450, not bold, not uppercase                        |
| Key number                       | 28/32, weight 400; on a state card 36/40, weight 350                                  |
| Unit                             | Half the number's size, `muted-foreground`, a narrow space after the number           |
| Body and tables                  | 13/20                                                                                 |
| Identifiers                      | JetBrains Mono 12.5, only for machine-made strings: versions, node names, image names |

Every number uses `tabular-nums slashed-zero`, so columns line up and 0 is distinct from O.

## 4. Spacing, radius and edges

- Spacing is in steps of 4px. Card padding is 20px (16px when narrow); the gap between cards is 12px (8px when narrow).
- Radius has three levels instead of one value everywhere: cards 20px (`rounded-2xl`), wells inside a card 12px (`rounded-lg`), controls 10px (`rounded-md`); bars and segmented switches are fully round. `--radius` is 0.75rem.
- Light: the page and the cards are both white, and a card is set apart by the soft shadow in `--card-frame`, with no outline. Cards with a coloured ground (mint, attention) carry no shadow. Dark: a card has a 1px `border` outline.
- A key-number card is 104px tall; a table row is 48px (44px when narrow).
- Layout switches on the **width of the content area** (container queries), not the viewport. The sidebar open and collapsed differ by 200px, so viewport breakpoints lay the page out wrongly at 768px. Breakpoints: `@md` 448px, `@2xl` 672px, `@5xl` 1024px.

## 5. Chart rules

Everything uses the existing LayerChart (`$lib/components/ui/chart`), and colour comes only from `chart-*` and `destructive`.

1. **At most three colours in a chart.** Ordinary series take `chart-3` (ink), `chart-4` (grey) and `chart-5` (light grey), in that order. `chart-2` and `chart-1` are kept for healthy and warning, or to mark the "now" value.
2. **Trends are area charts.** A 1.25px line, filled below in the same colour from 14 % down to 0. Only three horizontal grid lines, in `border`; no vertical grid lines and no axis lines. Three or four ticks on the x axis; the y axis labels only the maximum and 0; tick text is 11px `muted-foreground`.
3. **Proportions are bars.** A 6px track in `muted`, fully round; the mini bar in a table is 3px.
4. **Commit bars (usage / request / limit against allocatable).** The three bars of one resource share a scale whose top is `max(100 %, the largest of the three)`. A 1px tick marks 100 % on the track, and the ticks of the three bars line up. The part beyond the tick is hatched in the same colour. The value sits on the right, aligned in tabular figures. **A limit above 100 % is normal in Kubernetes**, so the limit row only hatches: no warning colour and no warning text. Only when usage or request crosses its threshold does one line of text under the three bars name the worst row.
5. **Segmented bar (Pods: Running / Pending / Failed / free).** One 8px bar in segments with 2px gaps, and under it a legend of "dot, name, right-aligned number".
6. **A quota without a limit draws no bar.** It shows the usage number, and where the bar would be, one line of text: "No quota set". A bar and a percentage appear only once a quota is set.
7. **A bar only ever draws "usage against capacity".** Things with a ceiling, where the question is "is it nearly full", get a bar: quota CPU / RAM / GPU memory (when a quota is set), the cluster's CPU / Memory / GPU commit bars, pods against allocatable, the node pressure table and the Analytics rankings. Counts and ready ratios are numbers only: Deployment / StatefulSet / DaemonSet, Model / Release, PVC counts, pod phases, container signals. A short ready count is an amber number with a warning icon, not a bar, because an amber bar at "2 / 6" reads as "33 % used". Storage's Used counts only mounted volumes, which is not the same basis as Provisioned, so it is a number too.
8. **No ring charts and no gauges.** Every existing `ArcChart` is replaced by one of the forms above.
9. **Tooltips** use the `popover` ground, `position: fixed`, 8px from the viewport edge (`ui/tooltip/tooltip-content.svelte`). An `absolute` tooltip at the edge counts towards the page's scroll area and brings up a scrollbar. Text is 12px, values are right-aligned, and series follow the legend's order.

## 6. States

| State                  | Treatment                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading (page stage)   | A page skeleton: the title, the tab row, and grey blocks at the position and size of the real grid                                                  |
| Loading (widget stage) | Each card keeps its title, with a skeleton of the same size where the number and chart go. Card height is fixed, so nothing jumps when data arrives |
| No data                | The same in every card: `—` (`muted-foreground`) where the number goes and one line under it, "No data". No 0, no N/A, no blank                     |
| Zero                   | A plain `0` in `muted-foreground`, without a warning colour                                                                                         |
| Warning                | A small amber icon with text; a failure is a small red icon with text. No large coloured ground                                                     |

## 7. Sidebar

Structure and behaviour are unchanged; only the tokens change.

- The ground is near-white, one step off the page, with a hairline between the two in light mode. Selected and hover are a neutral grey one step darker (`sidebar-accent`), not mint: green is kept for a healthy state.
- The Platform / Kubernetes tabs have no track. The unselected tab sits on the sidebar itself; the selected one is a white chip with a soft shadow.
- The workspace icon's ground is ink.
- Several child components use general tokens (for example `text-muted-foreground`); check each against the sidebar ground when the sidebar colours change.

## 8. Wireframes

Layout codes: **K** is "a row of key numbers", **T** is "the main table", **B** is "a grid of cards of mixed sizes", **3** is "three columns". Widths are the viewport; the figure in brackets is the approximate content width with the sidebar open.

### 8.1 dashboard/cluster, Overview tab

Top to bottom follows the order of an administrator's questions: is anything wrong, how much is installed, how much of each of the three resources is committed, and only then the supporting figures. At 1440 wide the page does not scroll.

**1440 (content about 1120)**: 12 columns

```
K ┌─health─────┬─pods────────────────────────────────────────────┐
  │ State      │ Pods                                            │
  │ ● Healthy  │ 81 Running / 220   ▮▮▮▮▮▮▯▮░░░░░░░░░░░░░░░░░░   │
  │ All ready  │                    ● Running 81 ● Pending 4 …   │
  └──── 3 ─────┴──────────────────────── 9 ──────────────────────┘
B ┌─cpu───────────────┬─memory────────────┬─gpu────────────────┐
  │ 24 core allocat.  │ 30.86 GB allocat. │ 19.99 GB total     │
  │ Usage   ▮┆     2% │ Usage   ▮┆    41% │ Usage  ▮▮▮▯┆   49% │
  │ Request ▮▮▮┆  90% │ Request ▮┆▨▨ 419% │ Util.  ▯▯▯▯┆    0% │
  │ Limit   ▮▮▮┆▨108% │ Limit   ▮┆▨▨ 652% │                    │
  │ ⚠ Limit: overcom. │ ⚠ Limit: overcom. │                    │
  └──────── 4 ────────┴──────── 4 ────────┴──────── 4 ─────────┘
K ┌─nodes─┬─deploy─┬─uptime─┬─information─┬─consumption─┬─ai100─┐   small cards, 2 columns each
  └───────┴────────┴────────┴─────────────┴─────────────┴───────┘
T ┌─node-pressure (table)─────────────────────────────────────────┐
  └──────────────────────────── 12 ──────────────────────────────┘
```

- The ground of `health` follows the state (see section 1).
- CPU, Memory and GPU share one shape: the number on top, three commit bars under it, and a fixed last line of text that names the worst row. The three are equally wide because they are the same kind of thing.
- The six supporting figures (node count, Deployments, uptime, version, GPU power, aiDAPTIVCache) sit in one row of small cards and do not compete with the main cards. The version string is monospace, truncated, with a tooltip.
- Every cell of the pressure table is "a number and a 3px bar", and the bar darkens as the value rises. The first column has two lines: the node name and the GPU model.

**Content 672 to 1023px**: `health` 4 columns and `pods` 8; CPU and Memory half each and GPU a full row; small cards three to a row.

**768 (sidebar open, content about 470) and 390**: each main card takes a full row and small cards go two to a row. When the pressure table's card is narrower than 624px, each node becomes a card:

```
┌ rhel-hci-cody01 ──────────── › ┐
│ 1 × NVIDIA RTX 4000 Ada, 20 Gi │
│ CPU     Usage 2%  Req 57%  Lim 58%  │
│ Memory  Usage 42% Req 95%  Lim 186% │
│ GPU     Alloc —   Usage 49% Util 0% │
│ ⚠ Overcommitted                │
└────────────────────────────────┘
```

### 8.2 dashboard/cluster, Analytics tab

The three columns first planned (a list on the left, trends in the middle, values on the right) left the side columns much shorter than the middle one, with a large blank area on each side. The tab is therefore full-width bands from top to bottom: pick a row in a ranking, and its detail is right below.

**1440 (content about 1120)**

```
[Overview | Analytics]        [Node | Namespace] [node picker] [time range] [Auto update]

Node Ranking
┌─CPU pressure─┬─Memory pressure─┬─GPU utilization─┬─Restarts──┐   four rankings; click a row to pick the node
└───── 3 ──────┴─────── 3 ───────┴─────── 3 ───────┴──── 3 ────┘
Node Detail  rhel-hci-cody01
┌─CPU────────┬─RAM────────┬─Pods───────┬─File system─┐   current values: a number and a small bar
└────────────┴────────────┴────────────┴─────────────┘
┌─CPU commitment (area chart)┬─Memory commitment──────┐
└──────────── 6 ─────────────┴─────────── 6 ──────────┘
┌─CPU breakdown──┬─Network I/O────┬─Disk read/write─┐   small multiples on one time axis
└────── 4 ───────┴────── 4 ───────┴─────── 4 ───────┘
┌─GPU utilization (one row per card)┬─GPU memory─────┐
└──────────────── 6 ────────────────┴─────── 6 ──────┘
┌─Pod Detail (table)────────────────────────────────┐
└───────────────────────────────────────────────────┘
```

- Each ranking row has two lines: the name on one, the bar and value on the other. Names are long and a value may be three numbers, and on one line they cover each other.
- Charts removed: Disk I/O time, GPU power, GPU temperature. Power and temperature are "current" values that the expanded node pressure row already shows; what stays is what changes over time and needs a trend.
- The GPU heatmap's height follows the number of cards (28px each), so one card is a thin band, not a large block of colour.
- The Namespace view has the same structure: four rankings, four current values, CPU and Memory commitment side by side, PVCs, and the pod table.

**Content under 1024px**: rankings and current values go two to a row, charts take a row each or two to a row; under 448px everything is one column.

### 8.3 dashboard/overview (workspace)

The structure from before the redesign stays: three equal cards on top and one large Pod & rollout card below. The information is the same; what changes is how it is drawn.

**1440 (content about 1120)**

```
B ┌─resource-quota─────┬─workload-health────┬─storage────────────┐
  │ ▒ CPU      13 Cores│ ▒ Model     ⚠ 1 / 3│ ▒ Provisioned  Used │
  │ ▒ RAM      110 GB  │                    │ ▒ 192 GB       0 KB │
  │ ▒ GPU mem  0 KB    │ ▒ Release      None│ ▒ PVCs 1  Bound 1   │
  │   No quota set     │                    │   Pending 0         │
  └──────── 4 ─────────┴──────── 4 ─────────┴──────── 4 ─────────┘
T ┌─pod-rollout-health─────────────────────────────────────────────┐
  │ ▒ Pods needing attention ▒ Running ▒ Not Ready ▒ Error ▒ Succ. │
  │   ● All clear             2         0           0       2      │
  │ ▒ Pods            ▒ Container signals   ▒ Rollouts & storage   │
  │   Running      2    CrashLoopBackOff 0    Deployment ⚠ 2 / 6   │
  │   Unknown      0    ImagePullBackOff 0    StatefulSet   None   │
  │   …                 …                     …                    │
  └───────────────────────────── 12 ──────────────────────────────┘
```

- ▒ is a row or a cell inside a card. Rows are separated only by thin dividers and have no ground of their own (white cards, as on the cluster page). The three cards use one layout, so side by side they read as a set; content fills the card's height and leaves no blank. Storage's PVC counts are plain numbers without bars. Workload health and Storage are both split into an upper and a lower half at the middle of the content area, each half centred vertically, so the two cards' dividers sit at the same height.
- "Pods needing attention" is the first block of the large card, and its ground follows the state (see section 1).
- Each of the three detail groups has an icon heading. The three icons are grey by default and take the colour of the group's worst row only when something is wrong: amber for Pods with Not Ready; red for Container signals with a signal; red for Rollouts & storage with a failed Job, amber with a rollout short of ready or a pending PVC. No green: grey already means nothing is wrong.
- Workload health has only Model and Release (Application and VM are gone from the product) and is laid out like the Quota card beside it, one kind per row: the name on the left, the ready count on the right (a large number and "/ total Ready"). No bar. With something short of ready the number turns amber and gains a warning icon; with nothing deployed it shows a grey "None". There is no total row.
- A quota without a limit draws no bar (chart rule 6); the bar and percentage appear once it is set.
- The right of the tab row has only Auto Update and no time range: every card is a "now" reading, so a time range would change no number. The cluster page also shows the time range only on its Analytics tab.
- Under the page title there is only the namespace name. A card's description is folded into the tooltip beside its title by default, and is shown only when it is needed to read the values (for example the ranking card's "Usage / request / limit").

**Content 672 to 1023px**: Quota takes a full row, Workload and Storage half each. **768 (content about 470) and 390**: every card takes a full row; the value blocks in the large card go two to a row and the three detail groups stack.

## 9. How this design answers the data on a real cluster

| Data condition                  | Treatment                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A quota without a limit         | Only the usage and "No quota set"; no bar and no infinity gauge                                                  |
| Many counts are 0               | A 0 is grey; the state card shows the normal state at 0                                                          |
| Limits overcommitted to 652 %   | The commit bar: a shared scale, a tick at 100 %, a hatched tail, and the word "overcommitted"                    |
| One node and one GPU            | A ranking or table with one row leaves no large blank: card height follows the content instead of a fixed height |
| aiDAPTIVCache has no data       | A small cell with the shared "No data" treatment                                                                 |
| A long version string           | Monospace, truncated, with a tooltip; `information` takes the wider cell when narrow                             |
| Ten numeric columns of pressure | At 672px and above a table (first column fixed, horizontal scroll); below that one card per node                 |
| Three loading stages, no jump   | Card height is fixed and a skeleton matches its content's size; the page-stage skeleton uses the same grid       |
| Prometheus returns nothing      | The same empty state in every widget                                                                             |
