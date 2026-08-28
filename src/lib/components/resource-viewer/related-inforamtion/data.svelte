<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import lodash from 'lodash';
	import { Debounced } from 'runed';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';

	import type { Resource } from '../types';

	let { object }: { object: Resource | undefined } = $props();

	// `filterInput` follows the text box immediately; `debouncedFilter` is the
	// value that actually drives the lodash lookup (via runed).
	let filterInput = $state('');
	const debouncedFilter = new Debounced(() => filterInput.trim(), 300);

	function clearFilter() {
		filterInput = '';
		debouncedFilter.setImmediately('');
	}

	const result = $derived.by(() => {
		const path = debouncedFilter.current;
		if (!path) return { value: object as unknown, message: '' };
		if (!lodash.hasIn(object, path)) {
			return {
				value: object as unknown,
				message: `No value found at path "${path}" — showing the full resource instead.`
			};
		}
		return { value: lodash.get(object, path) as unknown, message: '' };
	});

	const yaml = $derived(result.value === undefined ? '' : stringify(result.value));
</script>

<div class="space-y-4">
	<InputGroup.Root>
		<InputGroup.Addon>
			<SearchIcon size={16} />
		</InputGroup.Addon>
		<InputGroup.Input placeholder="e.g., key.subKey or array[index]" bind:value={filterInput} />
		{#if filterInput}
			<InputGroup.Addon align="inline-end">
				<InputGroup.Button size="icon-xs" onclick={clearFilter} aria-label="Clear filter">
					<XIcon />
				</InputGroup.Button>
			</InputGroup.Addon>
		{/if}
	</InputGroup.Root>
	{#if result.message}
		<p class="text-sm text-destructive">{result.message}</p>
	{/if}
	<Code.Root class="border-none bg-muted" lang="yaml" code={yaml} hideLines>
		<Code.CopyButton />
	</Code.Root>
</div>
