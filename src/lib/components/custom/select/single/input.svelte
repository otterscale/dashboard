<script lang="ts">
	import { getContext } from 'svelte';
	import { cn } from '$lib/utils';

	let { class: className, ...restProps } = $props();

	const ctx = getContext<{
		getSearch: () => string;
		setSearch: (v: string) => void;
	}>('single-select');
</script>

<div class="border-b px-3 py-2">
	<input
		type="text"
		placeholder="Search…"
		class={cn(
			'w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground',
			className
		)}
		value={ctx.getSearch()}
		oninput={(e) => ctx.setSearch((e.currentTarget as HTMLInputElement).value)}
		{...restProps}
	/>
</div>
