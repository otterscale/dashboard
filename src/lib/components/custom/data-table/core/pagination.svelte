<script lang="ts">
	import type { Table } from '@tanstack/table-core';
	import { Button } from '$lib/components/ui/button';
	import Icon from '@iconify/svelte';

	let { table }: { table: Table<unknown> } = $props();

	const pageIndex = $derived(table.getState().pagination.pageIndex);
	const pageCount = $derived(table.getPageCount());
	const canPrev = $derived(table.getCanPreviousPage());
	const canNext = $derived(table.getCanNextPage());
</script>

<div class="flex items-center justify-between gap-2">
	<p class="text-sm text-muted-foreground">
		Page {pageIndex + 1} of {pageCount}
	</p>
	<div class="flex items-center gap-1">
		<Button
			variant="outline"
			size="icon"
			class="size-8"
			disabled={!canPrev}
			onclick={() => table.setPageIndex(0)}
		>
			<Icon icon="ph:caret-double-left" class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-8"
			disabled={!canPrev}
			onclick={() => table.previousPage()}
		>
			<Icon icon="ph:caret-left" class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-8"
			disabled={!canNext}
			onclick={() => table.nextPage()}
		>
			<Icon icon="ph:caret-right" class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-8"
			disabled={!canNext}
			onclick={() => table.setPageIndex(pageCount - 1)}
		>
			<Icon icon="ph:caret-double-right" class="size-4" />
		</Button>
	</div>
</div>
