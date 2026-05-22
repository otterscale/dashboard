<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { m } from '$lib/paraglide/messages';

	import LicenseEmpty from './license-empty.svelte';
	import LicenseOverview from './license-overview.svelte';
	import type { ClusterFingerprintObject, LicenseObject } from './types';

	// ── Props ──────────────────────────────────────────────────────────────────
	let { cluster }: { cluster: string } = $props();

	// ── State ──────────────────────────────────────────────────────────────────
	let license = $state<LicenseObject | null>(null);
	let clusterFingerprint = $state<ClusterFingerprintObject | null>(null);
	let loading = $state(false);

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// ── Refresh ────────────────────────────────────────────────────────────────
	async function refresh() {
		loading = true;
		try {
			const res = await resourceClient.list({
				cluster,
				group: 'license.otterscale.io',
				version: 'v1alpha1',
				resource: 'licenses'
			});
			license = (res.items?.[0]?.object as LicenseObject) ?? null;

			const cfRes = await resourceClient.list({
				cluster,
				group: 'license.otterscale.io',
				version: 'v1alpha1',
				resource: 'clusterfingerprints'
			});
			clusterFingerprint = (cfRes.items?.[0]?.object as ClusterFingerprintObject) ?? null;
		} catch (error) {
			console.error('Failed to refresh license:', error);
			toast.error(m.license_load_error());
		} finally {
			loading = false;
		}
	}

	// ── Upload license ─────────────────────────────────────────────────────────
	async function uploadLicense(name: string, token: string) {
		const manifest = JSON.stringify({
			apiVersion: 'license.otterscale.io/v1alpha1',
			kind: 'License',
			metadata: { name },
			spec: { token }
		});

		await resourceClient.create({
			cluster,
			group: 'license.otterscale.io',
			version: 'v1alpha1',
			resource: 'licenses',
			manifest: new TextEncoder().encode(manifest)
		});

		await refresh();
	}

	// ── Replace license (update token) ────────────────────────────────────────
	async function replaceLicense(token: string) {
		if (!license?.metadata?.name) return;

		const manifest = JSON.stringify({
			apiVersion: 'license.otterscale.io/v1alpha1',
			kind: 'License',
			metadata: { name: license.metadata.name },
			spec: { token }
		});

		await resourceClient.apply({
			cluster,
			name: license.metadata.name,
			group: 'license.otterscale.io',
			version: 'v1alpha1',
			resource: 'licenses',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});

		await refresh();
	}

	// ── Save authorized nodes override ────────────────────────────────────────
	async function saveAuthorizedNodes(nodes: string[]) {
		if (!license?.metadata?.name) return;

		const manifest = JSON.stringify({
			apiVersion: 'license.otterscale.io/v1alpha1',
			kind: 'License',
			metadata: { name: license.metadata.name },
			spec: {
				token: license.spec?.token ?? '',
				authorizedNodes: nodes.length > 0 ? nodes : undefined
			}
		});

		await resourceClient.apply({
			cluster,
			name: license.metadata.name,
			group: 'license.otterscale.io',
			version: 'v1alpha1',
			resource: 'licenses',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});

		await refresh();
	}

	// ── Trigger fingerprint export ─────────────────────────────────────────────
	async function fetchClusterFingerprintSilent(): Promise<ClusterFingerprintObject | null> {
		const cfRes = await resourceClient.list({
			cluster,
			group: 'license.otterscale.io',
			version: 'v1alpha1',
			resource: 'clusterfingerprints'
		});
		return (cfRes.items?.[0]?.object as ClusterFingerprintObject) ?? null;
	}

	async function triggerExport() {
		const cfName = clusterFingerprint?.metadata?.name ?? 'default';

		const manifest = JSON.stringify({
			apiVersion: 'license.otterscale.io/v1alpha1',
			kind: 'ClusterFingerprint',
			metadata: { name: cfName },
			spec: { exportRequest: true }
		});

		await resourceClient.apply({
			cluster,
			name: cfName,
			group: 'license.otterscale.io',
			version: 'v1alpha1',
			resource: 'clusterfingerprints',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});

		// Poll until lreqB64 is populated (silent — no error toasts)
		const maxAttempts = 20;
		for (let i = 0; i < maxAttempts; i++) {
			await new Promise<void>((resolve) => setTimeout(resolve, 2000));
			try {
				const cf = await fetchClusterFingerprintSilent();
				clusterFingerprint = cf;
				if (cf?.status?.lreqB64) break;
			} catch {
				// ignore individual poll errors
			}
		}
	}

	onMount(() => {
		refresh();
	});
</script>

{#if loading && !license}
	<div class="flex h-full items-center justify-center p-12">
		<p class="text-sm text-muted-foreground">{m.license_loading()}</p>
	</div>
{:else if !license}
	<LicenseEmpty onUpload={uploadLicense} {clusterFingerprint} onTriggerExport={triggerExport} />
{:else}
	<LicenseOverview
		{license}
		{clusterFingerprint}
		onRefresh={refresh}
		onReplace={replaceLicense}
		onSaveNodes={saveAuthorizedNodes}
		onTriggerExport={triggerExport}
	/>
{/if}
