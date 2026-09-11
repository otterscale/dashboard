<script lang="ts">
	import { timestampFromDate } from '@bufbuild/protobuf/wkt';
	import { createClient, type Transport } from '@connectrpc/connect';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ContainerIcon from '@lucide/svelte/icons/container';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UnplugIcon from '@lucide/svelte/icons/unplug';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import { getContext, onDestroy, type Snippet, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Separator } from '$lib/components/ui/separator';
	import { Spinner } from '$lib/components/ui/spinner';
	import { UseClipboard } from '$lib/hooks/use-clipboard.svelte';
	import { cn } from '$lib/utils';

	const MAX_LINES = 1000;
	const decoder = new TextDecoder();

	// streaming: following live output. paused: stopped by the user, screen kept.
	// disconnected: stopped by the server or an error, screen kept.
	type StreamStatus = 'streaming' | 'paused' | 'disconnected';

	let {
		cluster,
		namespace,
		podName,
		container,
		active = false,
		containerControl,
		sourceControls
	}: {
		cluster: string;
		namespace: string;
		podName: string;
		container: string;
		active: boolean;
		containerControl?: Snippet;
		sourceControls?: Snippet;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(RuntimeService, transport);

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
	let streamStatus = $state<StreamStatus>('streaming');
	// Why the stream stopped; shown in the status area, never in the log itself
	// so copied output stays clean.
	let streamError = $state('');
	// Wall-clock time of the last log chunk; resuming continues from here.
	let lastDataAt: Date | undefined;
	// Line number → label. A divider is drawn after that line to mark where the
	// stream was resumed, since output around it may be missing or repeated.
	const resumeMarkers = new SvelteMap<number, string>();

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
		previous
	});

	// Single restart source: reading streamParams registers every stream input as a
	// dependency, so changing pod, container or previous restarts exactly once.
	// Switching source always starts streaming, even from paused.
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

	/** Fresh start: clears the screen and fetches the tail. */
	function startStreaming(params: typeof streamParams) {
		stopStreaming();
		logLines = [];
		droppedLines = 0;
		lastDataAt = undefined;
		resumeMarkers.clear();
		openStream(params);
	}

	/**
	 * Keeps the screen and continues from the last line seen. This is also how
	 * a disconnected stream is reopened.
	 */
	function resumeStreaming() {
		stopStreaming();
		markResumed();
		// sinceTime has second precision, so a line from the same second as the
		// last one seen may appear twice after a resume. tailLines is kept as a
		// cap so resuming after a long pause cannot flood the buffer.
		openStream(streamParams, lastDataAt);
	}

	function stopStreaming() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
	}

	async function openStream(params: typeof streamParams, since?: Date) {
		if (!params.name) {
			streamStatus = 'disconnected';
			streamError = 'No pod name available.';
			return;
		}

		const controller = new AbortController();
		abortController = controller;
		streamStatus = 'streaming';
		streamError = '';

		try {
			const stream = client.podLog(
				{
					cluster,
					namespace,
					name: params.name,
					container: params.container,
					follow: true,
					previous: params.previous,
					tailLines: BigInt(MAX_LINES),
					...(since ? { sinceTime: timestampFromDate(since) } : {})
				},
				{ signal: controller.signal }
			);

			for await (const response of stream) {
				if (controller.signal.aborted) return;
				if (response.data && response.data.length > 0) {
					lastDataAt = new Date();
					appendLines(decoder.decode(response.data));
					autoScrollToBottom();
					await delay(10);
				}
			}
		} catch (error) {
			// The server closes every stream after a few minutes, like it does for
			// the terminal. There is no automatic reconnect; the user resumes.
			if (controller.signal.aborted) return;
			streamStatus = 'disconnected';
			streamError = `${error}`;
			return;
		}

		// A clean end while following means kubelet closed the stream: the
		// container exited or restarted. Retrying blindly would just loop, so
		// leave it to the user to resume once the container is back.
		if (controller.signal.aborted) return;
		streamStatus = 'disconnected';
		streamError = 'Log stream ended. The container may have stopped.';
	}

	function markResumed() {
		const afterLine = droppedLines + logLines.length;
		if (afterLine === 0) return;
		const label = streamStatus === 'paused' ? 'resumed' : 'reconnected';
		resumeMarkers.set(afterLine, `${label} ${new Date().toLocaleTimeString()}`);
	}

	function appendLines(text: string) {
		const lines = text.split('\n').filter((l) => l.length > 0);
		const newLogLines = [...logLines, ...lines];
		if (newLogLines.length > MAX_LINES) {
			droppedLines += newLogLines.length - MAX_LINES;
		}
		logLines = newLogLines.slice(-MAX_LINES);
	}

	/** Start over: clears the screen and fetches the tail again. */
	export function restart() {
		if (active) startStreaming(streamParams);
	}

	export function getStreamStatus(): StreamStatus {
		return streamStatus;
	}

	export function getStreamError() {
		return streamError;
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

	/** Pause keeps the screen and closes the stream; resume continues from the last line seen. */
	export function setFollowing(value: boolean) {
		if (!active) return;
		if (value) {
			resumeStreaming();
			return;
		}
		stopStreaming();
		streamStatus = 'paused';
		streamError = '';
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
	<div class="absolute inset-0 flex flex-col overflow-hidden rounded-md border bg-muted">
		<!-- In-frame toolbar: source info on the left, pickers on the right. The scroll
		     area starts below it, so log lines never pass beneath the pickers. -->
		<!-- Fixed h-10 keeps the toolbar the same height with or without pickers. -->
		<div
			class="flex h-10 shrink-0 items-center justify-between gap-4 border-b bg-background/50 px-3 text-xs text-muted-foreground"
		>
			<!-- Left: what's being viewed (container + job/pod pickers). -->
			<div class="flex min-w-0 flex-wrap items-center gap-1">
				{#if containerControl}
					{@render containerControl()}
				{:else}
					<span class="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
						<ContainerIcon class="size-3.5 shrink-0 text-muted-foreground" />
						<span class="truncate">{container}</span>
					</span>
				{/if}
				{#if sourceControls}
					{@render sourceControls()}
				{/if}
			</div>
			<!-- Right: stream status. -->
			<div class="flex shrink-0 items-center gap-2">
				{#if previous}
					<Badge variant="secondary" class="shrink-0 font-normal">Previous container</Badge>
				{/if}
				<span
					class={cn(
						'flex shrink-0 items-center gap-1.5',
						streamStatus === 'disconnected' && 'text-destructive'
					)}
					title={streamError || undefined}
				>
					<span
						class={cn(
							'size-1.5 rounded-full',
							streamStatus === 'streaming' && active
								? 'animate-pulse bg-primary'
								: streamStatus === 'disconnected'
									? 'bg-destructive'
									: 'bg-muted-foreground'
						)}
					></span>
					{streamStatus === 'streaming'
						? 'Streaming'
						: streamStatus === 'paused'
							? 'Paused'
							: 'Disconnected'}
				</span>
				<span aria-hidden="true">·</span>
				<span class="shrink-0">
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
		</div>
		<div
			bind:this={logContainer}
			onscroll={handleScroll}
			class="flex-1 overflow-auto py-2 font-mono text-xs leading-relaxed"
		>
			{#if logLines.length === 0}
				<Empty.Root class="h-full">
					<Empty.Header>
						{#if streamStatus === 'disconnected'}
							<Empty.Media variant="icon">
								<UnplugIcon />
							</Empty.Media>
							<Empty.Title>Log stream disconnected</Empty.Title>
							<Empty.Description>{streamError}</Empty.Description>
						{:else if streamStatus === 'paused'}
							<Empty.Media variant="icon">
								<PauseIcon />
							</Empty.Media>
							<Empty.Title>Streaming paused</Empty.Title>
							<Empty.Description>Resume streaming to receive log output.</Empty.Description>
						{:else}
							<Empty.Media variant="icon">
								<Spinner />
							</Empty.Media>
							<Empty.Title>Waiting for logs</Empty.Title>
							<Empty.Description>
								Log data will appear here as soon as the container produces output.
							</Empty.Description>
						{/if}
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
					{#if resumeMarkers.has(entry.no)}
						<div
							class="my-1 flex items-center gap-2 px-3 text-[10px] text-muted-foreground select-none"
							role="separator"
						>
							<Separator decorative class="flex-1" />
							{resumeMarkers.get(entry.no)}
							<Separator decorative class="flex-1" />
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	</div>

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
