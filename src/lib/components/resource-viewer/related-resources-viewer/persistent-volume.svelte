<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		persistentVolume,
		cluster
	}: {
		persistentVolume: any;
		cluster: string;
	} = $props();

	const phase = $derived(persistentVolume?.status?.phase);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{persistentVolume?.metadata?.name}</Card.Title>
		<Card.Description>
			{#if phase}
				<Badge variant={phase === 'Bound' ? 'default' : 'secondary'}>
					{phase}
				</Badge>
			{/if}
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace=""
				group=""
				version="v1"
				resource="persistentvolumes"
				object={persistentVolume}
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
		{#if persistentVolume?.spec?.capacity?.storage}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Capacity</Item.Title>
					<Item.Description>{persistentVolume.spec.capacity.storage}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if persistentVolume?.spec?.storageClassName}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Storage Class</Item.Title>
					<Item.Description>{persistentVolume.spec.storageClassName}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if persistentVolume?.spec?.accessModes?.length}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Access Modes</Item.Title>
					<Item.Description>{persistentVolume.spec.accessModes.join(', ')}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if persistentVolume?.spec?.claimRef}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Claim</Item.Title>
					<Item.Description>
						{persistentVolume.spec.claimRef.namespace}/{persistentVolume.spec.claimRef.name}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
</Card.Root>
