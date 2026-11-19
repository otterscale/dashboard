<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { Code, ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import {
		type ListRequest,
		type ListResponse,
		type Resource,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext } from 'svelte';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { Status } from '$lib/components/shadcnio/status';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/shadcnio/table';
	import { m } from '$lib/messages';

	type WorkloadListSpec = {
		group: string;
		version: string;
		resource: string;
	};

	/** Same GVR as console nav / model.svelte (ResourceService.list). */
	const WORKLOAD_SPECS: WorkloadListSpec[] = [
		{ group: 'serving.kserve.io', version: 'v1alpha2', resource: 'llminferenceservices' },
		{ group: 'kro.run', version: 'v1alpha1', resource: 'applications' },
		{ group: 'helm.toolkit.fluxcd.io', version: 'v2', resource: 'helmreleases' }
	];

	let {
		prometheusDriver,
		cluster,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string;
		isReloading: boolean;
	} = $props();

	// Every overview tile is handed the driver; this one uses the Resource API only.
	$effect(() => void prometheusDriver);

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const workloadLabels = $derived([m.model(), m.application(), m.release()]);

	type Row = { label: string; ready: number; total: number };

	function hasReadyConditionTrue(obj: JsonObject | undefined): boolean {
		if (!obj || typeof obj !== 'object') return false;
		const status = (obj as Record<string, unknown>)['status'];
		if (!status || typeof status !== 'object') return false;
		const conditions = (status as Record<string, unknown>)['conditions'];
		if (!Array.isArray(conditions)) return false;
		for (const c of conditions) {
			if (!c || typeof c !== 'object') continue;
			const row = c as { type?: unknown; status?: unknown };
			if (row.type === 'Ready' && row.status === 'True') return true;
		}
		return false;
	}

	function totalsFromItems(items: Resource[]): { ready: number; total: number } {
		let ready = 0;
		for (const item of items) {
			if (hasReadyConditionTrue(item.object)) ready++;
		}
		return { ready, total: items.length };
	}

	async function listAllInNamespace(spec: WorkloadListSpec, ns: string): Promise<Resource[]> {
		const out: Resource[] = [];
		let continueToken: string | undefined = undefined;
		for (;;) {
			const response: ListResponse = await resourceClient.list({
				cluster,
				namespace: ns,
				group: spec.group,
				version: spec.version,
				resource: spec.resource,
				limit: BigInt(500),
				continue: continueToken
			} as ListRequest);
			out.push(...response.items);
			continueToken = response.continue || undefined;
			if (!continueToken) break;
		}
		return out;
	}

	/**
	 * A failed list call throws: the card then shows the error state, not `0 / 0`.
	 * The one exception is `not_found`, which is how the API answers for a kind whose
	 * CRD is not installed on the cluster: that is "none of this kind", an answer.
	 */
	async function fetchWorkload(spec: WorkloadListSpec, label: string, ns: string): Promise<Row> {
		try {
			const items = await listAllInNamespace(spec, ns);
			const { ready, total } = totalsFromItems(items);
			return { label, ready, total };
		} catch (error) {
			if (ConnectError.from(error).code === Code.NotFound) return { label, ready: 0, total: 0 };
			throw error;
		}
	}

	const workloads = useLoadable<Row[]>(
		async () => {
			if (!namespace || !cluster) return null;
			const labels = workloadLabels;
			return Promise.all(WORKLOAD_SPECS.map((w, i) => fetchWorkload(w, labels[i]!, namespace)));
		},
		() => isReloading
	);

	// Another cluster or namespace: ask again without waiting for the next tick.
	let asked = false;
	$effect(() => {
		void cluster;
		void namespace;
		if (asked) void workloads.refresh();
		asked = true;
	});

	const cell = 'h-11 bg-muted/40 px-3 first:rounded-l-lg last:rounded-r-lg';
	const head = 'h-7 px-3 text-xs font-normal text-muted-foreground';
</script>

{#snippet frame(body: 'rows' | 'skeleton')}
	<Table isHoverable={false} class="border-separate border-spacing-x-0 border-spacing-y-2">
		<TableHeader>
			<TableRow class="border-0">
				<TableHead class={head}>{m.dash_kind()}</TableHead>
				<TableHead class="{head} text-end">{m.dash_ready()}</TableHead>
				<TableHead class="{head} w-28">{m.dash_status()}</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			{#if body === 'skeleton'}
				{#each WORKLOAD_SPECS as spec (spec.resource)}
					<TableRow class="border-0">
						<TableCell class={cell}><Skeleton class="h-3.5 w-24" /></TableCell>
						<TableCell class={cell}><Skeleton class="ms-auto h-3.5 w-10" /></TableCell>
						<TableCell class={cell}><Skeleton class="h-3.5 w-16" /></TableCell>
					</TableRow>
				{/each}
			{:else}
				{#each workloads.data ?? [] as row (row.label)}
					<TableRow class="border-0">
						<TableCell class="{cell} font-medium">{row.label}</TableCell>
						<TableCell class="{cell} text-end font-mono text-xs tabular-nums">
							{m.workspace_workload_ready_ratio({
								ready: String(row.ready),
								total: String(row.total)
							})}
						</TableCell>
						<TableCell class={cell}>
							{#if row.total === 0}
								<span class="text-muted-foreground">{m.dash_none()}</span>
							{:else if row.ready >= row.total}
								<span class="inline-flex items-center gap-2">
									<Status variant="success" size="sm" class="ring-0" />
									{m.dash_ready()}
								</span>
							{:else}
								<span class="inline-flex items-center gap-2 text-warning-foreground">
									<Status variant="warning" size="sm" class="ring-0" />
									{m.dash_degraded()}
								</span>
							{/if}
						</TableCell>
					</TableRow>
				{/each}
			{/if}
		</TableBody>
	</Table>
{/snippet}

<WidgetCard
	title={m.workspace_workload_health_title()}
	info={m.workspace_workload_health_description()}
	status={workloads.status}
	stale={workloads.stale}
	emptyDescription={m.workspace_namespace_unresolved()}
	bodyClass="min-h-48"
>
	{#snippet skeleton()}
		{@render frame('skeleton')}
	{/snippet}
	{@render frame('rows')}
</WidgetCard>
