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

## Local environment for checking the UI

A fresh worktree cannot run or log in on its own. Set these up before the first visual check.

### Files to copy from the main checkout

None of these are committed, so a new worktree does not have them. Copy them from `../dashboard/`:

- `.env`
- `otterscale-ca.crt`: without it, server-side API calls fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
- `project.inlang/cache/`: without it Paraglide tries to fetch its plugins from jsdelivr, and when that fails every message compiles to an empty string. The dev server still starts, so check that `src/lib/paraglide/messages/en.js` is around 200 KB, not 21 bytes.

### Starting the dev server

```bash
NODE_EXTRA_CA_CERTS=$PWD/otterscale-ca.crt pnpm dev --host --port 5174 --strictPort
```

The port must match `PUBLIC_WEB_URL` in `.env` (`http://192.168.41.240:5174`), because Keycloak redirects back to that address after login. Only one branch can run at a time for this reason. If the port is taken, another branch's server is running: stop and ask the owner. Do not kill a process you did not start, and do not change the port.

### Login: `.env.e2e`

The owner creates `.env.e2e` in the worktree root. It is covered by the `.env.*` rule in `.gitignore`. Read credentials only from this file. Never print them, and never ask for them in chat.

```
E2E_TENANT_USERNAME=
E2E_TENANT_PASSWORD=
E2E_CLUSTER=phison-hci
E2E_WORKSPACE=testbed
```

- The variable names are the ones `e2e/tenant-metrics.test.ts` already uses.
- The account must be able to see cluster metrics, or dashboard/cluster will not load.
- If `.env.e2e` is missing, stop and ask the owner to create it. Do not look for credentials elsewhere.

The Keycloak form has two steps: fill `#username`, click `#kc-login`, then fill `#password` and click `#kc-login` again. Save the session with Playwright's `storageState` and reuse it for every capture instead of logging in each time. Keep the `storageState` file outside the repo.

### Browser

Google Chrome is not installed on this machine, so the `chrome-devtools` MCP server cannot launch. Use the Chromium that ships with the repo's `playwright` dev dependency, driven by a script kept outside the repo (the session scratchpad). Do not add the script or any new dependency to the branch. Say in the report that Playwright was used in place of `chrome-devtools`.

### Capturing each state

- Pages: `http://192.168.41.240:5174/<E2E_CLUSTER>/<E2E_WORKSPACE>/dashboard/overview` and `.../dashboard/cluster`.
- Theme: set `localStorage['mode-watcher-mode']` to `light` or `dark` before the page loads.
- Full page: the app scrolls inside the inner `<main>`, not the document. Grow the viewport to that element's `scrollHeight` before taking the screenshot; a plain full-page capture stops at 900 px.
- Empty: answer every request matching `/proxy/<cluster>/prometheus/api/v1/query` with `{"status":"success","data":{"resultType":"vector","result":[]}}`.
- Widget-stage loading: leave those same requests unanswered.
- Page-stage loading: hold all `script` requests, so the server-rendered page stays on screen.
- Collapsed sidebar: press `Ctrl+B`.
- Mobile sidebar (390 wide): click `[data-sidebar="trigger"]`.

To check that nothing jumps between loading stages, compare the page height in the page-stage, widget-stage and loaded captures at the same width. They should be equal.

## Screenshots

Save as PNG directly in `D:\frontend-design\<letter>\`, with no subfolder, where `<letter>` is the last letter of the branch name (`frontend-design-b` saves to `D:\frontend-design\b\`). From WSL the same folder is `/mnt/d/frontend-design/<letter>/`. Create the folder if it is missing. Do not keep a copy inside the repo and do not commit screenshots. Do not touch another branch's folder. The shared "before" baseline is already in `D:\frontend-design\before\`; do not capture or store it again.

Use exactly these file names, so branches can be compared file by file. Viewport height 900; capture the full page.

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