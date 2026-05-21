<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { AppsV1StatefulSet } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import { cn } from '$lib/utils';

	let {
		statefulSet,
		cluster,
		namespace
	}: {
		statefulSet: AppsV1StatefulSet;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root class="border-0 bg-muted/30 shadow-none ring-0">
	<Card.Header>
		<Card.Title>{statefulSet?.metadata?.name}</Card.Title>
		<Card.Description>
			<Badge>
				{statefulSet?.status?.readyReplicas ?? 0}/{statefulSet?.status?.replicas ??
					statefulSet?.spec?.replicas ??
					0} ready
			</Badge>
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={statefulSet?.metadata?.namespace ?? namespace}
				group="apps"
				version="v1"
				resource="statefulsets"
				object={statefulSet}
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
