<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { CoreV1PersistentVolumeClaim } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		persistentVolumeClaim,
		cluster,
		namespace
	}: {
		persistentVolumeClaim: CoreV1PersistentVolumeClaim;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{persistentVolumeClaim?.metadata?.name}</Card.Title>
		<Card.Description>
			<Badge>{persistentVolumeClaim?.status?.phase}</Badge>
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={persistentVolumeClaim?.metadata?.namespace ?? namespace}
				group=""
				version="v1"
				resource="persistentvolumeclaims"
				object={persistentVolumeClaim}
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
		{@const accessModes = persistentVolumeClaim?.status?.accessModes ?? []}
		<p class="text-xl">{persistentVolumeClaim?.status?.capacity?.storage}</p>
		{#each accessModes as accessMode, index (index)}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Access Mode</Item.Title>
					<Item.Description>{accessMode}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/each}
	</Card.Content>
</Card.Root>
