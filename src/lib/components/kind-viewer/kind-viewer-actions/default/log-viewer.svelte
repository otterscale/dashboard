<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import { getContext, type Snippet, tick } from 'svelte';

	import Button from '$lib/components/ui/button/button.svelte';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Toggle } from '$lib/components/ui/toggle';

	const MAX_LINES = 1000;

	let {
		cluster,
		namespace,
		podName,
		containers,
		active = false,
		extraControls
	}: {
		cluster: string;
		namespace: string;
		podName: string;
		containers: string[];
		active: boolean;
		extraControls?: Snippet<[{ restart: () => void }]>;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(RuntimeService, transport);

	let overriddenContainer = $state<string | null>(null);
	const effectiveContainer = $derived(overriddenContainer ?? containers[0] ?? '');

	let follow = $state(true);
	let previous = $state(false);
	let logLines = $state<string[]>([]);
	let abortController: AbortController | null = null;
	let logContainer = $state<HTMLElement | undefined>(undefined);
	let showScrollButton = $state(false);
	let showAllData = $state(false);

	$effect(() => {
		if (active) {
			startStreaming();
		}

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

	async function startStreaming() {
		stopStreaming();
		logLines = [];

		if (!podName) {
			logLines = ['[Error] No pod name available.'];
			return;
		}

		abortController = new AbortController();

		try {
			const stream = client.podLog(
				{
					cluster,
					namespace,
					name: podName,
					container: effectiveContainer,
					follow,
					previous,
					...(showAllData ? {} : { tailLines: BigInt(MAX_LINES) })
				},
				{ signal: abortController.signal }
			);

			for await (const response of stream) {
				if (response.data && response.data.length > 0) {
					const text = new TextDecoder().decode(response.data);
					const lines = text.split('\n').filter((l) => l.length > 0);

					const newLogLines = [...logLines, ...lines];
					logLines = showAllData ? newLogLines : newLogLines.slice(-MAX_LINES);

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
</script>

<!-- Controls -->
<div class="flex flex-wrap items-center gap-2">
	{#if extraControls}
		{@render extraControls({ restart: startStreaming })}
	{/if}
	{#if containers.length > 1}
		<Select
			type="single"
			value={effectiveContainer}
			onValueChange={(value) => {
				overriddenContainer = value;
				if (active) startStreaming();
			}}
		>
			<SelectTrigger class="w-48 max-w-64 min-w-0">
				<span class="truncate">{effectiveContainer || 'Select container'}</span>
			</SelectTrigger>
			<SelectContent class="w-48 max-w-64">
				{#each containers as c (c)}
					<SelectItem value={c}>{c}</SelectItem>
				{/each}
			</SelectContent>
		</Select>
	{/if}
	<Toggle
		size="sm"
		pressed={follow}
		onPressedChange={(v) => {
			follow = v;
			if (active) startStreaming();
		}}
		aria-label="Toggle follow"
	>
		{#if follow}
			<PauseIcon size={14} />
		{:else}
			<PlayIcon size={14} />
		{/if}
		<span class="text-xs">{follow ? 'Following' : 'Paused'}</span>
	</Toggle>
	<Toggle
		size="sm"
		pressed={previous}
		onPressedChange={(v) => {
			previous = v;
			if (active) startStreaming();
		}}
		aria-label="Toggle previous container"
	>
		<span class="text-xs">Previous</span>
	</Toggle>
	<Toggle
		size="sm"
		pressed={showAllData}
		onPressedChange={(v) => {
			showAllData = v;
			if (active) startStreaming();
		}}
		aria-label="Toggle all data"
	>
		<span class="text-xs">All</span>
	</Toggle>
	<div class="ml-auto">
		<Button
			size="sm"
			variant="outline"
			onclick={() => {
				if (active) startStreaming();
			}}
		>
			Refresh
		</Button>
	</div>
</div>

<!-- Log output -->
<div class="relative">
	<div
		bind:this={logContainer}
		onscroll={handleScroll}
		class="h-[55vh] overflow-auto rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed"
	>
		{#if logLines.length === 0}
			<span class="text-muted-foreground">Waiting for log data...</span>
		{:else}
			{#each logLines as line, i (i)}
				<div class="hover:bg-muted-foreground/10">{line}</div>
			{/each}
		{/if}
	</div>

	{#if showScrollButton}
		<Button
			onclick={() => {
				scrollToBottom();
			}}
			variant="outline"
			size="icon-sm"
			class="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 transform rounded-full shadow-md"
		>
			<ArrowDownIcon size={14} />
		</Button>
	{/if}
</div>
