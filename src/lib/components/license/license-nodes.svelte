<script lang="ts">
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import XCircleIcon from '@lucide/svelte/icons/circle-x';
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { m } from '$lib/paraglide/messages';

	import type { GpuQuotaStatus, NodeAuthorization } from './types';

	let {
		currentNodes,
		lastAcceptedNodes,
		maxNodes,
		nodeAuthorizations,
		gpuQuota,
		overrideRejected,
		selectionMode,
		onSave
	}: {
		currentNodes: string[];
		lastAcceptedNodes: string[];
		maxNodes: number;
		nodeAuthorizations: NodeAuthorization[];
		gpuQuota: GpuQuotaStatus[];
		overrideRejected: boolean;
		selectionMode: string;
		onSave: (nodes: string[]) => Promise<void>;
	} = $props();

	// ── State ──────────────────────────────────────────────────────────────────
	// Initialise from spec.authorizedNodes if set, otherwise pre-tick currently authorized nodes
	const selected = new SvelteSet<string>(
		untrack(() =>
			currentNodes.length > 0
				? currentNodes
				: nodeAuthorizations.filter((n) => n.authorized).map((n) => n.name)
		)
	);
	let isSaving = $state(false);

	// ── Derived quota counters ─────────────────────────────────────────────────
	const selectedNodes = $derived(nodeAuthorizations.filter((n) => selected.has(n.name)));

	function computeGpuByModel(): SvelteMap<string, number> {
		const map = new SvelteMap<string, number>();
		for (const node of selectedNodes) {
			for (const gpu of node.gpus ?? []) {
				const key = gpu.modelID ?? gpu.pciDeviceID;
				map.set(key, (map.get(key) ?? 0) + gpu.count);
			}
		}
		return map;
	}

	const selectedGpuByModel = $derived(computeGpuByModel());
	const nodeCountOK = $derived(maxNodes === 0 || selected.size <= maxNodes);
	const gpuCountOK = $derived(
		gpuQuota.every((q) => (selectedGpuByModel.get(q.modelID) ?? 0) <= q.maxCards)
	);
	const quotaOK = $derived(nodeCountOK && gpuCountOK);

	// ── Helpers ────────────────────────────────────────────────────────────────
	function toggleNode(name: string, checked: boolean) {
		if (checked) selected.add(name);
		else selected.delete(name);
	}

	function gpuSummary(node: NodeAuthorization): string {
		if (!node.gpus || node.gpus.length === 0) return '—';
		return node.gpus.map((g) => `${g.modelID} ×${g.count}`).join(', ');
	}

	async function handleSave() {
		isSaving = true;
		try {
			await toast.promise(onSave([...selected]), {
				loading: m.license_adjust_nodes_saving(),
				success: m.license_adjust_nodes_save_success(),
				error: (err) =>
					m.license_adjust_nodes_save_error({ message: (err as Error)?.message ?? String(err) })
			});
		} finally {
			isSaving = false;
		}
	}

	async function handleClear() {
		isSaving = true;
		try {
			await toast.promise(onSave([]), {
				loading: m.license_adjust_nodes_clearing(),
				success: m.license_adjust_nodes_clear_success(),
				error: (err) =>
					m.license_adjust_nodes_save_error({ message: (err as Error)?.message ?? String(err) })
			});
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="space-y-4 pt-2">
	<!-- ── Quota summary bar ─────────────────────────────────────────────────── -->
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<!-- Node count -->
		<div
			class="flex items-center justify-between rounded-lg border px-4 py-3 {nodeCountOK
				? 'border-border bg-muted/30'
				: 'border-destructive/50 bg-destructive/5'}"
		>
			<div>
				<p class="text-xs font-medium text-muted-foreground">
					{m.license_adjust_nodes_quota_nodes()}
				</p>
				<p class="text-2xl font-bold {nodeCountOK ? '' : 'text-destructive'}">
					{selected.size}
					<span class="text-sm font-normal text-muted-foreground">/ {maxNodes}</span>
				</p>
			</div>
			{#if nodeCountOK}
				<CheckCircleIcon class="h-5 w-5 text-green-600 dark:text-green-400" />
			{:else}
				<XCircleIcon class="h-5 w-5 text-destructive" />
			{/if}
		</div>

		<!-- GPU quota per model -->
		<div
			class="rounded-lg border px-4 py-3 {gpuCountOK
				? 'border-border bg-muted/30'
				: 'border-destructive/50 bg-destructive/5'}"
		>
			<div class="flex items-center justify-between">
				<p class="text-xs font-medium text-muted-foreground">
					{m.license_adjust_nodes_quota_gpu()}
				</p>
				{#if gpuCountOK}
					<CheckCircleIcon class="h-5 w-5 text-green-600 dark:text-green-400" />
				{:else}
					<XCircleIcon class="h-5 w-5 text-destructive" />
				{/if}
			</div>
			{#if gpuQuota.length === 0}
				<p class="mt-1 text-sm text-muted-foreground">—</p>
			{:else}
				<div class="mt-1 space-y-0.5">
					{#each gpuQuota as q (q.modelID)}
						{@const used = selectedGpuByModel.get(q.modelID) ?? 0}
						{@const ok = used <= q.maxCards}
						<p class="text-sm font-medium {ok ? '' : 'text-destructive'}">
							{q.modelID}:
							<span class="font-bold">{used}</span>
							<span class="font-normal text-muted-foreground">/ {q.maxCards}</span>
						</p>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- ── Status banners ────────────────────────────────────────────────────── -->
	{#if overrideRejected}
		<div
			class="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
		>
			{m.license_adjust_nodes_override_rejected()}
		</div>
	{:else if selectionMode === 'fifo'}
		<div class="rounded-md border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
			{m.license_adjust_nodes_fifo_hint()}
		</div>
	{/if}

	{#if lastAcceptedNodes.length > 0 && selectionMode === 'last_accepted_override'}
		<div class="rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
			<span class="font-medium text-muted-foreground">{m.license_adjust_nodes_last_accepted()}</span
			>
			<span class="font-mono">{lastAcceptedNodes.join(', ')}</span>
		</div>
	{/if}

	<!-- ── Node checkboxes ───────────────────────────────────────────────────── -->
	<Card.Root>
		<Card.Content class="p-0">
			{#if nodeAuthorizations.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">{m.license_no_nodes()}</p>
			{:else}
				<div class="divide-y">
					{#each nodeAuthorizations as node (node.name)}
						{@const isSelected = selected.has(node.name)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="flex cursor-pointer items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/40 {isSelected
								? 'bg-muted/20'
								: ''}"
							onclick={() => toggleNode(node.name, !isSelected)}
						>
							<Checkbox
								checked={isSelected}
								onCheckedChange={(v) => toggleNode(node.name, !!v)}
								class="mt-0.5 shrink-0"
								onclick={(e: MouseEvent) => e.stopPropagation()}
							/>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-mono text-sm font-medium">{node.name}</span>
									{#if node.authorized}
										<Badge
											variant="outline"
											class="border-green-200 bg-green-50 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
										>
											{m.license_condition_ok()}
										</Badge>
									{:else if node.reason}
										<Badge
											variant="outline"
											class="border-destructive/30 bg-destructive/5 text-xs text-destructive"
										>
											{node.reason}
										</Badge>
									{/if}
								</div>
								<p class="mt-0.5 text-xs text-muted-foreground">GPU: {gpuSummary(node)}</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- ── Actions ───────────────────────────────────────────────────────────── -->
	<div class="flex items-center justify-between">
		<Button variant="ghost" size="sm" onclick={handleClear} disabled={isSaving}>
			{m.license_adjust_nodes_clear()}
		</Button>
		<Button size="sm" onclick={handleSave} disabled={isSaving || !quotaOK || selected.size === 0}>
			{isSaving ? m.license_adjust_nodes_saving() : m.license_adjust_nodes_save()}
		</Button>
	</div>
</div>
