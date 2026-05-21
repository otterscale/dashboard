<script lang="ts">
	import { ChevronDownIcon, FileSearchIcon } from '@lucide/svelte';
	import type { LeaderworkersetXK8SIoV1LeaderWorkerSet } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		leaderWorkerSet,
		cluster,
		namespace
	}: {
		leaderWorkerSet: LeaderworkersetXK8SIoV1LeaderWorkerSet;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
	<Card.Header>
		<Card.Title>{leaderWorkerSet?.metadata?.name}</Card.Title>
		<Card.Description>
			<Badge>
				{leaderWorkerSet?.status?.readyReplicas ?? 0}/{leaderWorkerSet?.status?.replicas ??
					leaderWorkerSet?.spec?.replicas ??
					0} ready
			</Badge>
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={leaderWorkerSet?.metadata?.namespace ?? namespace}
				group="leaderworkerset.x-k8s.io"
				version="v1"
				resource="leaderworkersets"
				object={leaderWorkerSet}
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
		<div class="grid grid-cols-2 gap-2">
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title class="text-xs">Ready Replicas</Item.Title>
					<Item.Description>
						{leaderWorkerSet?.status?.readyReplicas ?? 0}/{leaderWorkerSet?.status?.replicas ??
							leaderWorkerSet?.spec?.replicas ??
							0}
					</Item.Description>
				</Item.Content>
			</Item.Root>
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title class="text-xs">Updated Replicas</Item.Title>
					<Item.Description>
						{leaderWorkerSet?.status?.updatedReplicas ?? 0}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		</div>
		{@const conditions = leaderWorkerSet?.status?.conditions ?? []}
		{#each conditions as condition, index (index)}
			<Collapsible.Root class="rounded-lg transition-colors duration-200">
				<Collapsible.Trigger class="group w-full hover:underline">
					<Item.Root class="p-0">
						<Item.Media>
							<Badge>{condition.status}</Badge>
						</Item.Media>
						<Item.Content>
							<Item.Title>{condition.type}</Item.Title>
							<Item.Description class="flex items-center gap-2">
								{condition.reason}
							</Item.Description>
						</Item.Content>
						<Item.Actions>
							<ChevronDownIcon
								size={12}
								class="transition-transform duration-200 group-data-[state=open]:rotate-180"
							/>
						</Item.Actions>
					</Item.Root>
				</Collapsible.Trigger>
				<Collapsible.Content
					class="overflow-hidden rounded-lg p-4 text-sm break-all transition-all duration-300 ease-in-out"
				>
					{condition.message}
				</Collapsible.Content>
			</Collapsible.Root>
		{/each}
	</Card.Content>
</Card.Root>
