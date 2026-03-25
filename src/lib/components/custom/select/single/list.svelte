<script lang="ts">
	import type { Readable } from 'svelte/store';
	import { getContext } from 'svelte';
	import type { SelectOption } from './root.svelte';

	let { children }: { children?: import('svelte').Snippet } = $props();

	const ctx = getContext<{
		getOptions: () => Readable<SelectOption[]>;
		getSearch: () => string;
	}>('single-select');

	let filteredOptions = $state<SelectOption[]>([]);

	$effect(() => {
		const search = ctx.getSearch().toLowerCase();
		const unsub = ctx.getOptions().subscribe((opts) => {
			filteredOptions = search ? opts.filter((o) => o.label.toLowerCase().includes(search)) : opts;
		});
		return unsub;
	});
</script>

<div class="max-h-[300px] overflow-y-auto p-1">
	{@render children?.()}
</div>
