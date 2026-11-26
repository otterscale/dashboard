<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';

	import { Chip } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';

	// The picked pool, OSD or PVC: what kind it is, its name, a chip and a line of facts. A note
	// (e.g. a PVC that is not mounted) closes the line, set apart by an info mark and a rule.
	let {
		kind,
		name,
		chip,
		line,
		note,
		loading = false
	}: {
		kind: string;
		name: string | undefined;
		chip?: string;
		line?: string;
		note?: string;
		loading?: boolean;
	} = $props();
</script>

<div class="flex min-h-11 min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 pt-3">
	<h2 class="flex min-w-0 items-baseline gap-2.5">
		<span class="text-xs text-muted-foreground">{kind}</span>
		{#if name}
			<span class="min-w-0 truncate font-mono text-[1.375rem] leading-7 tracking-tight" title={name}
				>{name}</span
			>
		{:else if loading}
			<Skeleton class="h-5 w-40 self-center" />
		{/if}
	</h2>
	{#if name && chip}
		<Chip class="leading-4">{chip}</Chip>
	{/if}
	{#if name && line}
		<span class="text-[0.8125rem] text-muted-foreground">{line}</span>
	{/if}
	{#if name && note}
		<span
			class="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-chart-1 @2xl:border-l @2xl:pl-2.5"
			role="status"
		>
			<InfoIcon class="size-3.5 shrink-0" aria-hidden="true" />
			{note}
		</span>
	{/if}
</div>
