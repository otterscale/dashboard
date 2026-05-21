<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { LeaderworkersetXK8SIoV1LeaderWorkerSet } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
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
</Card.Root>
