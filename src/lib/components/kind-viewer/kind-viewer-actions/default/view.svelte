<script lang="ts">
	import EyeIcon from '@lucide/svelte/icons/eye';
	import type { ModelOtterscaleIoV1Alpha1ModelService } from '@otterscale/types';
	import type { Schema } from 'ajv';
	import lodash from 'lodash';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	let {
		schema,
		object,
		onOpenChangeComplete
	}: {
		schema: Schema;
		object: ModelOtterscaleIoV1Alpha1ModelService;
		onOpenChangeComplete?: () => void;
	} = $props();

	let open = $state(false);

	const name = $derived(object?.metadata?.name);
</script>

<Dialog.Root bind:open {onOpenChangeComplete}>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<EyeIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>View</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content class="flex h-fit max-h-[95vh] min-w-[50vw] flex-col justify-between">
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-lg font-bold">
						View - {name}
					</Item.Title>
					<Item.Description>{lodash.get(schema, 'description')}</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>
		<Code.Root
			variant="secondary"
			lang="yaml"
			code={stringify(object)}
			class="w-full border-none"
		/>
	</Dialog.Content>
</Dialog.Root>
