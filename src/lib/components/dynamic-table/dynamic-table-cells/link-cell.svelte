<script lang="ts" module>
	import type { JsonValue } from '@bufbuild/protobuf';

	export type LinkMetadata = {
		hyperlink: string | (() => string);
	};
</script>

<script lang="ts">
	import { type Column, type Row } from '@tanstack/table-core';

	let {
		row,
		column,
		metadata
	}: {
		row: Row<Record<string, JsonValue>>;
		column: Column<Record<string, JsonValue>>;
		metadata: LinkMetadata;
	} = $props();

	if (!metadata) {
		throw Error(`Expected metadata of ${column.id} for LinkCell, but got metadata:`, metadata);
	}

	const data: JsonValue = $derived(row.original[column.id]);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href={typeof metadata.hyperlink === 'function' ? metadata.hyperlink() : metadata.hyperlink}
	class="hover:underline"
>
	<p class="max-w-3xs truncate">{data}</p>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
