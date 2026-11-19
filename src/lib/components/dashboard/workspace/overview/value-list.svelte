<script lang="ts">
	import { type Level, levelText } from '$lib/components/dashboard/shared/status';
	import {
		DataList,
		DataListItem,
		DataListItemLabel,
		DataListItemValue
	} from '$lib/components/shadcnio/data-list';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { cn } from '$lib/utils';

	// Label / value rows separated by hairlines (the small cards of the Solaris
	// picture). `skeleton` draws the same number of rows at the same height.
	let {
		rows = [],
		skeleton = 0,
		class: className
	}: {
		rows?: { label: string; value: string | number; level?: Level }[];
		/** Number of placeholder rows to draw instead of `rows`. */
		skeleton?: number;
		class?: string;
	} = $props();
</script>

{#if skeleton > 0}
	<div class={cn('flex flex-col divide-y divide-border/60', className)} aria-hidden="true">
		{#each { length: skeleton }, index (index)}
			<div class="flex h-10 items-center justify-between gap-4">
				<Skeleton class="h-3.5 w-2/5" />
				<Skeleton class="h-3.5 w-8" />
			</div>
		{/each}
	</div>
{:else}
	<DataList class={cn('gap-0 divide-y divide-border/60', className)}>
		{#each rows as row (row.label)}
			{@const level = row.level ?? 'neutral'}
			<DataListItem class="min-h-10 justify-between gap-4 py-2">
				<DataListItemLabel class="min-w-0 shrink font-normal [overflow-wrap:anywhere]">
					{row.label}
				</DataListItemLabel>
				<DataListItemValue
					class={cn(
						'flex-none text-right font-medium tabular-nums',
						levelText[level],
						level !== 'neutral' && 'font-semibold'
					)}
				>
					{row.value}
				</DataListItemValue>
			</DataListItem>
		{/each}
	</DataList>
{/if}
