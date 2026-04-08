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
		object,
		cluster,
		namespace,
		group,
		version,
		resource
	}: {
		object: any;
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		resource: string;
	} = $props();

	const phase = $derived(object?.status?.phase);
	const conditions = $derived(object?.status?.conditions ?? []);
	const readyCondition = $derived(conditions.find((c: any) => c.type === 'Ready'));
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{object?.metadata?.name}</Card.Title>
		<Card.Description>
			{#if phase}
				<Badge
					variant={phase === 'Ready' ? 'default' : phase === 'Progressing' ? 'secondary' : 'destructive'}
				>
					{phase}
				</Badge>
			{/if}
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={object?.metadata?.namespace ?? namespace}
				{group}
				{version}
				{resource}
				{object}
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
				<Item.Title>Namespace</Item.Title>
				<Item.Description>{object?.metadata?.namespace}</Item.Description>
			</Item.Content>
		</Item.Root>
		{#if object?.metadata?.creationTimestamp}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Created</Item.Title>
					<Item.Description>
						{new Date(object.metadata.creationTimestamp).toLocaleString('sv-SE')}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if readyCondition}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Condition</Item.Title>
					<Item.Description>
						{readyCondition.message || readyCondition.status}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
</Card.Root>
