<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { GatewayNetworkingK8SIoV1Gateway } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		gateway,
		cluster,
		namespace
	}: {
		gateway: GatewayNetworkingK8SIoV1Gateway;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
	<Card.Header>
		<Card.Title>{gateway?.metadata?.name}</Card.Title>
		<Card.Description>
			<Badge>{gateway?.spec?.gatewayClassName ?? 'Gateway'}</Badge>
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={gateway?.metadata?.namespace ?? namespace}
				group="gateway.networking.k8s.io"
				version="v1"
				resource="gateways"
				object={gateway}
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
		{@const listeners = gateway?.spec?.listeners ?? []}
		{#if listeners.length > 0}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title class="text-xs">Listeners</Item.Title>
					<Item.Description class="flex flex-wrap gap-1">
						{#each listeners as listener, index (index)}
							<Badge variant="outline">
								{listener.name ?? `listener-${index + 1}`}
							</Badge>
						{/each}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
</Card.Root>
