<script lang="ts">
	import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/svelte';
	import type { Table } from '@tanstack/table-core';

	import { Button } from '$lib/components/ui/button';

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
			<ChevronsLeft class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-8"
			disabled={!canPrev}
			onclick={() => table.previousPage()}
		>
			<ChevronLeft class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-8"
			disabled={!canNext}
			onclick={() => table.nextPage()}
		>
			<ChevronRight class="size-4" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			class="size-8"
			disabled={!canNext}
			onclick={() => table.setPageIndex(pageCount - 1)}
		>
			<ChevronsRight class="size-4" />
		</Button>
	</div>
</div>
