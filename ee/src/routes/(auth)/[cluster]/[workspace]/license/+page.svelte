<script lang="ts">
	import { Code, ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Empty from '$lib/components/license/license-empty.svelte';
	import Manager from '$lib/components/license/license-mamager.svelte';
	import type { ClusterFingerprintObject, LicenseObject } from '$lib/components/license/types';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	const LICENSE_NAME = 'otterscale-license';
	const CLUSTER_FINGERPRINT_NAME = 'default';

	breadcrumbs.set([
		{
			title: m.license(),
			url: resolve('/(auth)/[cluster]/[workspace]/license', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');
	const workspace = $derived(page.params.workspace ?? '');

	let license = $state<LicenseObject | null>(null);
	let fingerprint = $state<ClusterFingerprintObject | null>(null);
	let licenseChecked = $state(false);

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	async function refresh() {
		try {
			try {
				const res = await resourceClient.get({
					cluster,
					group: 'license.otterscale.io',
					version: 'v1alpha1',
					resource: 'licenses',
					name: LICENSE_NAME
				});
				license = (res.object as LicenseObject) ?? null;
				licenseChecked = true;
			} catch (e) {
				if (e instanceof ConnectError && e.code === Code.NotFound) {
					license = null;
					licenseChecked = true;
				} else {
					throw e;
				}
			}

			try {
				const cfRes = await resourceClient.get({
					cluster,
					group: 'license.otterscale.io',
					version: 'v1alpha1',
					resource: 'clusterfingerprints',
					name: CLUSTER_FINGERPRINT_NAME
				});
				fingerprint = (cfRes.object as ClusterFingerprintObject) ?? null;
			} catch (e) {
				if (e instanceof ConnectError && e.code === Code.NotFound) {
					fingerprint = null;
				} else {
					throw e;
				}
			}
		} catch (error) {
			console.error('Failed to refresh license:', error);
			toast.error(m.license_load_error());
		}
	}

	async function uploadLicense(token: string) {
		const manifest = JSON.stringify({
			apiVersion: 'license.otterscale.io/v1alpha1',
			kind: 'License',
			metadata: { name: LICENSE_NAME },
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

	async function replaceLicense(token: string) {
		const manifest = JSON.stringify({
			apiVersion: 'license.otterscale.io/v1alpha1',
			kind: 'License',
			metadata: { name: LICENSE_NAME },
			spec: { token }
		});

		await resourceClient.apply({
			cluster,
			name: LICENSE_NAME,
			group: 'license.otterscale.io',
			version: 'v1alpha1',
			resource: 'licenses',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});

		await refresh();
	}

	async function fetchClusterFingerprintSilent(): Promise<ClusterFingerprintObject | null> {
		try {
			const cfRes = await resourceClient.get({
				cluster,
				group: 'license.otterscale.io',
				version: 'v1alpha1',
				resource: 'clusterfingerprints',
				name: CLUSTER_FINGERPRINT_NAME
			});
			return (cfRes.object as ClusterFingerprintObject) ?? null;
		} catch (e) {
			if (e instanceof ConnectError && e.code === Code.NotFound) {
				return null;
			}
			throw e;
		}
	}

	async function triggerExport() {
		try {
			await resourceClient.delete({
				cluster,
				group: 'license.otterscale.io',
				version: 'v1alpha1',
				resource: 'clusterfingerprints',
				name: CLUSTER_FINGERPRINT_NAME,
				namespace: ''
			});
		} catch (e) {
			if (!(e instanceof ConnectError && e.code === Code.NotFound)) {
				throw e;
			}
		}

		const manifest = JSON.stringify({
			apiVersion: 'license.otterscale.io/v1alpha1',
			kind: 'ClusterFingerprint',
			metadata: { name: CLUSTER_FINGERPRINT_NAME },
			spec: { exportRequest: true }
		});

		await resourceClient.create({
			cluster,
			group: 'license.otterscale.io',
			version: 'v1alpha1',
			resource: 'clusterfingerprints',
			manifest: new TextEncoder().encode(manifest)
		});

		fingerprint = null;

		const maxAttempts = 20;
		for (let i = 0; i < maxAttempts; i++) {
			await new Promise<void>((resolve) => setTimeout(resolve, 2000));
			try {
				const cf = await fetchClusterFingerprintSilent();
				fingerprint = cf;
				if (cf?.status?.lreqB64) break;
			} catch {
				// ignore individual poll errors
			}
		}
	}

	$effect(() => {
		void cluster;
		void workspace;
		license = null;
		fingerprint = null;
		licenseChecked = false;
		refresh();
	});
</script>

{#if !licenseChecked}
	<div class="flex h-full items-center justify-center p-12">
		<p class="text-sm text-muted-foreground">{m.license_loading()}</p>
	</div>
{:else if !license}
	<Empty {fingerprint} onUpload={uploadLicense} onTriggerExport={triggerExport} />
{:else}
	<Manager
		{license}
		{fingerprint}
		onRefresh={refresh}
		onReplace={replaceLicense}
		onTriggerExport={triggerExport}
	/>
{/if}
