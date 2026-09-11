<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { TopBarList } from '$lib/components/custom/top-bar-list';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		classifyThreshold,
		fetchCombinedInstant,
		LIVE_PODS,
		type ThresholdLevel,
		withoutLimit
	} from '$lib/prometheus';

	// Reusable "top namespaces" ranking. `kind="cpu"` and `kind="memory"` rank by declared
	// limit and print usage / request / limit together; `kind="gpu"` ranks by nvidia.com/gpu
	// limits of ready pods; `kind="restart"` ranks by pod container restarts over the
	// last hour (a health signal rather than a consumption one).
	let {
		prometheusDriver,
		kind,
		title,
		description,
		tooltip,
		onNamespaceClick,
		namespaceToWorkspace = {},
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		kind: 'cpu' | 'memory' | 'gpu' | 'restart';
		title: string;
		description: string;
		tooltip: string;
		onNamespaceClick?: (namespace: string) => void;
		// namespace → workspace name; bars display the workspace, falling back to the namespace.
		namespaceToWorkspace?: Record<string, string>;
		isReloading?: boolean;
	} = $props();

	/** CPU and memory answer "who booked the capacity"; the other two are single-number rankings. */
	const isCommitment = $derived(kind === 'cpu' || kind === 'memory');

	const query = $derived.by(() => {
		switch (kind) {
			// nvidia.com/gpu limits (KSM flattens dots to underscores) of ready pods only, so
			// completed/pending pods don't inflate the count. `> 0` hides GPU-free namespaces.
			case 'gpu':
				return `sum(kube_pod_container_resource_limits{resource="nvidia_com_gpu"} and on (namespace, pod, container) kube_pod_container_status_ready == 1) by (namespace) > 0`;
			// `> 0` keeps the chart to namespaces that actually restarted — in a healthy cluster
			// this list is empty, which is the intended "nothing to see here" state.
			case 'restart':
				return `sum(increase(kube_pod_container_status_restarts_total[1h])) by (namespace) > 0`;
			default:
				return '';
		}
	});

	// Deliberately unfiltered. The memory card used to drop namespaces under 1 GiB of usage, which
	// is exactly backwards once limits are on show: node-feature-discovery holds 0.15 GiB against a
	// 5.62 GiB limit, and a usage floor is precisely what hides a 40× over-declaration.
	const commitmentQueries = $derived.by(() => {
		const resource = kind === 'cpu' ? 'cpu' : 'memory';
		const unit = kind === 'cpu' ? 'core' : 'byte';
		const usage =
			kind === 'cpu'
				? 'irate(container_cpu_usage_seconds_total{container!="",container!="POD"}[2m])'
				: 'container_memory_working_set_bytes{container!="",container!="POD"}';
		const spec = (which: 'requests' | 'limits') =>
			`sum by (namespace)(kube_pod_container_resource_${which}{resource="${resource}",unit="${unit}"} ${LIVE_PODS})`;
		return {
			usage: `sum by (namespace)(${usage})`,
			request: spec('requests'),
			limit: spec('limits'),
			// A namespace's limit is a sum over the containers that declared one, so it says nothing
			// about the ones that did not. kube-system sums to 0.20 cores against a 1.07-core request
			// purely because 15 of its 17 containers are uncapped — without the count that number
			// reads as a tight ceiling instead of an almost absent one.
			uncapped: `count by (namespace)(kube_pod_container_info ${LIVE_PODS} ${withoutLimit(resource)})`,
			containers: `count by (namespace)(kube_pod_container_info ${LIVE_PODS})`
		};
	});

	type Commitment = { usage: number; request: number; limit: number };

	function displayValue(value: number): string {
		if (kind === 'gpu') return `${Math.round(value)} GPU`;
		return `${Math.round(value)}`;
	}

	/**
	 * All three numbers in one unit, chosen once for the whole card from the largest value on it —
	 * per-row units would size each bar's text against a different scale, which is the one thing a
	 * ranking must not do.
	 */
	function commitmentFormatter(rows: Commitment[]): (c: Commitment) => string {
		if (kind === 'cpu') {
			// Cores need no unit suffix: the card title already says CPU, and three numbers plus a
			// word does not fit the quarter-width card these sit in.
			const render = (v: number) => (v > 0 ? v.toFixed(2) : '—');
			return (c) => `${render(c.usage)} / ${render(c.request)} / ${render(c.limit)}`;
		}
		const peak = Math.max(1, ...rows.flatMap((c) => [c.usage, c.request, c.limit]));
		const { unit } = formatCapacity(peak);
		const divisor = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit] ?? 1024 ** 3;
		const render = (v: number) => (v > 0 ? (v / divisor).toFixed(2) : '—');
		return (c) => `${render(c.usage)} / ${render(c.request)} / ${render(c.limit)} ${unit}`;
	}

	// Only the restart ranking carries a health threshold: the list only ever shows namespaces
	// with ≥1 restart, so 1–10/h is orange and >10/h (sustained crash-looping) turns red.
	function classes(value: number): { barClass?: string; textClass?: string } {
		if (kind !== 'restart') return {};
		const level: ThresholdLevel = classifyThreshold(value, { green: 0, orange: 10 });
		return {
			barClass:
				level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-chart-1' : 'bg-chart-2',
			textClass: level === 'red' ? 'text-destructive' : ''
		};
	}

	// Raw rows keep the namespace; the displayed label is resolved at render so bars relabel
	// reactively if the workspace map arrives after the first fetch.
	type RawBar = {
		namespace: string;
		value: number;
		displayValue: string;
		warning?: string;
		barClass?: string;
		textClass?: string;
	};
	let rawBars = $state<RawBar[]>([]);
	let isLoaded = $state(false);

	// label = workspace name (fallback: namespace); id = namespace (click payload for drill-in).
	// Bars resolved to a workspace get a "Workspace" badge, like the standalone-model tag.
	const bars = $derived(
		rawBars.map((b) => {
			const workspace = namespaceToWorkspace[b.namespace];
			return {
				label: workspace || b.namespace,
				id: b.namespace,
				badge: workspace ? m.workspace() : undefined,
				value: b.value,
				displayValue: b.displayValue,
				warning: b.warning,
				barClass: b.barClass,
				textClass: b.textClass
			};
		})
	);

	async function fetchCommitment() {
		const result = await fetchCombinedInstant(prometheusDriver, commitmentQueries);
		const byNamespace: Record<string, Commitment & { uncapped: number; containers: number }> = {};
		for (const [key, vectors] of Object.entries(result)) {
			for (const v of vectors) {
				const namespace = (v.metric.labels as Record<string, string>).namespace;
				const value = Number(v.value?.value);
				if (!namespace || !Number.isFinite(value)) continue;
				const row = (byNamespace[namespace] ??= {
					usage: 0,
					request: 0,
					limit: 0,
					uncapped: 0,
					containers: 0
				});
				row[key as keyof typeof row] = value;
			}
		}
		const rows = Object.entries(byNamespace);
		const format = commitmentFormatter(rows.map(([, c]) => c));
		rawBars = rows
			.map(([namespace, c]) => ({
				namespace,
				// Ranked by limit: it is the number the question is about, and usage sitting beside it
				// is what says whether the booking is real. A namespace that declared nothing sinks to
				// the bottom on a zero-length bar, which is the honest place for "no ceiling at all".
				value: c.limit,
				displayValue: format(c),
				// Only flagged where the sum is incomplete but non-empty. A namespace with no limits at
				// all already prints "—", and marking those too would put a warning on most of the list.
				warning:
					c.limit > 0 && c.uncapped > 0
						? m.containers_without_limit({ uncapped: c.uncapped, containers: c.containers })
						: undefined
			}))
			.sort((a, b) => b.value - a.value);
	}

	async function fetch() {
		try {
			if (isCommitment) {
				await fetchCommitment();
				return;
			}
			const response = await prometheusDriver.instantQuery(query);
			const series = (response.result ?? []) as {
				metric: { labels: Record<string, string> };
				value?: { value: unknown };
			}[];
			rawBars = series
				.map((s) => {
					const namespace = s.metric?.labels?.namespace ?? '';
					const value = Number(s.value?.value);
					return namespace && Number.isFinite(value)
						? { namespace, value, displayValue: displayValue(value), ...classes(value) }
						: null;
				})
				.filter((b): b is RawBar => b !== null)
				.sort((a, b) => b.value - a.value);
		} catch (error) {
			console.error('Failed to fetch namespace ranking:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<TopBarList
	{title}
	{description}
	{tooltip}
	{bars}
	{isLoaded}
	onBarClick={onNamespaceClick}
	scrollable
/>
