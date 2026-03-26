<script lang="ts">
	import { EyeIcon } from '@lucide/svelte';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	import type { ChartType } from '../types';

	let {
		chart
	}: {
		chart: ChartType;
	} = $props();

	let open = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<EyeIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>View</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		class="flex h-fit max-h-[77vh] max-w-[62vw] min-w-[50vw] flex-col justify-between"
	>
		<Dialog.Header>
			<Dialog.Title class="capitalize">
				{chart.repository_name}
				{chart.name}
			</Dialog.Title>
			<Dialog.Description>
				{chart.description}
			</Dialog.Description>
		</Dialog.Header>
		<Code.Root variant="secondary" lang="yaml" code={stringify(chart)} class="w-full border-none" />
	</Dialog.Content>
</Dialog.Root>
