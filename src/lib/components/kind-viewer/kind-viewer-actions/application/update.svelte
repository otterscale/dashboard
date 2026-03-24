<script lang="ts">
	import { FormIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	import * as Item from '$lib/components/ui/item';

	import UpdateCronJob from './update-cronjob.svelte';
	import UpdateDeployment from './update-deployment.svelte';
	import UpdateJob from './update-job.svelte';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		schema,
		object,
		onOpenChangeComplete,
		trigger,
		onsuccess
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
		object?: any;
		onOpenChangeComplete?: () => void;
		trigger?: Snippet<[Record<string, any>]>;
		onsuccess?: () => void;
	} = $props();

	const workloadType = $derived(object?.spec?.workloadType as string | undefined);
</script>

{#if workloadType === 'CronJob'}
	<UpdateCronJob
		{cluster}
		{namespace}
		{group}
		{version}
		{kind}
		{resource}
		{schema}
		{object}
		{onOpenChangeComplete}
		{trigger}
		{onsuccess}
	/>
{:else if workloadType === 'Deployment'}
	<UpdateDeployment
		{cluster}
		{namespace}
		{group}
		{version}
		{kind}
		{resource}
		{schema}
		{object}
		{onOpenChangeComplete}
		{trigger}
		{onsuccess}
	/>
{:else if workloadType === 'Job'}
	<UpdateJob
		{cluster}
		{namespace}
		{group}
		{version}
		{kind}
		{resource}
		{schema}
		{object}
		{onOpenChangeComplete}
		{trigger}
		{onsuccess}
	/>
{:else if trigger}
	{@render trigger({})}
{:else}
	<Item.Root class="w-full p-0 text-xs" size="sm">
		<Item.Media>
			<FormIcon />
		</Item.Media>
		<Item.Content>
			<Item.Title>Update</Item.Title>
		</Item.Content>
	</Item.Root>
{/if}
