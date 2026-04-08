<script lang="ts">
	import { FileSearchIcon, ScrollTextIcon, TerminalSquareIcon } from '@lucide/svelte';
	import type { CoreV1Pod } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import Log from '$lib/components/kind-viewer/kind-viewer-actions/default/log.svelte';
	import Terminal from '$lib/components/kind-viewer/kind-viewer-actions/default/terminal.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import { cn } from '$lib/utils';

	import { getContainerReadies, getContainerRestarts, getPodStatus } from '../utils/pod';

	let {
		pod,
		cluster,
		namespace
	}: {
		pod: CoreV1Pod;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{pod?.metadata?.name}</Card.Title>
		<Card.Description>
			<Badge>{getPodStatus(pod)}</Badge>
		</Card.Description>
		<Card.Action class="flex items-center">
			<Describe
				{cluster}
				namespace={pod?.metadata?.namespace ?? namespace}
				group=""
				version="v1"
				resource="pods"
				object={pod}
			>
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
						<FileSearchIcon />
					</Dialog.Trigger>
				{/snippet}
			</Describe>
			<Log {cluster} object={pod} kind="Pod">
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
						<ScrollTextIcon />
					</Dialog.Trigger>
				{/snippet}
			</Log>
			<Terminal {cluster} object={pod}>
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost' }))}>
						<TerminalSquareIcon />
					</Dialog.Trigger>
				{/snippet}
			</Terminal>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex items-center gap-4 text-lg">
		<p>{getContainerRestarts(pod)} Restart</p>
		<p>{getContainerReadies(pod)} Ready</p>
	</Card.Content>
</Card.Root>
