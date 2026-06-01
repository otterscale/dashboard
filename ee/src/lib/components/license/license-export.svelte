<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { toast } from 'svelte-sonner';

	import type { ClusterFingerprintObject } from '$lib/components/license/types';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { m } from '$lib/paraglide/messages';

	let {
		open = $bindable(false),
		clusterFingerprint,
		onTrigger
	}: {
		open?: boolean;
		clusterFingerprint: ClusterFingerprintObject | null;
		onTrigger: () => Promise<void>;
	} = $props();

	let isGenerating = $state(false);

	const fingerprint = $derived(clusterFingerprint?.status?.clusterFingerprint ?? '');
	const lreqB64 = $derived(clusterFingerprint?.status?.lreqB64 ?? '');
	const collectedAt = $derived(clusterFingerprint?.status?.collectedAt ?? '');

	async function handleTrigger() {
		isGenerating = true;
		try {
			await toast.promise(onTrigger(), {
				loading: m.license_export_generating(),
				success: m.license_export_generated(),
				error: (err) => m.license_export_error({ message: (err as Error)?.message ?? String(err) })
			});
		} finally {
			isGenerating = false;
		}
	}

	function downloadLreq() {
		if (!lreqB64) return;
		const binary = atob(lreqB64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		const blob = new Blob([bytes], { type: 'application/octet-stream' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'cluster-license-request.lreq';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{m.license_export_tab()}</Dialog.Title>
			<Dialog.Description>{m.license_export_description()}</Dialog.Description>
		</Dialog.Header>
		<div class="min-w-0 space-y-4 py-2">
			{#if fingerprint}
				<div class="min-w-0 space-y-1.5">
					<p class="text-sm font-medium">{m.license_export_fingerprint_label()}</p>
					<code
						class="block w-full overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs break-all"
						>{fingerprint}</code
					>
				</div>
			{/if}
			{#if collectedAt}
				<p class="text-xs text-muted-foreground">
					{m.license_export_collected_at()}{new Date(collectedAt).toLocaleString()}
				</p>
			{/if}
			{#if !lreqB64}
				<div class="rounded-md bg-muted/40 p-4 text-center">
					<p class="text-sm text-muted-foreground">{m.license_export_no_data()}</p>
				</div>
			{:else}
				<div
					class="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30"
				>
					<p class="text-sm font-medium text-green-700 dark:text-green-400">
						{m.license_export_generated()}
					</p>
				</div>
			{/if}
		</div>
		<Dialog.Footer class="gap-2">
			<Button
				variant="outline"
				size="sm"
				class="gap-2"
				onclick={handleTrigger}
				disabled={isGenerating}
			>
				<RefreshCwIcon class="h-4 w-4 {isGenerating ? 'animate-spin' : ''}" />
				{isGenerating ? m.license_export_generating() : m.license_export_trigger()}
			</Button>
			{#if lreqB64}
				<Button size="sm" class="gap-2" onclick={downloadLreq}>
					<DownloadIcon class="h-4 w-4" />
					{m.license_export_download()}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
