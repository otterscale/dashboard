<script lang="ts">
	import { type Transport } from '@connectrpc/connect';
	import TerminalSquareIcon from '@lucide/svelte/icons/terminal-square';
	import { getContext, type Snippet } from 'svelte';

	import { Terminal } from '$lib/components/applications/terminal';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { cn } from '$lib/utils';

	import { ACTION_DIALOG_CONTENT_FIT_CLASS } from './constants';
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

	const hasPickers = $derived(
		(kind === 'CronJob' && resolver.associatedJobs.length > 0) ||
			(kind !== 'Pod' && resolver.associatedPods.length > 1) ||
			resolver.containers.length > 1
	);

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
	<Dialog.Content class={ACTION_DIALOG_CONTENT_FIT_CLASS}>
		<Dialog.Header>
			<div class="flex min-w-0 flex-col gap-1.5 text-left">
				<Dialog.Title class="truncate text-lg font-bold">
					Terminal — {resolver.effectivePodName || resolver.name}
				</Dialog.Title>
				<Dialog.Description class="truncate">
					Interactive shell in namespace <strong>{resolver.namespace}</strong>
				</Dialog.Description>
			</div>
		</Dialog.Header>

		<div
			class={cn(
				'relative h-[55vh] overflow-hidden rounded-md border bg-[#1e1e1e] p-3',
				// Floating pickers overlay the box's top-right; pad the shell clear of them.
				hasPickers && 'pt-12'
			)}
		>
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

			<!-- Source pickers float over the terminal's top-right corner. -->
			{#if hasPickers}
				<div class="absolute top-2 right-5 flex flex-wrap items-center justify-end gap-2">
					{#if kind === 'CronJob' && resolver.associatedJobs.length > 0}
						<Select
							type="single"
							value={resolver.selectedJob}
							onValueChange={async (value) => {
								await resolver.handleJobChange(value);
							}}
						>
							<SelectTrigger class="h-8 w-56 bg-background/90 shadow-sm backdrop-blur-sm">
								<span class="truncate">{resolver.selectedJob || 'Select job'}</span>
							</SelectTrigger>
							<SelectContent class="w-(--bits-select-anchor-width) min-w-0">
								{#each resolver.associatedJobs as j (j)}
									<SelectItem value={j}>
										<span class="block truncate">{j}</span>
									</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					{/if}
					{#if kind !== 'Pod' && resolver.associatedPods.length > 1}
						<Select
							type="single"
							value={resolver.selectedPod}
							onValueChange={(value) => {
								resolver.selectedPod = value;
							}}
						>
							<SelectTrigger class="h-8 w-56 bg-background/90 shadow-sm backdrop-blur-sm">
								<span class="truncate">{resolver.selectedPod || 'Select pod'}</span>
							</SelectTrigger>
							<SelectContent class="w-(--bits-select-anchor-width) min-w-0">
								{#each resolver.associatedPods as p (p)}
									<SelectItem value={p}>
										<span class="block truncate">{p}</span>
									</SelectItem>
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
							<SelectTrigger class="h-8 w-44 bg-background/90 shadow-sm backdrop-blur-sm">
								<span class="truncate">{resolver.selectedContainer || 'Select container'}</span>
							</SelectTrigger>
							<SelectContent class="w-(--bits-select-anchor-width) min-w-0">
								{#each resolver.containers as c (c)}
									<SelectItem value={c}>
										<span class="block truncate">{c}</span>
									</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					{/if}
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
