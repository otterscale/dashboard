<script lang="ts" module>
	export type InfoRow = {
		label: string;
		value: string;
		/** Shown in full on hover, e.g. every Pod when the list is cut short. */
		title?: string;
		/** Names and codes in the monospaced face; prose and counts in the text face. */
		mono?: boolean;
	};
</script>

<script lang="ts">
	import { Panel, type WidgetState } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { cn } from '$lib/utils';

	// Facts about the picked pool, OSD or PVC: one per line, label left, value right. While it
	// loads it keeps one line per fact, so the card does not change height when they arrive.
	let {
		title,
		rows,
		state,
		labels,
		class: className
	}: {
		title: string;
		rows: InfoRow[];
		state: WidgetState;
		/** The labels to hold while loading. */
		labels: string[];
		class?: string;
	} = $props();
</script>

<Panel {title} state="ready" class={cn('min-w-0', className)} bodyClass="pt-2">
	<dl class="flex flex-col">
		{#if state === 'loading'}
			{#each labels as label (label)}
				<div class="flex min-h-9 items-center justify-between gap-4 border-b text-[0.8125rem]">
					<dt class="text-muted-foreground">{label}</dt>
					<dd><Skeleton class="h-3 w-24" /></dd>
				</div>
			{/each}
		{:else}
			{#each rows as row (row.label)}
				<div class="flex min-h-9 items-center justify-between gap-4 border-b text-[0.8125rem]">
					<dt class="shrink-0 text-muted-foreground">{row.label}</dt>
					<dd
						class={cn('min-w-0 truncate text-right', row.mono && 'font-mono text-xs')}
						title={row.title ?? row.value}
					>
						{row.value}
					</dd>
				</div>
			{/each}
		{/if}
	</dl>
</Panel>
