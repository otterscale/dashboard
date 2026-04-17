<script lang="ts">
	import { FileSearchIcon } from '@lucide/svelte';
	import type { BatchV1CronJob } from '@otterscale/types';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let {
		cronjob,
		cluster,
		namespace
	}: {
		cronjob: BatchV1CronJob;
		cluster: string;
		namespace: string;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{cronjob?.metadata?.name}</Card.Title>
		<Card.Description>
			<Badge>{cronjob?.status?.phase}</Badge>
		</Card.Description>
		<Card.Action>
			<Describe
				{cluster}
				namespace={cronjob?.metadata?.namespace ?? namespace}
				group="batch"
				version="v1"
				resource="cronjobs"
				object={cronjob}
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
		{#if cronjob.spec?.schedule}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Schedule</Item.Title>
					<Item.Description>{cronjob.spec?.schedule}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if cronjob?.spec?.timeZone}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Time Zone</Item.Title>
					<Item.Description>{cronjob.spec?.timeZone}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if cronjob?.status?.active}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Active</Item.Title>
					<Item.Description>{cronjob.status?.active?.length}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if cronjob?.status?.lastScheduleTime}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Last Schedule Time</Item.Title>
					<Item.Description>{cronjob.status?.lastScheduleTime}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
		{#if cronjob?.status?.lastSuccessfulTime}
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>Last Successful Time</Item.Title>
					<Item.Description>{cronjob.status?.lastSuccessfulTime}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
</Card.Root>
