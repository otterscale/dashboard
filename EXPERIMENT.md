# UI refactor experiment: rules for every branch

Five branches restyle the same three areas with different design tooling. The owner compares the results side by side, so every branch must follow the same rules.

## Scope

- Sidebar, dashboard/overview, dashboard/cluster. Nothing else.
- Appearance and interaction detail only. Do not change data loading, API calls, PromQL, routing or permissions.
- Do not read, reference or merge any other `frontend-design-*` branch.

## Tooling

- Fixed for every branch: the three MCP servers in `.mcp.json`.
- Design skills: only the ones named in the task you were given, installed at project level (`.claude/skills/`). Do not install anything globally and do not load other design skills.

## Done means

- `pnpm check`, `pnpm lint` and `pnpm exec vitest --run src/lib/components/dashboard` all pass.
- `svelte-autofixer` has been run on every changed component.
- Screenshots with real data: light, dark, loading, empty, narrow width.
- The branch is pushed.

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