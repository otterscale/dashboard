<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { GatewayNetworkingK8SIoV1HTTPRoute } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		httpRoute,
		cluster,
		namespace
	}: {
		httpRoute: GatewayNetworkingK8SIoV1HTTPRoute;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
	<Card.Header>
		<Card.Title>{httpRoute?.metadata?.name}</Card.Title>
		<Card.Description>
			{@const accepted = httpRoute?.status?.parents?.[0]?.conditions?.find(
				(condition) => condition.type === 'Accepted'
			)}
			{#if accepted?.status === 'True'}
				<Badge>Accepted</Badge>
			{:else}
				<Badge variant="destructive">{accepted?.reason ?? 'Not Accepted'}</Badge>
			{/if}
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={httpRoute?.metadata?.namespace ?? namespace}
				group="gateway.networking.k8s.io"
				version="v1"
				resource="httproutes"
				object={httpRoute}
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
		{@const hostnames = httpRoute?.spec?.hostnames ?? []}
		{#if hostnames.length > 0}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title class="text-xs">Hostnames</Item.Title>
					<Item.Description class="flex flex-wrap gap-1">
						{#each hostnames as hostname (hostname)}
							<Badge variant="outline" class="font-mono">{hostname}</Badge>
						{/each}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{@const parentRefs = httpRoute?.spec?.parentRefs ?? []}
		{#if parentRefs.length > 0}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title class="text-xs">Gateways</Item.Title>
					<Item.Description class="flex flex-wrap gap-1">
						{#each parentRefs as parentRef, index (index)}
							<Badge variant="outline">{parentRef.name}</Badge>
						{/each}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
</Card.Root>
