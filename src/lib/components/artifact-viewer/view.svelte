<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { Eye } from '@lucide/svelte';
	import lodash from 'lodash';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import * as Dialog from '$lib/components/ui/dialog';

	import { buttonVariants } from '../ui/button';

	let {
		data
	}: {
		data: JsonValue;
	} = $props();

	let open = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
		<Eye />
	</Dialog.Trigger>
	<Dialog.Content
		class="flex h-fit max-h-[77vh] max-w-[62vw] min-w-[50vw] flex-col justify-between"
	>
		<Dialog.Header>
			<Dialog.Title class="capitalize">
				{@const type = lodash.get(data, 'type') as string}
				{type.toLowerCase()}
			</Dialog.Title>
			<Dialog.Description>
				{lodash.get(data, 'digest')}
			</Dialog.Description>
		</Dialog.Header>
		<Code.Root variant="secondary" lang="yaml" code={stringify(data)} class="w-full border-none" />
	</Dialog.Content>
</Dialog.Root>
