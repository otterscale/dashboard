<script lang="ts">
	import { Eye } from '@lucide/svelte';
	import lodash from 'lodash';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		schema,
		object
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: any;
		object: Record<string, unknown>;
	} = $props();

	const apiVersion = $derived(group ? `${group}/${version}` : version);

	let open = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<Eye />
			</Item.Media>
			<Item.Content>
				<Item.Title>View</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content
		class="flex h-fit max-h-[77vh] max-w-[62vw] min-w-[50vw] flex-col justify-between"
	>
		<Dialog.Header>
			<Dialog.Title>
				<Item.Root class="w-full p-0" size="sm">
					<Item.Content>
						<Item.Title class="text-xl font-bold">{kind}</Item.Title>
						<Item.Description>{cluster} {apiVersion} {resource}</Item.Description>
					</Item.Content>
				</Item.Root>
			</Dialog.Title>
			<Dialog.Description>{lodash.get(schema, 'description')}</Dialog.Description>
		</Dialog.Header>
		<Code.Root
			variant="secondary"
			lang="yaml"
			code={stringify(object)}
			class="w-full border-none"
		/>
	</Dialog.Content>
</Dialog.Root>
