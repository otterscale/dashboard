<script lang="ts">
	import type { Row } from '@tanstack/table-core';
	import { Checkbox } from '$lib/components/ui/checkbox';

	let { row }: { row: Row<unknown> } = $props();
</script>

<Checkbox
	checked={row.getIsSelected()}
	onCheckedChange={(value) => row.toggleSelected(!!value)}
	aria-label="Select row"
/>
