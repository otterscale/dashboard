<script lang="ts">
	import { type Transport } from '@connectrpc/connect';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import SearchIcon from '@lucide/svelte/icons/search';
	import WrapTextIcon from '@lucide/svelte/icons/wrap-text';
	import XIcon from '@lucide/svelte/icons/x';
	import { getContext, type Snippet } from 'svelte';

	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Toggle } from '$lib/components/ui/toggle';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import { ACTION_DIALOG_CONTENT_CLASS } from './constants';
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
	let viewer = $state<ReturnType<typeof LogViewer>>();

	const showsPodPicker = $derived(kind !== 'Pod' && resolver.associatedPods.length > 1);
	const hasPickers = $derived(
		(kind === 'CronJob' && resolver.associatedJobs.length > 0) ||
			showsPodPicker ||
			resolver.containers.length > 1
	);

	async function handleOpenChange(isOpen: boolean) {
		if (!isOpen || kind === 'Pod') return;
		await resolver.resolve();
	}
</script>

{#snippet sourcePickers()}
	{#if kind === 'CronJob' && resolver.associatedJobs.length > 0}
		<Select
			type="single"
			value={resolver.selectedJob}
			onValueChange={(value) => resolver.handleJobChange(value)}
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
	{#if showsPodPicker}
		<Select
			type="single"
			value={resolver.selectedPod}
			onValueChange={(value) => (resolver.selectedPod = value)}
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
{/snippet}

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
	<Dialog.Content class={ACTION_DIALOG_CONTENT_CLASS}>
		<Dialog.Header>
			<div class="flex items-end justify-between gap-4">
				<div class="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
					<Dialog.Title class="truncate text-lg font-bold">
						Pod Logs — {resolver.effectivePodName || resolver.name}
					</Dialog.Title>
					<Dialog.Description class="truncate">
						Streaming logs from namespace <strong>{resolver.namespace}</strong>
					</Dialog.Description>
				</div>
				<!-- -mr-2 lines the icon column up with the dialog's close button (right-4 vs p-6). -->
				<div class="-mr-2 flex shrink-0 items-center gap-1">
					<InputGroup.Root class="h-8 w-48">
						<InputGroup.Addon>
							<SearchIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							placeholder="Filter lines..."
							bind:value={() => viewer?.getFilter() ?? '', (v) => viewer?.setFilter(v ?? '')}
						/>
						{#if viewer?.getFilter()}
							<InputGroup.Addon align="inline-end">
								<InputGroup.Button
									size="icon-xs"
									aria-label="Clear filter"
									onclick={() => viewer?.setFilter('')}
								>
									<XIcon />
								</InputGroup.Button>
							</InputGroup.Addon>
						{/if}
					</InputGroup.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Toggle
									{...props}
									size="sm"
									class="size-8 p-0"
									pressed={viewer?.isFollowing() ?? true}
									onPressedChange={(v) => viewer?.setFollowing(v)}
									aria-label="Toggle follow"
								>
									{#if viewer?.isFollowing() ?? true}
										<PauseIcon />
									{:else}
										<PlayIcon />
									{/if}
								</Toggle>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>
							{(viewer?.isFollowing() ?? true) ? 'Pause streaming' : 'Resume streaming'}
						</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Toggle
									{...props}
									size="sm"
									class="size-8 p-0"
									pressed={viewer?.isPrevious() ?? false}
									onPressedChange={(v) => viewer?.setPrevious(v)}
									aria-label="Toggle previous container"
								>
									<HistoryIcon />
								</Toggle>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Show logs from the previous container instance</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Toggle
									{...props}
									size="sm"
									class="size-8 p-0"
									pressed={viewer?.isWrapped() ?? false}
									onPressedChange={(v) => viewer?.setWrap(v)}
									aria-label="Toggle line wrap"
								>
									<WrapTextIcon />
								</Toggle>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Wrap long lines</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									disabled={!viewer || viewer.isEmpty()}
									onclick={() => viewer?.copyLogs()}
									aria-label="Copy logs"
								>
									{#if viewer?.isCopied()}
										<CheckIcon />
									{:else}
										<CopyIcon />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>
							{viewer?.isCopied() ? 'Copied!' : 'Copy logs to clipboard'}
						</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									disabled={!viewer || !viewer.canDownload()}
									onclick={() => viewer?.downloadLogs()}
									aria-label="Download logs"
								>
									{#if viewer?.isDownloading()}
										<Spinner />
									{:else}
										<DownloadIcon />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Download full log file</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									disabled={!viewer}
									onclick={() => viewer?.restart()}
									aria-label="Refresh logs"
								>
									<RotateCwIcon />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Restart the log stream</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</div>
		</Dialog.Header>
		<LogViewer
			bind:this={viewer}
			{cluster}
			namespace={resolver.namespace}
			podName={resolver.effectivePodName}
			container={resolver.selectedContainer}
			active={open}
			sourceControls={hasPickers ? sourcePickers : undefined}
		/>
	</Dialog.Content>
</Dialog.Root>
