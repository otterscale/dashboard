<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { PauseIcon, PlayIcon, ScrollTextIcon } from '@lucide/svelte';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import { getContext, tick } from 'svelte';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Toggle } from '$lib/components/ui/toggle';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(RuntimeService, transport);

	// Derived from the raw K8s object
	const namespace: string = $derived(object?.metadata?.namespace ?? '');
	const podName: string = $derived(object?.metadata?.name ?? '');
	const containers: string[] = $derived(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(object?.spec?.containers as any[])?.map((c: any) => c.name as string) ?? []
	);

	let selectedContainer = $state(containers[0] ?? '');
	let follow = $state(true);
	let previous = $state(false);
	let open = $state(false);
	let logLines = $state<string[]>([]);
	let abortController: AbortController | null = null;
	let logContainer = $state<HTMLElement>();

	async function scrollToBottom() {
		await tick();
		if (logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	}

	async function startStreaming() {
		stopStreaming();
		logLines = [];

		abortController = new AbortController();

		try {
			const stream = client.podLog(
				{
					cluster,
					namespace,
					name: podName,
					container: selectedContainer,
					follow,
					previous,
					tailLines: BigInt(200)
				},
				{ signal: abortController.signal }
			);

			for await (const response of stream) {
				if (response.data && response.data.length > 0) {
					const text = new TextDecoder().decode(response.data);
					const lines = text.split('\n').filter((l) => l.length > 0);
					const MAX_LINES = 2000;

					// Use a more performant way to manage array limits
					if (logLines.length + lines.length > MAX_LINES) {
						logLines = [...logLines, ...lines].slice(-MAX_LINES);
					} else {
						logLines = [...logLines, ...lines];
					}
					scrollToBottom();
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

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			startStreaming();
		} else {
			stopStreaming();
		}
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
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
	<Dialog.Content class="flex h-fit max-h-[80vh] max-w-[70vw] min-w-[55vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>Pod Logs — {podName}</Dialog.Title>
			<Dialog.Description
				>Streaming logs from namespace <strong>{namespace}</strong></Dialog.Description
			>
		</Dialog.Header>

		<!-- Controls -->
		<div class="flex items-center gap-2">
			{#if containers.length > 1}
				<Select
					type="single"
					value={selectedContainer}
					onValueChange={(value) => {
						selectedContainer = value;
						if (open) startStreaming();
					}}
				>
					<SelectTrigger class="w-48">
						{selectedContainer || 'Select container'}
					</SelectTrigger>
					<SelectContent>
						{#each containers as c (c)}
							<SelectItem value={c}>{c}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			{:else}
				<span class="text-xs text-muted-foreground">{selectedContainer}</span>
			{/if}
			<Toggle
				size="sm"
				pressed={follow}
				onPressedChange={(v) => {
					follow = v;
					if (open) startStreaming();
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
					if (open) startStreaming();
				}}
				aria-label="Toggle previous container"
			>
				<span class="text-xs">Previous</span>
			</Toggle>
			<div class="ml-auto">
				<Button
					size="sm"
					variant="outline"
					onclick={() => {
						if (open) startStreaming();
					}}
				>
					Refresh
				</Button>
			</div>
		</div>

		<!-- Log output -->
		<div
			bind:this={logContainer}
			class="max-h-[55vh] min-h-[30vh] overflow-auto rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed"
		>
			{#if logLines.length === 0}
				<span class="text-muted-foreground">Waiting for log data...</span>
			{:else}
				{#each logLines as line, i (i)}
					<div class="hover:bg-muted-foreground/10">{line}</div>
				{/each}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
