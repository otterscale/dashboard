# Metrics in the dashboard

The OtterScale server answers metrics at three scopes; the shared one takes no PromQL:

| Scope     | Path                                                 | Who                                                          | What                                                                             |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Cluster   | `/proxy/<cluster>/prometheus`                        | cluster-admin, or bound to `otterscale:metrics-cluster-view` | any query                                                                        |
| Namespace | `/proxy/<cluster>/prometheus-tenancy?namespace=<ns>` | anyone who may `get pods` in `<ns>`                          | any query, rewritten to `namespace="<ns>"` the way prom-label-proxy does it      |
| Shared    | `/proxy/<cluster>/prometheus-shared/<name>`          | the namespace scope's callers, and cluster scope             | one of the server's named queries: per GPU card, per host, or a total; no PromQL |

Everyone else gets 403 at cluster scope, whatever the query. Create drivers with `clusterPrometheusDriver`, `namespacePrometheusDriver` or `workspacePrometheusDriver` (`src/lib/prometheus.ts`), never `new PrometheusDriver` with a hand-written endpoint. `page.data.canViewClusterMetrics` says which scope the viewer has. Use `sharedMetrics(cluster, namespace)` for the shared scope; `namespace` is always the Workspace's.

## Rules for namespace-scoped pages

- Use only metrics whose `namespace` label is the tenant's namespace: kube-state-metrics, cAdvisor and kubelet volume metrics, vLLM, KubeVirt VMI metrics (`namespace`, not `exported_namespace`).
- Node, GPU (DCGM, HAMi), Ceph and KubeVirt component metrics are infrastructure: their `namespace` is the exporter's, and their series can name other tenants' pods. On a Workspace page, take these numbers from a shared query (`SharedQueryName` lists them) for every viewer, admins included, so both see the same numbers. If no query fits, the new one goes into the server's catalog (`internal/handler/proxy_shared_catalog.go`), behind its safety test and a security review — never PromQL sent from here. Otherwise hide the component when `canViewClusterMetrics` is false: no empty chart, no 403.
- Do not select on `namespace` yourself with `=~`, `!=` or `!~` against other namespaces: the server refuses a selector that cannot match the enforced namespace with 400.
- Build an optional namespace filter with `namespaceSelector(ns)` (`src/lib/prometheus.ts`): it escapes the value and leaves the matcher out for an admin's empty "all namespaces" choice, where `namespace=""` would match only series without the label.
- Testing with an admin account proves nothing here: an admin keeps cluster scope. Run `e2e/tenant-metrics.test.ts` as a regular Workspace member (see the comment at its top).
