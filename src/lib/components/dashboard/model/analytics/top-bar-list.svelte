<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';

	type Bar = {
		label: string;
		value: number;
		displayValue: string;
		barClass?: string;
		textClass?: string;
	};

	let {
		title,
		description,
		tooltip,
		bars,
		isLoaded,
		onBarClick
	}: {
		title: string;
		description: string;
		tooltip: string;
		bars: Bar[];
		isLoaded: boolean;
		onBarClick?: (label: string) => void;
	} = $props();

	const maxValue = $derived(bars.reduce((m, b) => Math.max(m, b.value), 0));
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{title}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">{description}</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{tooltip}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[260px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if bars.length === 0}
			<div class="flex h-[260px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each bars as bar (bar.label)}
					{@const pct = maxValue > 0 ? Math.max(2, (bar.value / maxValue) * 100) : 0}
					<li>
						{#if onBarClick}
							<button
								type="button"
								class="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-1 text-left hover:bg-muted/60"
								onclick={() => onBarClick?.(bar.label)}
							>
								<span class="flex flex-col gap-1 overflow-hidden">
									<span class="truncate text-xs font-medium" title={bar.label}>
										{bar.label}
									</span>
									<span class="relative h-2.5 w-full overflow-hidden rounded bg-muted">
										<span
											class="absolute inset-y-0 left-0 rounded bg-chart-1 {bar.barClass ?? ''}"
											style="width: {pct}%"
										></span>
									</span>
								</span>
								<span class="font-mono text-sm tabular-nums {bar.textClass ?? ''}">
									{bar.displayValue}
								</span>
							</button>
						{:else}
							<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1 py-1">
								<span class="flex flex-col gap-1 overflow-hidden">
									<span class="truncate text-xs font-medium" title={bar.label}>
										{bar.label}
									</span>
									<span class="relative h-2.5 w-full overflow-hidden rounded bg-muted">
										<span
											class="absolute inset-y-0 left-0 rounded bg-chart-1 {bar.barClass ?? ''}"
											style="width: {pct}%"
										></span>
									</span>
								</span>
								<span class="font-mono text-sm tabular-nums {bar.textClass ?? ''}">
									{bar.displayValue}
								</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Statistics.Content>
</Statistics.Root>
