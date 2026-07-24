<script lang="ts">
	import Box from '@lucide/svelte/icons/box';
	import type { NodeProps } from '@xyflow/svelte';
	import { Handle, Position } from '@xyflow/svelte';

	import { formatMemory } from '../format';

	let { data, selected }: NodeProps = $props();

	// Healthy end/steady states.
	const OK_STATUSES = new Set(['Running', 'Succeeded', 'Completed']);
	// Substrings that mark a genuinely failed/erroring container.
	const ERROR_HINTS = [
		'Error',
		'Failed',
		'CrashLoopBackOff',
		'ImagePullBackOff',
		'ErrImagePull',
		'InvalidImageName',
		'CreateContainerConfigError',
		'CreateContainerError',
		'OOMKilled',
		'Evicted',
		'DeadlineExceeded',
		'ExitCode:',
		'Signal:'
	];

	// Everything else (Pending, ContainerCreating, PodInitializing, Init:*,
	// Terminating, NotReady) is a transitional state -> amber, never green.
	function statusColorOf(status: string): string {
		if (OK_STATUSES.has(status)) return 'bg-green-500';
		if (status === 'Unknown') return 'bg-muted-foreground';
		if (ERROR_HINTS.some((hint) => status.includes(hint))) return 'bg-red-500';
		return 'bg-yellow-500';
	}

	const statusColor = $derived(statusColorOf(String(data.status ?? 'Unknown')));

	const roleLabelMap: Record<string, string> = {
		decode: 'Decode',
		prefill: 'Prefill',
		both: 'Decode + Prefill'
	};

	const roleLabel = $derived(
		typeof data.role === 'string' && data.role.length > 0
			? (roleLabelMap[data.role] ?? data.role)
			: ''
	);

	const gpuCount = $derived(Number(data.gpuCount ?? 0));
	const usedMem = $derived(Number(data.usedMem ?? 0));
	const isMig = $derived(Boolean(data.isMig));
</script>

{#if data.hasTargetEdge}
	<Handle type="target" position={Position.Top} class="bg-chart-2!" />
{/if}

<div
	class="w-64 rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-chart-2/10">
			<Box size={14} class="text-chart-2" />
		</div>
		<span class="shrink-0 text-sm font-semibold">Pod</span>
		{#if roleLabel}
			<span
				class="ml-auto rounded-full bg-chart-2/10 px-2 py-0.5 text-[10px] font-medium text-chart-2"
			>
				{roleLabel}
			</span>
		{/if}
		{#if isMig}
			<span
				class="{roleLabel
					? ''
					: 'ml-auto'} rounded-sm bg-chart-3/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-3"
				title="This pod runs on a MIG partition"
			>
				MIG
			</span>
		{/if}
		<span
			class="inline-block size-2 shrink-0 rounded-full {statusColor} {roleLabel || isMig
				? ''
				: 'ml-auto'}"
			title={String(data.status ?? 'Unknown')}
		></span>
	</div>
	<div class="space-y-1.5 px-3 py-2">
		<div class="truncate text-xs font-medium" title={String(data.name ?? '')}>{data.name}</div>
		{#if data.namespace}
			<div class="truncate text-[11px] text-muted-foreground" title={String(data.namespace)}>
				ns: {data.namespace}
			</div>
		{/if}
		<div class="flex flex-wrap items-center gap-1 pt-0.5">
			<span class="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
				{gpuCount} GPU{gpuCount !== 1 ? 's' : ''}
			</span>
			{#if usedMem > 0}
				<span class="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
					{formatMemory(usedMem)}
				</span>
			{/if}
		</div>
	</div>
</div>

{#if data.hasSourceEdge}
	<Handle type="source" position={Position.Bottom} class="bg-chart-2!" />
{/if}
