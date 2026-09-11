<script lang="ts">
	import Bot from '@lucide/svelte/icons/bot';
	import type { NodeProps } from '@xyflow/svelte';
	import { Handle, Position } from '@xyflow/svelte';

	let { data, selected }: NodeProps = $props();

	// Scope breadcrumb: "workspace / namespace" — same format as the pod cards.
	const workspace = $derived(String(data.workspace ?? ''));
	const namespace = $derived(String(data.namespace ?? ''));
	const scopeTitle = $derived(
		[workspace ? `Workspace: ${workspace}` : '', namespace ? `Namespace: ${namespace}` : '']
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div
	class="w-55 rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-primary/10">
			<Bot size={14} class="text-primary" />
		</div>
		<span class="truncate text-sm font-semibold">LLMInferenceService</span>
	</div>
	<div class="space-y-1 px-3 py-2">
		<div class="truncate text-xs font-medium">{data.name}</div>
		{#if workspace || namespace}
			<div class="truncate text-xs text-muted-foreground" title={scopeTitle}>
				{#if workspace}<span class="text-foreground/80">{workspace}</span>
					<span>/</span>
				{/if}{namespace}
			</div>
		{/if}
	</div>
</div>

{#if data.hasSourceEdge}
	<Handle type="source" position={Position.Bottom} class="bg-primary!" />
{/if}
