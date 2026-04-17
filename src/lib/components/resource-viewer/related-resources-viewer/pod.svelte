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
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

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
			{@const waitingReason = pod?.status?.containerStatuses?.find(
				(containerStatus) => containerStatus.state?.waiting
			)?.state?.waiting?.reason}
			{@const terminatedReason = pod?.status?.containerStatuses?.find(
				(containerStatus) => containerStatus.state?.terminated
			)?.state?.terminated?.reason}
			{@const status = waitingReason ?? terminatedReason ?? pod?.status?.phase ?? 'Unknown'}
			<Badge>{status}</Badge>
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
	<Card.Content class="space-y-4">
		{#if (pod?.status?.conditions?.length ?? 0) > 0}
			{@const readyCondition = pod.status?.conditions?.find(
				(condition) => condition.type === 'Ready'
			)}
			{#if !readyCondition}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Undetermined</Item.Title>
					</Item.Content>
				</Item.Root>
			{:else if readyCondition.status === 'True'}
				<Item.Root class="p-0">
					<Item.Content>
						<Item.Title>Ready</Item.Title>
					</Item.Content>
				</Item.Root>
			{:else if readyCondition.status === 'False'}
				<Item.Root class="p-0">
					<Item.Content class="**:text-destructive">
						{#if readyCondition.status === 'False' && readyCondition.message}
							<Item.Description class="text-xs">
								{readyCondition.message}
							</Item.Description>
						{/if}
					</Item.Content>
				</Item.Root>
			{/if}
		{/if}
		{#if (pod?.status?.containerStatuses?.length ?? 0) > 0}
			<div class="flex flex-col gap-2">
				{#each pod.status?.containerStatuses ?? [] as containerStatus, index (index)}
					<Item.Root class="p-0">
						<Item.Content>
							<Item.Title class="flex items-center gap-2 text-sm">
								{containerStatus.name}
								{#if containerStatus.ready}
									<Badge variant="outline">Ready</Badge>
								{/if}
							</Item.Title>
							<Item.Description class="text-xs">
								{#if containerStatus.state?.running}
									<p>Running</p>
								{:else if containerStatus.state?.waiting}
									<p>Waiting: {containerStatus.state.waiting.reason}</p>
								{:else if containerStatus.state?.terminated}
									<p>Terminated: {containerStatus.state.terminated.reason}</p>
								{/if}
								{#if (containerStatus.restartCount ?? 0) > 0}
									<p>{containerStatus.restartCount} restarts</p>
								{/if}
							</Item.Description>
						</Item.Content>
					</Item.Root>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
