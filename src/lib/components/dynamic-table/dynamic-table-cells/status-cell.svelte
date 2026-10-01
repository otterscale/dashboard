<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { type Column, type Row } from '@tanstack/table-core';

	import { StatusBadge } from '$lib/components/custom/status-badge';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { m } from '$lib/messages';
	import { viewMode } from '$lib/stores';

	import { readStatus, type StatusTone } from '../status';

	let {
		row,
		column
	}: {
		row: Row<Record<string, JsonValue>>;
		column: Column<Record<string, JsonValue>>;
	} = $props();

	const TONE_LABELS = {
		healthy: m.status_healthy,
		progressing: m.status_progressing,
		degraded: m.status_degraded,
		failed: m.status_failed,
		stopped: m.status_stopped,
		unknown: m.status_unknown
	} as const satisfies Record<StatusTone, () => string>;

	const data = $derived(row.original[column.id]);
	const raw = $derived(data === null || data === undefined ? '' : String(data));
	const reading = $derived(readStatus(data));

	// Advanced mode keeps the exact value Kubernetes reported; simple mode says what it means
	// and leaves the reported value (`CrashLoopBackOff`, …) in the tooltip.
	// A value with no known meaning is shown as-is rather than as a vague "Unknown".
	const label = $derived.by(() => {
		if ($viewMode === 'advanced' || !raw) return raw || '—';
		if (reading.ratio) return m.status_ready_ratio(reading.ratio);
		if (reading.tone === 'unknown') return raw;
		return TONE_LABELS[reading.tone]();
	});
</script>

<Tooltip.Root>
	<Tooltip.Trigger class="block max-w-full text-left">
		<StatusBadge tone={reading.tone}>{label}</StatusBadge>
	</Tooltip.Trigger>
	{#if raw && raw !== label}
		<Tooltip.Content>{raw}</Tooltip.Content>
	{/if}
</Tooltip.Root>
