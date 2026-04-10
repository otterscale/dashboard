<script lang="ts">
	import { type Transport } from '@connectrpc/connect';
	import TerminalSquareIcon from '@lucide/svelte/icons/terminal-square';
	import { getContext, type Snippet } from 'svelte';

	import { Terminal } from '$lib/components/applications/terminal';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

	import { createPodResolver } from './pod-resolver.svelte';

	let {
		cluster,
		object,
		kind = 'Pod',
		onOpenChangeComplete,
		trigger
	}: {
		cluster: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		kind?: string;
		onOpenChangeComplete?: () => void;
		trigger?: Snippet;
	} = $props();

	const transport: Transport = getContext('transport');
	const resolver = createPodResolver(() => ({ transport, cluster, object, kind }));

	let open = $state(false);
	let showTerminal = $state(false);

	async function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			showTerminal = true;
			await resolver.resolve();
		} else {
			showTerminal = false;
		}
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	{#if trigger}
		{@render trigger()}
	{:else}
		<Dialog.Trigger class="w-full">
			<Item.Root class="p-0 text-xs" size="sm">
				<Item.Media>
					<TerminalSquareIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Terminal</Item.Title>
				</Item.Content>
			</Item.Root>
		</Dialog.Trigger>
	{/if}
	<Dialog.Content class="flex h-fit max-h-[80vh] max-w-[70vw] min-w-[55vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>Terminal — {resolver.effectivePodName || resolver.name}</Dialog.Title>
			<Dialog.Description>
				Interactive shell in namespace <strong>{resolver.namespace}</strong>
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-wrap items-center gap-2">
			{#if kind === 'CronJob' && resolver.associatedJobs.length > 0}
				<Select
					type="single"
					value={resolver.selectedJob}
					onValueChange={async (value) => {
						await resolver.handleJobChange(value);
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
			{#if resolver.containers.length > 1}
				<Select
					type="single"
					value={resolver.selectedContainer}
					onValueChange={(value) => {
						if (value) resolver.selectedContainer = value;
					}}
				>
					<SelectTrigger class="w-48">
						{resolver.selectedContainer || 'Select container'}
					</SelectTrigger>
					<SelectContent>
						{#each resolver.containers as c (c)}
							<SelectItem value={c}>{c}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			{/if}
		</div>

		<div class="h-[55vh] overflow-hidden rounded-md border bg-[#1e1e1e] p-3">
			{#if showTerminal && resolver.selectedContainer && resolver.effectivePodName}
				{#key `${resolver.effectivePodName}-${resolver.selectedContainer}`}
					<Terminal
						{cluster}
						namespace={resolver.namespace}
						podName={resolver.effectivePodName}
						containerName={resolver.selectedContainer}
						command={['/bin/sh']}
					/>
				{/key}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
