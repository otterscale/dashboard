<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { CoreV1Service } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		service,
		cluster,
		namespace
	}: {
		service: CoreV1Service;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{service?.metadata?.name}</Card.Title>
		<Card.Description>
			<Badge>{service?.spec?.type}</Badge>
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={service?.metadata?.namespace ?? namespace}
				group=""
				version="v1"
				resource="services"
				object={service}
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
		{@const ports = service?.spec?.ports ?? []}
		{#each ports as port, index (index)}
			{#if port.name}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Name</Item.Title>
						<Item.Description>{port.name}</Item.Description>
					</Item.Content>
				</Item.Root>
			{/if}
			{#if port.protocol}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Protocol</Item.Title>
						<Item.Description>{port.protocol}</Item.Description>
					</Item.Content>
				</Item.Root>
			{/if}
			{#if port.nodePort}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Node Port</Item.Title>
						<Item.Description>{port.nodePort}</Item.Description>
					</Item.Content>
				</Item.Root>
			{/if}
			{#if port.port}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Port</Item.Title>
						<Item.Description>{port.port}</Item.Description>
					</Item.Content>
				</Item.Root>
			{/if}
			{#if port.targetPort}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Target Port</Item.Title>
						<Item.Description>{port.targetPort}</Item.Description>
					</Item.Content>
				</Item.Root>
			{/if}
		{/each}
	</Card.Content>
</Card.Root>
