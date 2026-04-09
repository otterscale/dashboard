<script lang="ts">
	import {
		CircleIcon,
		FileSearchIcon,
		RotateCcwIcon,
		ScrollTextIcon,
		TerminalSquareIcon,
		XIcon
	} from '@lucide/svelte';
	import type { AppsV1Deployment } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import Log from '$lib/components/kind-viewer/kind-viewer-actions/default/log.svelte';
	import Restart from '$lib/components/kind-viewer/kind-viewer-actions/default/restart.svelte';
	import Terminal from '$lib/components/kind-viewer/kind-viewer-actions/default/terminal.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		deployment,
		cluster,
		namespace
	}: {
		deployment: AppsV1Deployment;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{deployment?.metadata?.name}</Card.Title>
		<Card.Description>
			{@const availability = deployment.status?.conditions?.find(
				(condition) => condition.type === 'Available'
			)}
			{#if availability?.status === 'True'}
				<Badge>Available</Badge>
			{:else}
				<Badge variant="destructive">Unavailable</Badge>
			{/if}
		</Card.Description>
		<Card.Action class="flex items-center">
			<Describe
				{cluster}
				namespace={deployment?.metadata?.namespace ?? namespace}
				group="apps"
				version="v1"
				resource="deployments"
				object={deployment}
			>
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
						<FileSearchIcon size={16} />
					</Dialog.Trigger>
				{/snippet}
			</Describe>
			<Log {cluster} object={deployment} kind="Deployment">
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
						<ScrollTextIcon size={16} />
					</Dialog.Trigger>
				{/snippet}
			</Log>
			<Terminal {cluster} object={deployment}>
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
						<TerminalSquareIcon size={16} />
					</Dialog.Trigger>
				{/snippet}
			</Terminal>
			<Restart
				{cluster}
				namespace={deployment?.metadata?.namespace ?? namespace}
				group="apps"
				version="v1"
				kind="Deployment"
				resource="deployments"
				object={deployment}
			>
				{#snippet trigger()}
					<Dialog.Trigger class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
						<RotateCcwIcon size={16} />
					</Dialog.Trigger>
				{/snippet}
			</Restart>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-2">
		{@const conditions = deployment?.status?.conditions ?? []}
		{#each conditions as condition, index (index)}
			<Item.Root class="p-0">
				<Item.Media>
					{#if condition.status === 'True'}
						<CircleIcon />
					{:else}
						<XIcon />
					{/if}
				</Item.Media>
				<Item.Content>
					<Item.Title>{condition.type}</Item.Title>
					<Item.Description>{condition.reason}</Item.Description>
					{condition.message}
				</Item.Content>
				<Item.Actions>{condition.lastUpdateTime}</Item.Actions>
			</Item.Root>
		{/each}
	</Card.Content>
</Card.Root>
