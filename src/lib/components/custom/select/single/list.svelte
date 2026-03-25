<script lang="ts">
	import { getContext } from 'svelte';
	import type { Readable } from 'svelte/store';

	import { cn } from '$lib/utils';

	import type { SelectOption } from './root.svelte';

	let {
		class: className = undefined,
		children
	}: { class?: string; children?: import('svelte').Snippet } = $props();

	const ctx = getContext<{
		getOptions: () => Readable<SelectOption[]>;
		getSearch: () => string;
	}>('single-select');

	$effect(() => {
		const search = ctx.getSearch().toLowerCase();
		const unsub = ctx.getOptions().subscribe((_opts) => {
			_opts.filter((o) => o.label.toLowerCase().includes(search));
		});
		return unsub;
	});
</script>

<div class={cn('max-h-[300px] overflow-y-auto p-1', className)}>
	{@render children?.()}
</div>
