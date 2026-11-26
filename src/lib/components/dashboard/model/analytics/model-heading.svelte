<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';

	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { fmtReplicas, type ModelState, modelStatus } from '../overview/lib/models';
	import { quietState, type RankedModel, TONE_TEXT } from './lib/ranking';

	// The picked model: its name, namespace, status (Overview's rules and colours) and engine.
	// A model that is still starting, or has had no request, says why at the end of the line: an
	// info mark and a rule set the note apart from the facts before it.
	let {
		row,
		version,
		versionLoading = false
	}: {
		row: RankedModel;
		/** e.g. "vLLM 0.33.0", read from the engine image. */
		version?: string;
		versionLoading?: boolean;
	} = $props();

	const stateLabel: Record<ModelState, () => string> = {
		starting: m.model_overview_state_starting,
		queueing: m.model_overview_state_queueing,
		idle: m.model_overview_state_idle,
		serving: m.model_overview_state_serving
	};
	const status = $derived(modelStatus(row));
	const quiet = $derived(quietState(row));
</script>

<div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 pt-3">
	<h2 class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
		<span class="min-w-0 truncate font-mono text-xl leading-7 tracking-tight">
			{row.name}
		</span>
		<span class="rounded-full bg-muted px-2 py-0.5 text-xs leading-4 text-muted-foreground">
			{row.namespace}
		</span>
		<span class={cn('text-[0.8125rem] font-medium', TONE_TEXT[status.tone])}>
			{stateLabel[status.state]()}
			{#if row.desired !== undefined}
				<span class="tabular-nums">· {fmtReplicas(row)}</span>
			{/if}
		</span>
		{#if version}
			<span class="text-xs text-muted-foreground">{version}</span>
		{:else if versionLoading}
			<Skeleton class="h-3 w-20" />
		{/if}
	</h2>
	{#if quiet}
		<p
			class="flex min-w-0 items-start gap-1.5 text-xs leading-4 text-muted-foreground @2xl:border-l @2xl:pl-2.5"
			role="status"
		>
			<InfoIcon class="size-3.5 shrink-0" aria-hidden="true" />
			<span>
				{quiet === 'starting' ? m.model_analytics_note_starting() : m.model_analytics_note_idle()}
			</span>
		</p>
	{/if}
</div>
