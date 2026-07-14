<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import { getContext, onDestroy, type Snippet, tick } from 'svelte';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Spinner } from '$lib/components/ui/spinner';
	import { UseClipboard } from '$lib/hooks/use-clipboard.svelte';
	import { cn } from '$lib/utils';

	const MAX_LINES = 1000;

	let {
		cluster,
		namespace,
		podName,
		container,
		active = false,
		sourceControls
	}: {
		cluster: string;
		namespace: string;
		podName: string;
		container: string;
		active: boolean;
		sourceControls?: Snippet;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(RuntimeService, transport);

	let follow = $state(true);
	let previous = $state(false);
	// Reassigned wholesale on every chunk — $state.raw skips deep-proxying 1000 lines.
	let logLines = $state.raw<string[]>([]);
	let droppedLines = $state(0);
	let abortController: AbortController | null = null;
	let logContainer = $state<HTMLElement | undefined>(undefined);
	let showScrollButton = $state(false);
	let downloading = $state(false);
	let wrap = $state(false);
	let filter = $state('');
	let debouncedFilter = $state('');
	let filterTimer: ReturnType<typeof setTimeout> | undefined;

	const clipboard = new UseClipboard({ delay: 1000 });

	onDestroy(() => clearTimeout(filterTimer));

	const entries = $derived(logLines.map((text, i) => ({ text, no: droppedLines + i + 1 })));

	const filteredLines = $derived.by(() => {
		const query = debouncedFilter.trim().toLowerCase();
		if (!query) return entries;
		return entries.filter((entry) => entry.text.toLowerCase().includes(query));
	});

	function highlightSegments(text: string, query: string): { text: string; hit: boolean }[] {
		const trimmed = query.trim();
		if (!trimmed) return [{ text, hit: false }];
		const lower = text.toLowerCase();
		const lowerQuery = trimmed.toLowerCase();
		const parts: { text: string; hit: boolean }[] = [];
		let index = 0;
		while (index < text.length) {
			const hitIndex = lower.indexOf(lowerQuery, index);
			if (hitIndex === -1) {
				parts.push({ text: text.slice(index), hit: false });
				break;
			}
			if (hitIndex > index) parts.push({ text: text.slice(index, hitIndex), hit: false });
			parts.push({ text: text.slice(hitIndex, hitIndex + trimmed.length), hit: true });
			index = hitIndex + trimmed.length;
		}
		return parts;
	}

	const streamParams = $derived({
		name: podName,
		container,
		follow,
		previous
	});

	// Single restart source: reading streamParams registers every stream input as a
	// dependency, so changing pod, container, follow or previous restarts exactly once.
	$effect(() => {
		if (!active) return;
		startStreaming(streamParams);
		return () => stopStreaming();
	});

	function isNearBottom(): boolean {
		if (!logContainer) return true;
		return (
			logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight <
			logContainer.clientHeight / 3
		);
	}

	async function autoScrollToBottom() {
		if (!logContainer) return;
		if (isNearBottom()) {
			await tick();
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	}

	async function scrollToBottom() {
		await tick();
		if (logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
			showScrollButton = false;
		}
	}

	function handleScroll() {
		showScrollButton = !isNearBottom();
	}

	function delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function startStreaming(params: typeof streamParams) {
		stopStreaming();
		logLines = [];
		droppedLines = 0;

		if (!params.name) {
			logLines = ['[Error] No pod name available.'];
			return;
		}

		abortController = new AbortController();

		try {
			const stream = client.podLog(
				{
					cluster,
					namespace,
					name: params.name,
					container: params.container,
					follow: params.follow,
					previous: params.previous,
					tailLines: BigInt(MAX_LINES)
				},
				{ signal: abortController.signal }
			);

			for await (const response of stream) {
				if (response.data && response.data.length > 0) {
					const text = new TextDecoder().decode(response.data);
					const lines = text.split('\n').filter((l) => l.length > 0);

					const newLogLines = [...logLines, ...lines];
					if (newLogLines.length > MAX_LINES) {
						droppedLines += newLogLines.length - MAX_LINES;
					}
					logLines = newLogLines.slice(-MAX_LINES);

					autoScrollToBottom();
					await delay(10);
				}
			}
		} catch (error) {
			if (abortController?.signal.aborted) return;
			logLines = [...logLines, `[Error] Failed to stream logs: ${error}`];
		}
	}

	function stopStreaming() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
	}

	export function restart() {
		if (active) startStreaming(streamParams);
	}

	export function isEmpty() {
		return logLines.length === 0;
	}

	export function isCopied() {
		return clipboard.copied;
	}

	export function isDownloading() {
		return downloading;
	}

	export function canDownload() {
		return !!podName && !downloading;
	}

	export function getFilter() {
		return filter;
	}

	export function setFilter(value: string) {
		filter = value;
		clearTimeout(filterTimer);
		// Clearing should feel instant; only debounce while narrowing.
		if (!value.trim()) {
			debouncedFilter = value;
			return;
		}
		filterTimer = setTimeout(() => (debouncedFilter = value), 150);
	}

	export function isFollowing() {
		return follow;
	}

	export function setFollowing(value: boolean) {
		follow = value;
	}

	export function isPrevious() {
		return previous;
	}

	export function setPrevious(value: boolean) {
		previous = value;
	}

	export function isWrapped() {
		return wrap;
	}

	export function setWrap(value: boolean) {
		wrap = value;
	}

	export async function copyLogs() {
		if (logLines.length === 0) return;
		await clipboard.copy(logLines.join('\n'));
	}

	export async function downloadLogs() {
		if (!podName || downloading) return;
		downloading = true;

		try {
			const chunks: BlobPart[] = [];
			const dlAbort = new AbortController();
			const stream = client.podLog(
				{
					cluster,
					namespace,
					name: podName,
					container,
					follow: false,
					previous
				},
				{ signal: dlAbort.signal }
			);

			for await (const response of stream) {
				if (response.data && response.data.length > 0) {
					chunks.push(new Uint8Array(response.data));
				}
			}

			const blob = new Blob(chunks, { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${podName}_${container}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			logLines = [...logLines, `[Error] Failed to download logs: ${error}`];
		} finally {
			downloading = false;
		}
	}
</script>

<!-- Log output -->
<div class="relative min-h-64 flex-1">
	<div
		bind:this={logContainer}
		onscroll={handleScroll}
		class={cn(
			'absolute inset-0 overflow-auto rounded-md border bg-muted pb-2 font-mono text-xs leading-relaxed',
			// Floating pickers overlay the box's top-right; pad the content clear of them.
			sourceControls ? 'pt-12' : 'pt-2'
		)}
	>
		{#if logLines.length === 0}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Spinner />
					</Empty.Media>
					<Empty.Title>Waiting for logs</Empty.Title>
					<Empty.Description>
						Log data will appear here as soon as the container produces output.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else if filteredLines.length === 0}
			<Empty.Root class="h-full">
				<Empty.Header>
					<Empty.Media variant="icon">
						<SearchIcon />
					</Empty.Media>
					<Empty.Title>No matching lines</Empty.Title>
					<Empty.Description>No log lines match "{debouncedFilter}".</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			{#each filteredLines as entry (entry.no)}
				<div
					class={cn(
						'px-3 hover:bg-muted-foreground/10',
						wrap ? 'break-all whitespace-pre-wrap' : 'w-fit min-w-full whitespace-pre',
						entry.text.startsWith('[Error]') && 'text-destructive'
					)}
				>
					{#if debouncedFilter.trim()}
						{#each highlightSegments(entry.text, debouncedFilter) as segment, i (i)}
							{#if segment.hit}<mark class="rounded-sm bg-primary/25 text-inherit"
									>{segment.text}</mark
								>{:else}{segment.text}{/if}
						{/each}
					{:else}
						{entry.text}
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	{#if sourceControls}
		<!-- Source pickers float over the log's top-right corner; clear of the scrollbar. -->
		<div class="absolute top-2 right-5 flex flex-wrap items-center justify-end gap-2">
			{@render sourceControls()}
		</div>
	{/if}

	{#if showScrollButton}
		<Button
			onclick={() => {
				scrollToBottom();
			}}
			variant="outline"
			size="icon-sm"
			class="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full shadow-md"
			aria-label="Scroll to bottom"
		>
			<ArrowDownIcon />
		</Button>
	{/if}
</div>

<!-- Status bar -->
<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
	<Badge variant="outline" class="gap-1.5 font-normal">
		<span
			class={cn(
				'size-1.5 rounded-full',
				follow && active ? 'animate-pulse bg-primary' : 'bg-muted-foreground'
			)}
		></span>
		{follow ? 'Streaming' : 'Paused'}
	</Badge>
	{#if previous}
		<Badge variant="secondary" class="font-normal">Previous container</Badge>
	{/if}
	<span class="ml-auto">
		{#if debouncedFilter.trim()}
			{filteredLines.length} of {logLines.length} lines
		{:else}
			{logLines.length} lines
		{/if}
		{#if droppedLines > 0}
			· showing last {MAX_LINES}
		{/if}
	</span>
</div>
