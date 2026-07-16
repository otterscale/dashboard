<script lang="ts">
	import { type Transport } from '@connectrpc/connect';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ContainerIcon from '@lucide/svelte/icons/container';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import SearchIcon from '@lucide/svelte/icons/search';
	import WrapTextIcon from '@lucide/svelte/icons/wrap-text';
	import XIcon from '@lucide/svelte/icons/x';
	import { getContext, type Snippet } from 'svelte';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Toggle } from '$lib/components/ui/toggle';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import { ACTION_DIALOG_CONTENT_CLASS, ACTION_DIALOG_CONTENT_FULLSCREEN_CLASS } from './constants';
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
	let fullscreen = $state(false);
	let viewer = $state<ReturnType<typeof LogViewer>>();

	const showsPodPicker = $derived(kind !== 'Pod' && resolver.associatedPods.length > 1);

	async function handleOpenChange(isOpen: boolean) {
		if (!isOpen) {
			fullscreen = false;
			return;
		}
		if (kind === 'Pod') return;
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
			<SelectTrigger
				class="h-7 w-fit max-w-56 gap-1 border-none bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent"
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
	{#if showsPodPicker}
		<Select
			type="single"
			value={resolver.selectedPod}
			onValueChange={(value) => (resolver.selectedPod = value)}
		>
			<SelectTrigger
				class="h-7 w-fit max-w-56 gap-1 border-none bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent"
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
{/snippet}

<!-- The toolbar's leading container label doubles as the container picker when the
     pod has more than one container; otherwise it's a plain label. -->
{#snippet containerPicker()}
	{#if resolver.containers.length > 1}
		<Select
			type="single"
			value={resolver.selectedContainer}
			onValueChange={(value) => {
				if (value) resolver.selectedContainer = value;
			}}
		>
			<SelectTrigger
				class="-ml-2 h-7 w-fit max-w-64 gap-1 border-none bg-transparent px-2 text-xs font-medium text-foreground shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent"
			>
				<span class="flex min-w-0 items-center gap-1.5">
					<ContainerIcon class="size-3.5 shrink-0 text-muted-foreground" />
					<span class="truncate">{resolver.selectedContainer || 'Select container'}</span>
					{#if resolver.initContainerNames.has(resolver.selectedContainer)}
						<Badge variant="secondary" class="h-4 shrink-0 px-1.5 py-0 text-[10px] font-normal">
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
								<Badge variant="secondary" class="h-4 shrink-0 px-1.5 py-0 text-[10px] font-normal">
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
	<Dialog.Content
		class={fullscreen ? ACTION_DIALOG_CONTENT_FULLSCREEN_CLASS : ACTION_DIALOG_CONTENT_CLASS}
	>
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
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
									onclick={() => (fullscreen = !fullscreen)}
								>
									{#if fullscreen}
										<MinimizeIcon />
									{:else}
										<MaximizeIcon />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</Tooltip.Content>
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
			containerControl={containerPicker}
			sourceControls={sourcePickers}
		/>
	</Dialog.Content>
</Dialog.Root>
