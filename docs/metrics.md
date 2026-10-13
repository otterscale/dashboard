# Metrics in the dashboard

The OtterScale server answers PromQL at two scopes:

| Scope     | Path                                                 | Who                                                          | What                                                                        |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Cluster   | `/proxy/<cluster>/prometheus`                        | cluster-admin, or bound to `otterscale:metrics-cluster-view` | any query                                                                   |
| Namespace | `/proxy/<cluster>/prometheus-tenancy?namespace=<ns>` | anyone who may `get pods` in `<ns>`                          | any query, rewritten to `namespace="<ns>"` the way prom-label-proxy does it |

Everyone else gets 403 at cluster scope, whatever the query. Create drivers with `clusterPrometheusDriver`, `namespacePrometheusDriver` or `workspacePrometheusDriver` (`src/lib/prometheus.ts`), never `new PrometheusDriver` with a hand-written endpoint. `page.data.canViewClusterMetrics` says which scope the viewer has.

## Rules for namespace-scoped pages

- Use only metrics whose `namespace` label is the tenant's namespace: kube-state-metrics, cAdvisor and kubelet volume metrics, vLLM, KubeVirt VMI metrics (`namespace`, not `exported_namespace`).
- Node, GPU (DCGM, HAMi), Ceph and KubeVirt component metrics are infrastructure: their `namespace` is the exporter's. A regular user can never see them, so hide the component when `canViewClusterMetrics` is false — do not show an empty chart or a 403.
- Do not select on `namespace` yourself with `=~`, `!=` or `!~` against other namespaces: the server refuses a selector that cannot match the enforced namespace with 400.
- Build an optional namespace filter with `namespaceSelector(ns)` (`src/lib/prometheus.ts`): it escapes the value and leaves the matcher out for an admin's empty "all namespaces" choice, where `namespace=""` would match only series without the label.
- Testing with an admin account proves nothing here: an admin keeps cluster scope. Run `e2e/tenant-metrics.test.ts` as a regular Workspace member (see the comment at its top).
