<script lang="ts">
	import { durationFromMs } from '@bufbuild/protobuf/wkt';
	import { createClient, type Transport } from '@connectrpc/connect';
	import Icon from '@iconify/svelte';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	import type {
		Application_Container,
		Application_Pod
	} from '$lib/api/application/v1/application_pb';
	import { ApplicationService } from '$lib/api/application/v1/application_pb';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Select from '$lib/components/ui/select';
	import * as Sheet from '$lib/components/ui/sheet';
	import { m } from '$lib/paraglide/messages';

	let {
		pod,
		scope,
		namespace,
		containers,
		closeActions
	}: {
		pod: Application_Pod;
		scope: string;
		namespace: string;
		containers: Application_Container[];
		closeActions: () => void;
	} = $props();

	const msToString = (ms: number): string => String(ms);
	const MINUTE = 60 * 1000;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	const durations = [
		{ label: 'All', value: msToString(0) },
		{ label: '5m', value: msToString(5 * MINUTE) },
		{ label: '15m', value: msToString(15 * MINUTE) },
		{ label: '30m', value: msToString(30 * MINUTE) },
		{ label: '1h', value: msToString(1 * HOUR) },
		{ label: '3h', value: msToString(3 * HOUR) },
		{ label: '6h', value: msToString(6 * HOUR) },
		{ label: '12h', value: msToString(12 * HOUR) },
		{ label: '1d', value: msToString(1 * DAY) },
		{ label: '3d', value: msToString(3 * DAY) },
		{ label: '7d', value: msToString(7 * DAY) }
	];

	const transport: Transport = getContext('transport');
	const client = createClient(ApplicationService, transport);

	let controller: AbortController;
	let triggerContent = $state('');
	let selectedContainer = $state(containers[0]?.containerName ?? '');
	let messages = $state<{ message: string; phase: string }[]>([]);
	let terminal = $state<HTMLDivElement>();

	async function watchLogs(duration: string, containerName: string = selectedContainer) {
		try {
			controller = new AbortController();
			const signal = controller.signal;

			triggerContent = durations.find((d) => d.value === duration)?.label || 'Select a duration';

			const stream = client.watchLogs(
				{
					scope,
					namespace,
					podName: pod.name,
					containerName,
					duration: durationFromMs(+duration)
				},
				{
					signal: signal
				}
			);
			for await (const response of stream) {
				if (signal.aborted) {
					break;
				}
				messages = [...messages, { message: response.log, phase: 'LOG' }];

				autoScrollToBottom();

				// Add delay for better UX
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		} catch (error) {
			// Ignore abort-related errors
			const isAbortError =
				error instanceof Error &&
				(error.name === 'AbortError' ||
					error.message.includes('aborted') ||
					error.message.includes('canceled'));

			if (!isAbortError) {
				console.error('Error watching logs:', error);
			}
		}
	}

	function autoScrollToBottom() {
		if (!terminal) return;

		if (
			terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight <
			terminal.clientHeight / 3
		) {
			scrollToBottom();
		}
	}
	function scrollToBottom() {
		if (!terminal) return;

		terminal.scrollTop = terminal.scrollHeight;
	}

	function stopWatching() {
		messages = [];
		if (!controller.signal.aborted) {
			controller.abort();
		}
	}

	let currentDuration = $state(msToString(5 * MINUTE));

	function handleDurationChange(newValue: string) {
		currentDuration = newValue;
		stopWatching();
		watchLogs(newValue);
	}

	function handleContainerChange(newValue: string) {
		selectedContainer = newValue;
		stopWatching();
		watchLogs(currentDuration, newValue);
	}

	onMount(() => {
		watchLogs(currentDuration); // Default to 5 minutes
	});

	onDestroy(() => {
		stopWatching();
	});
</script>

<Sheet.Root
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			closeActions();
		}
	}}
>
	<Sheet.Trigger>
		<span class="flex items-center gap-1">
			<Icon icon="ph:file-text" />
			{m.log()}
		</span>
	</Sheet.Trigger>

	<Sheet.Content class="rounded-l-lg border-none bg-transparent sm:max-w-9/10">
		<div
			class="dark relative size-full flex-col rounded-l-lg border border-border bg-secondary font-mono text-sm text-card-foreground shadow-sm"
		>
			<!-- Header with time selector -->
			<div class="flex h-12 items-center justify-between border-b border-border p-4">
				<h3 class="text-lg font-semibold">{m.log()}</h3>
				<div class="mr-8 flex items-center gap-2">
					<Select.Root
						type="single"
						value={selectedContainer}
						onValueChange={handleContainerChange}
					>
						<Select.Trigger class="w-48">
							{selectedContainer || 'Container'}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Label>Container</Select.Label>
								{#each containers as container (container.containerName)}
									<Select.Item value={container.containerName}>
										{container.containerName}
									</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
					<Select.Root type="single" value={currentDuration} onValueChange={handleDurationChange}>
						<Select.Trigger class="w-20">
							{triggerContent}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Label>Duration</Select.Label>
								{#each durations as duration (duration.value)}
									<Select.Item value={duration.value}>
										{duration.label}
									</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<div bind:this={terminal} class="max-h-[calc(95vh-48px)] flex-col overflow-auto p-4">
				{#each messages as msg, i (i)}
					{@const isLastMessage = messages.length === i + 1}
					{@const textClass = isLastMessage ? '' : 'text-green-500'}

					{#if msg.message}
						<span class="block" transition:fly={{ y: -5, duration: 500 }}>
							<span class="flex space-x-1 {textClass}">
								<span>[{msg.phase}] {msg.message}</span>
							</span>
						</span>
					{/if}
				{/each}
			</div>
			<Button
				onclick={() => {
					scrollToBottom();
				}}
				variant="outline"
				size="icon-sm"
				class="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 transform rounded-full shadow-md"
			>
				<ArrowDownIcon class="size-3" />
			</Button>
		</div>
	</Sheet.Content>
</Sheet.Root>
