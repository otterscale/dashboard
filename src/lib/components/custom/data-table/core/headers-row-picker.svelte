<script lang="ts">
	import type { Table } from '@tanstack/table-core';
	import { Checkbox } from '$lib/components/ui/checkbox';

	let { table }: { table: Table<unknown> } = $props();
</script>

<Checkbox
	checked={table.getIsAllPageRowsSelected()
		? true
		: table.getIsSomePageRowsSelected()
			? 'indeterminate'
			: false}
	onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
	aria-label="Select all"
/>
