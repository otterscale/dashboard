<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { InferenceNetworkingK8SIoV1InferencePool } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		inferencePool,
		cluster,
		namespace
	}: {
		inferencePool: InferenceNetworkingK8SIoV1InferencePool;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
	<Card.Header>
		<Card.Title>{inferencePool?.metadata?.name}</Card.Title>
		<Card.Description>
			{@const accepted = inferencePool?.status?.parents
				?.flatMap((parent) => parent.conditions ?? [])
				.find((condition) => condition.type === 'Accepted')}
			{#if accepted?.status === 'True'}
				<Badge>Accepted</Badge>
			{:else}
				<Badge variant="destructive">{accepted?.reason ?? 'Pending'}</Badge>
			{/if}
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={inferencePool?.metadata?.namespace ?? namespace}
				group="inference.networking.k8s.io"
				version="v1"
				resource="inferencepools"
				object={inferencePool}
			>
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
						<FileSearchIcon size={16} />
					</Dialog.Trigger>
				{/snippet}
			</Describe>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-2">
		{@const targetPorts = inferencePool?.spec?.targetPorts ?? []}
		{#if targetPorts.length > 0}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title class="text-xs">Target Ports</Item.Title>
					<Item.Description class="flex flex-wrap gap-1">
						{#each targetPorts as targetPort, index (index)}
							<Badge variant="outline" class="font-mono">{targetPort.number}</Badge>
						{/each}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{@const parents = inferencePool?.status?.parents ?? []}
		{#if parents.length > 0}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title class="text-xs">Parents</Item.Title>
					<Item.Description class="flex flex-wrap gap-1">
						{#each parents as parent, index (index)}
							<Badge variant="outline">{parent.parentRef.name}</Badge>
						{/each}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
</Card.Root>
