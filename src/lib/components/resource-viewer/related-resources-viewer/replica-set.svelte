<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { AppsV1ReplicaSet } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import { cn } from '$lib/utils';

	let {
		replicaSet,
		cluster,
		namespace
	}: {
		replicaSet: AppsV1ReplicaSet;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
	<Card.Header>
		<Card.Title>{replicaSet?.metadata?.name}</Card.Title>
		<Card.Description>
			<Badge>
				{replicaSet?.status?.readyReplicas ?? 0}/{replicaSet?.status?.replicas ??
					replicaSet?.spec?.replicas ??
					0} ready
			</Badge>
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={replicaSet?.metadata?.namespace ?? namespace}
				group="apps"
				version="v1"
				resource="replicasets"
				object={replicaSet}
			>
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
						<FileSearchIcon size={16} />
					</Dialog.Trigger>
				{/snippet}
			</Describe>
		</Card.Action>
	</Card.Header>
</Card.Root>
