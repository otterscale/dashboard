<script lang="ts">
	import { setContext } from 'svelte';
	import type { Readable } from 'svelte/store';

	import * as Popover from '$lib/components/ui/popover';

	export type SelectOption = {
		value: string;
		label: string;
		icon?: string;
	};

	let {
		options,
		value = $bindable(),
		children,
		...restProps
	}: {
		options: Readable<SelectOption[]>;
		value?: string;
		children?: import('svelte').Snippet;
		[key: string]: unknown;
	} = $props();

	let open = $state(false);
	let search = $state('');

	const currentLabel = $derived(
		(() => {
			const opts = options as { subscribe: (fn: (v: SelectOption[]) => void) => () => void };
			let list: SelectOption[] = [];
			const unsub = opts.subscribe((v) => {
				list = v;
			});
			unsub();
			return list.find((o) => o.value === value)?.label ?? '';
		})()
	);

	setContext('single-select', {
		getOptions: () => options,
		getValue: () => value,
		setValue: (v: string) => {
			value = v;
			open = false;
			search = '';
		},
		getOpen: () => open,
		setOpen: (v: boolean) => {
			open = v;
		},
		getSearch: () => search,
		setSearch: (v: string) => {
			search = v;
		},
		getCurrentLabel: () => currentLabel
	});
</script>

<Popover.Root bind:open>
	{@render children?.()}
</Popover.Root>
