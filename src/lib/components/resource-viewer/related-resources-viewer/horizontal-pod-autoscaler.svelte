<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { AutoscalingV2HorizontalPodAutoscaler } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		horizontalPodAutoscaler,
		cluster,
		namespace
	}: {
		horizontalPodAutoscaler: AutoscalingV2HorizontalPodAutoscaler;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
	<Card.Header>
		<Card.Title>{horizontalPodAutoscaler?.metadata?.name}</Card.Title>
		<Card.Description>
			{@const condition =
				horizontalPodAutoscaler?.status?.conditions?.find(
					(condition) => condition.status === 'True'
				) ?? horizontalPodAutoscaler?.status?.conditions?.[0]}
			{#if condition?.status === 'True'}
				<Badge>{condition?.type ?? 'Active'}</Badge>
			{:else}
				<Badge variant="destructive">{condition?.reason ?? 'Pending'}</Badge>
			{/if}
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={horizontalPodAutoscaler?.metadata?.namespace ?? namespace}
				group="autoscaling"
				version="v2"
				resource="horizontalpodautoscalers"
				object={horizontalPodAutoscaler}
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
		{#if horizontalPodAutoscaler?.spec?.scaleTargetRef}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title class="text-xs">Scale Target</Item.Title>
					<Item.Description>
						{horizontalPodAutoscaler.spec.scaleTargetRef.kind}/
						{horizontalPodAutoscaler.spec.scaleTargetRef.name}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		<Item.Root class="p-0">
			<Item.Content>
				<Item.Title class="text-xs">Replicas</Item.Title>
				<Item.Description>
					{horizontalPodAutoscaler?.status?.currentReplicas ?? 0} current /
					{horizontalPodAutoscaler?.status?.desiredReplicas ?? 0} desired
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</Card.Content>
</Card.Root>
