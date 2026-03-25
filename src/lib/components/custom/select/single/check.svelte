<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { getContext } from 'svelte';

	import type { SelectOption } from './root.svelte';

	let { option }: { option: SelectOption } = $props();

	const ctx = getContext<{ getValue: () => string | undefined }>('single-select');
</script>

{#if ctx.getValue() === option.value}
	<Check class="ml-auto size-4" />
{:else}
	<span class="ml-auto size-4"></span>
{/if}
