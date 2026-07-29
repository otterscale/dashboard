<script lang="ts">
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import { ArcChart, Text } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	// Props
	let { client, isReloading = $bindable() }: { client: PrometheusDriver; isReloading: boolean } =
		$props();

	// Constants
	const CHART_TITLE = m.capacity();
	const CHART_DESCRIPTION = m.remaining_capacity();
	const chartConfig = { data: { color: 'var(--chart-2)' } } satisfies Chart.ChartConfig;

	// Thin provisioning lets total PVC requests exceed the physical pool; past
	// this ratio the number is highlighted as a warning.
	const WARN_RATIO = 3;

	// Queries
	const queries = $derived({
		used: `ceph_cluster_total_used_bytes{}`,
		total: `ceph_cluster_total_bytes{}`,
		overcommit: `sum(kube_persistentvolumeclaim_resource_requests_storage_bytes) / sum(ceph_cluster_total_bytes)`
	});

	// Auto Update
	let response = $state(
		{} as {
			usedValue: number | undefined;
			usedUnit: string | undefined;
			availableValue: number | undefined;
			availableUnit: string | undefined;
			totalValue: number | undefined;
			totalUnit: string | undefined;
			availablePercentage: { value: number }[];
		}
	);
	let overcommitRatio = $state<number>();
	let isLoading = $state(true);
	const reloadManager = new ReloadManager(fetch);

	// Data fetching function
	async function fetch() {
		const [usedResponse, totalResponse, overcommitResponse] = await Promise.all([
			client.instantQuery(queries.used),
			client.instantQuery(queries.total),
			client.instantQuery(queries.overcommit)
		]);

		const overcommitValue = parseFloat(overcommitResponse.result[0]?.value?.value);
		overcommitRatio = Number.isFinite(overcommitValue) ? overcommitValue : undefined;

		const usedValue = usedResponse.result[0]?.value?.value;
		const totalValue = totalResponse.result[0]?.value?.value;

		const usedCapacity = usedValue ? formatCapacity(usedValue) : null;
		const availableBytes = totalValue - usedValue;
		const availableCapacity = availableBytes ? formatCapacity(availableBytes) : null;
		const totalCapacity = totalValue ? formatCapacity(totalValue) : null;
		const availableRatio = availableBytes / totalValue;
		const availablePercentage = availableRatio != null ? availableRatio * 100 : null;

		response = {
			usedValue: usedCapacity ? Math.round(usedCapacity.value) : undefined,
			usedUnit: usedCapacity ? usedCapacity.unit : undefined,
			availableValue: availableCapacity ? Math.round(availableCapacity.value) : undefined,
			availableUnit: availableCapacity ? availableCapacity.unit : undefined,
			totalValue: totalCapacity ? Math.round(totalCapacity.value) : undefined,
			totalUnit: totalCapacity ? totalCapacity.unit : undefined,
			availablePercentage:
				availablePercentage !== null ? [{ value: availablePercentage }] : [{ value: NaN }]
		};
	}

	// Effects
	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	onMount(async () => {
		await fetch();
		isLoading = false;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<Card.Root class="h-full gap-2">
	<Card.Header class="h-[42px]">
		<Card.Title>{CHART_TITLE}</Card.Title>
		<Card.Description>{CHART_DESCRIPTION}</Card.Description>
	</Card.Header>
	{#if isLoading}
		<Card.Content>
			<div class="flex h-[200px] w-full items-center justify-center">
				<Loader2Icon class="size-12 animate-spin" />
			</div>
		</Card.Content>
	{:else if response.availableValue == undefined && response.availableUnit == undefined}
		<Card.Content>
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLineIcon class="size-50 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	{:else}
		<Card.Content>
			<Chart.Container class="h-[200px] w-full px-2 pt-2" config={chartConfig}>
				<ArcChart
					data={response.availablePercentage}
					outerRadius={88}
					innerRadius={66}
					trackOuterRadius={83}
					trackInnerRadius={72}
					padding={40}
					range={[90, -270]}
					maxValue={100}
					series={[
						{
							key: 'data',
							color: chartConfig.data.color
						}
					]}
					props={{
						arc: { track: { fill: 'var(--muted)' }, motion: 'tween' },
						tooltip: { context: { hideDelay: 350 } }
					}}
					tooltipContext={false}
				>
					{#snippet belowMarks()}
						<circle cx="0" cy="0" r="80" class="fill-background" />
					{/snippet}
					{#snippet aboveMarks()}
						<Text
							value="{response.availableValue} {response.availableUnit}"
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-4xl! font-bold"
							dy={3}
						/>
						<Text
							value="Used {response.usedValue} {response.usedUnit}"
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-muted-foreground!"
							dy={25}
						/>
					{/snippet}
				</ArcChart>
			</Chart.Container>
			{#if overcommitRatio !== undefined}
				<div
					class="flex items-center justify-center gap-1.5 text-sm text-muted-foreground"
					title={m.storage_overcommit_description()}
				>
					<ScaleIcon class="size-4" aria-hidden="true" />
					<span>{m.storage_overcommit_title()}</span>
					<span
						class={cn(
							'font-semibold text-foreground tabular-nums',
							overcommitRatio >= WARN_RATIO && 'text-amber-700 dark:text-amber-400'
						)}
					>
						{overcommitRatio.toFixed(1)}x
					</span>
				</div>
			{/if}
		</Card.Content>
	{/if}
</Card.Root>
