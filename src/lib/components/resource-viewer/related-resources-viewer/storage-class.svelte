<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		storageClass,
		cluster
	}: {
		storageClass: any;
		cluster: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{storageClass?.metadata?.name}</Card.Title>
		<Card.Action>
			<Describe
				{cluster}
				namespace=""
				group="storage.k8s.io"
				version="v1"
				resource="storageclasses"
				object={storageClass}
			>
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
						<FileSearchIcon />
					</Dialog.Trigger>
				{/snippet}
			</Describe>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-2">
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title>Provisioner</Item.Title>
				<Item.Description>{storageClass?.provisioner}</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if storageClass?.reclaimPolicy}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Reclaim Policy</Item.Title>
					<Item.Description>{storageClass.reclaimPolicy}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if storageClass?.volumeBindingMode}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Volume Binding Mode</Item.Title>
					<Item.Description>{storageClass.volumeBindingMode}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
</Card.Root>
