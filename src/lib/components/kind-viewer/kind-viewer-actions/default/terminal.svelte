<script lang="ts">
	import { type Transport } from '@connectrpc/connect';
	import ContainerIcon from '@lucide/svelte/icons/container';
	import TerminalSquareIcon from '@lucide/svelte/icons/terminal-square';
	import { getContext, type Snippet } from 'svelte';

	import { Terminal } from '$lib/components/applications/terminal';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

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

		<div class="flex h-[55vh] flex-col overflow-hidden rounded-md border">
			<!-- In-frame toolbar, same layout as the log viewer: sources on the left.
			     Fixed h-10 keeps the height identical with or without pickers. -->
			<div
				class="flex h-10 shrink-0 items-center justify-between gap-4 border-b bg-background/50 px-3 text-xs text-muted-foreground"
			>
				<div class="flex min-w-0 flex-wrap items-center gap-1">
					{#if resolver.containers.length > 1}
						<Select
							type="single"
							value={resolver.selectedContainer}
							onValueChange={(value) => {
								if (value) resolver.selectedContainer = value;
							}}
						>
							<SelectTrigger
								class="-ml-2 h-7! w-fit max-w-64 gap-1 border-none bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent"
							>
								<span class="flex min-w-0 items-center gap-1.5">
									<ContainerIcon class="size-3.5 shrink-0 text-muted-foreground" />
									<span class="truncate">{resolver.selectedContainer || 'Select container'}</span>
									{#if resolver.initContainerNames.has(resolver.selectedContainer)}
										<Badge
											variant="secondary"
											class="h-4 shrink-0 px-1.5 py-0 text-[10px] font-normal"
										>
											Init
										</Badge>
									{/if}
								</span>
							</SelectTrigger>
							<SelectContent align="start" class="max-w-72 min-w-(--bits-select-anchor-width)">
								{#each resolver.containers as c (c)}
									<SelectItem value={c}>
										<span class="flex min-w-0 items-center gap-1.5">
											<span class="truncate">{c}</span>
											{#if resolver.initContainerNames.has(c)}
												<Badge
													variant="secondary"
													class="h-4 shrink-0 px-1.5 py-0 text-[10px] font-normal"
												>
													Init
												</Badge>
											{/if}
										</span>
									</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					{:else}
						<span class="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
							<ContainerIcon class="size-3.5 shrink-0 text-muted-foreground" />
							<span class="truncate">{resolver.selectedContainer}</span>
						</span>
					{/if}
					{#if kind === 'CronJob' && resolver.associatedJobs.length > 0}
						<Select
							type="single"
							value={resolver.selectedJob}
							onValueChange={async (value) => {
								await resolver.handleJobChange(value);
							}}
						>
							<SelectTrigger
								class="h-7! w-fit max-w-56 gap-1 border-none bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent"
							>
								<span class="truncate">{resolver.selectedJob || 'Select job'}</span>
							</SelectTrigger>
							<SelectContent align="start" class="max-w-72 min-w-(--bits-select-anchor-width)">
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
							<SelectTrigger
								class="h-7! w-fit max-w-56 gap-1 border-none bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent"
							>
								<span class="truncate">{resolver.selectedPod || 'Select pod'}</span>
							</SelectTrigger>
							<SelectContent align="start" class="max-w-72 min-w-(--bits-select-anchor-width)">
								{#each resolver.associatedPods as p (p)}
									<SelectItem value={p}>
										<span class="block truncate">{p}</span>
									</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					{/if}
				</div>
			</div>

			<div class="min-h-0 flex-1 bg-[#1e1e1e] p-3">
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
		</div>
	</Dialog.Content>
</Dialog.Root>
