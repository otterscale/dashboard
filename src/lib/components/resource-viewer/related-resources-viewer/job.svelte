<script lang="ts">
	import { CircleIcon, FileSearchIcon, XIcon } from '@lucide/svelte';
	import type { BatchV1Job } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		job,
		cluster,
		namespace
	}: {
		job: BatchV1Job;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{job?.metadata?.name}</Card.Title>
		<Card.Description>
			{@const completeCondition = job?.status?.conditions?.find(
				(condition) => condition.type === 'Complete'
			)}
			{@const isComplete = completeCondition?.status === 'True'}
			{#if completeCondition}
				<Badge variant={isComplete ? 'default' : 'destructive'}>
					{isComplete ? 'Complete' : 'Incomplete'}
				</Badge>
			{/if}
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={job?.metadata?.namespace ?? namespace}
				group="batch"
				version="v1"
				resource="jobs"
				object={job}
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
		{@const conditions = job?.status?.conditions ?? []}
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
