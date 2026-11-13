# UI refactor experiment: rules for every branch

Five branches restyle the same three areas with different design tooling. The owner compares the results side by side, so every branch must follow the same rules.

## Scope

- Sidebar, dashboard/overview, dashboard/cluster. Nothing else.
- Appearance and interaction detail only. Do not change data loading, API calls, PromQL, routing or permissions.
- Do not read, reference or merge any other `frontend-design-*` branch.

## Tooling

- Fixed for every branch: the three MCP servers in `.mcp.json`.
- Design skills: only the ones named in the task you were given, installed at project level (`.claude/skills/`). Do not install anything globally and do not load other design skills.

## Data conditions on the test cluster

These are facts about the real data, found while checking the first branch. Every branch must handle them; how is a design decision for the branch.

- The workspace has no hard ResourceQuota, so quota values are unlimited (shown today as an empty gauge with an infinity sign).
- Many counters are legitimately zero (CrashLoopBackOff, ImagePullBackOff, pending PVCs, failed job pods). A zero is not an alert.
- CPU and memory limits are overcommitted well past 100 % (for example memory limit 652 %).
- There is one node, and one GPU. The aiDAPTIV cache widget has no data.
- The version string is long (`v1.35.8+rke2r1`) and must not break a tile at narrow widths.
- The node resource pressure table has ten numeric columns and must stay usable at 768 px and below.
- Loading happens in three stages on a real cluster: the sidebar menu, then the page before its Prometheus driver is ready, then each widget. A placeholder should have the same footprint as what replaces it, so nothing jumps between stages. Check this with network throttling, not only with a mocked instant response.
- When Prometheus returns nothing, every widget on the page should show the same kind of empty state. Today some show a message, some show `N/A` and some show zeros.

## Screenshots

Save to `screenshots/` (do not commit) with exactly these names, so branches can be compared file by file. Viewport height 900; capture the full page.

| Page | 1440 wide | 768 wide | 390 wide |
| --- | --- | --- | --- |
| dashboard/cluster | `cluster-light`, `cluster-dark`, `cluster-loading-light`, `cluster-loading-dark` (widget stage), `cluster-loading-page-dark` (page stage), `cluster-empty-light`, `cluster-empty-dark` | `cluster-768-light` | `cluster-narrow-light`, `cluster-narrow-dark` |
| dashboard/overview | `overview-light`, `overview-dark`, `overview-loading-light`, `overview-loading-dark`, `overview-empty-light`, `overview-empty-dark` | `overview-768-light` | `overview-narrow-light`, `overview-narrow-dark` |
| sidebar | `sidebar-collapsed-light`, `sidebar-collapsed-dark` (crop to the rail and the top of the page) | | |

## Done means

- `pnpm check`, `pnpm lint` and `pnpm exec vitest --run src/lib/components/dashboard` all pass.
- `svelte-autofixer` has been run on every changed component.
- The screenshots listed above exist, taken with real data.
- Each item under "Data conditions" has been checked on screen.
- The work is committed on the branch locally. Do not push, open a pull request or change any remote: the owner reviews first and pushes himself.

## Report

Finish by printing exactly this, filled in:

```
分支：
commit：
改動檔案數：
新增的相依套件：
pnpm check：
pnpm lint：
單元測試：
svelte-autofixer：（跑了幾個檔案、剩餘問題數）
截圖路徑：
我回頭要求修正的次數：
花費時間（大約）：
沒能驗證的部分：
已知問題：
```