<script lang="ts">
	import { type Transport } from '@connectrpc/connect';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import { getContext, type Snippet } from 'svelte';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

	import LogViewer from './log-viewer.svelte';
	import { createPodResolver } from './pod-resolver.svelte';

	let {
		cluster,
		object,
		kind,
		onOpenChangeComplete,
		trigger
	}: {
		cluster: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		kind: string;
		onOpenChangeComplete?: () => void;
		trigger?: Snippet;
	} = $props();

	const transport: Transport = getContext('transport');
	const resolver = createPodResolver(() => ({ transport, cluster, object, kind }));

	let open = $state(false);

	async function handleOpenChange(isOpen: boolean) {
		if (!isOpen || kind === 'Pod') return;
		await resolver.resolve();
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	{#if trigger}
		{@render trigger()}
	{:else}
		<Dialog.Trigger class="w-full">
			<Item.Root class="p-0 text-xs" size="sm">
				<Item.Media>
					<ScrollTextIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Logs</Item.Title>
				</Item.Content>
			</Item.Root>
		</Dialog.Trigger>
	{/if}
	<Dialog.Content class="flex h-fit max-h-[80vh] max-w-[70vw] min-w-[55vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>Pod Logs — {resolver.effectivePodName || resolver.name}</Dialog.Title>
			<Dialog.Description
				>Streaming logs from namespace <strong>{resolver.namespace}</strong></Dialog.Description
			>
		</Dialog.Header>
		<LogViewer
			{cluster}
			namespace={resolver.namespace}
			podName={resolver.effectivePodName}
			containers={resolver.containers}
			active={open}
		>
			{#snippet extraControls({ restart })}
				{#if kind === 'CronJob' && resolver.associatedJobs.length > 0}
					<Select
						type="single"
						value={resolver.selectedJob}
						onValueChange={async (value) => {
							await resolver.handleJobChange(value);
							if (open) restart();
						}}
					>
						<SelectTrigger class="w-56 max-w-64 min-w-0">
							<span class="truncate">{resolver.selectedJob || 'Select job'}</span>
						</SelectTrigger>
						<SelectContent class="w-56 max-w-64">
							{#each resolver.associatedJobs as j (j)}
								<SelectItem value={j}>{j}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				{/if}
				{#if kind !== 'Pod' && resolver.associatedPods.length > 0}
					<Select
						type="single"
						value={resolver.selectedPod}
						onValueChange={(value) => {
							resolver.selectedPod = value;
							if (open) restart();
						}}
					>
						<SelectTrigger class="w-64 max-w-64 min-w-0">
							<span class="truncate">{resolver.selectedPod || 'Select pod'}</span>
						</SelectTrigger>
						<SelectContent class="w-64 max-w-64">
							{#each resolver.associatedPods as p (p)}
								<SelectItem value={p}>{p}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				{/if}
			{/snippet}
		</LogViewer>
	</Dialog.Content>
</Dialog.Root>
