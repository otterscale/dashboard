<script lang="ts">
	import { Code, ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		decodeTokenPayload,
		getLicenseExpiry,
		getSoftwareID,
		licenseResourceName
	} from '$lib/components/license/token';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';

	let {
		cluster,
		group,
		version,
		resource
	}: {
		cluster: string;
		group: string;
		version: string;
		resource: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const CLUSTER_FINGERPRINT_NAME = 'default';
	const CLUSTER_FINGERPRINT_RESOURCE = 'clusterfingerprints';

	// ── Upload license ─────────────────────────────────────────────────────────
	let uploadOpen = $state(false);
	let fileContent = $state('');
	let fileName = $state('');
	let isDragging = $state(false);
	let isSubmitting = $state(false);
	// Set when the same-name CR already exists and is Active: the user must
	// explicitly confirm the overwrite (renewal) before we apply.
	let overwriteTarget = $state<string | null>(null);

	const token = $derived(fileContent.trim());
	const payload = $derived(token ? decodeTokenPayload(token) : null);
	const softwareID = $derived(getSoftwareID(payload));
	const crName = $derived(softwareID ? licenseResourceName(softwareID) : null);
	const expiry = $derived(getLicenseExpiry(payload));

	function resetUpload() {
		fileContent = '';
		fileName = '';
		isDragging = false;
		isSubmitting = false;
		overwriteTarget = null;
	}

	function handleFileSelect(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		fileName = file.name;
		overwriteTarget = null;
		const reader = new FileReader();
		reader.onload = (e) => {
			fileContent = (e.target?.result as string) ?? '';
		};
		reader.readAsText(file);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function fetchExisting(name: string): Promise<any | null> {
		try {
			const response = await resourceClient.get({ cluster, group, version, resource, name });
			return response.object ?? null;
		} catch (e) {
			if (e instanceof ConnectError && e.code === Code.NotFound) return null;
			throw e;
		}
	}

	// Detail page of a license CR (same shape as buildResourceDetailUrl).
	function licenseDetailUrl(name: string) {
		const query = `?group=${group}&version=${version}&kind=License&resource=${resource}`;
		return resolve(`/(auth)/${page.params.cluster}/${page.params.workspace}/${name}${query}`);
	}

	// page.data.isRestricted (root layout load) only lifts once the operator
	// has set status.phase, which happens asynchronously after create/apply —
	// poll briefly for it, then re-run loads. goto() alone won't re-run the
	// root layout load since none of its dependencies change.
	async function refreshRestrictedMode(name: string) {
		for (let i = 0; i < 10; i++) {
			try {
				const current = await fetchExisting(name);
				if (current?.status?.phase) break;
			} catch {
				// ignore individual poll errors
			}
			await new Promise<void>((done) => setTimeout(done, 1000));
		}
		await invalidateAll();
	}

	async function submitUpload() {
		if (!token) {
			toast.error(m.license_upload_missing_fields());
			return;
		}
		if (!crName) {
			toast.error(m.license_import_parse_error());
			return;
		}

		// crName is derived from fileContent, which resetUpload() clears —
		// capture it for the post-success redirect.
		const uploadedName = crName;

		isSubmitting = true;
		try {
			const existing = await fetchExisting(uploadedName);

			// Renewal onto a still-Active license requires explicit confirmation.
			if (existing?.status?.phase === 'Active' && overwriteTarget !== crName) {
				overwriteTarget = crName;
				return;
			}

			const manifest = new TextEncoder().encode(
				JSON.stringify({
					apiVersion: `${group}/${version}`,
					kind: 'License',
					metadata: { name: crName },
					spec: { token }
				})
			);

			await toast.promise(
				(async () => {
					if (existing) {
						await resourceClient.apply({
							cluster,
							name: crName,
							group,
							version,
							resource,
							manifest,
							fieldManager: 'otterscale-web-ui',
							force: true
						});
					} else {
						await resourceClient.create({ cluster, group, version, resource, manifest });
					}
				})(),
				{
					loading: m.license_uploading(),
					success: m.license_upload_success(),
					error: (err) =>
						m.license_upload_error({ message: (err as Error)?.message ?? String(err) })
				}
			);
			uploadOpen = false;
			resetUpload();
			// Fire-and-forget: lifts restricted mode once the operator reconciles.
			void refreshRestrictedMode(uploadedName);
			await goto(licenseDetailUrl(uploadedName));
		} catch (err) {
			toast.error(m.license_upload_error({ message: (err as Error)?.message ?? String(err) }));
		} finally {
			isSubmitting = false;
		}
	}

	// ── Export license request (.lreq) ─────────────────────────────────────────
	let exportOpen = $state(false);
	let isGenerating = $state(false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let clusterFingerprint = $state<any | null>(null);

	const fingerprint = $derived(clusterFingerprint?.status?.clusterFingerprint ?? '');
	const lreqB64 = $derived(clusterFingerprint?.status?.lreqB64 ?? '');
	const collectedAt = $derived(clusterFingerprint?.status?.collectedAt ?? '');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function fetchClusterFingerprint(): Promise<any | null> {
		try {
			const response = await resourceClient.get({
				cluster,
				group,
				version,
				resource: CLUSTER_FINGERPRINT_RESOURCE,
				name: CLUSTER_FINGERPRINT_NAME
			});
			return response.object ?? null;
		} catch (e) {
			if (e instanceof ConnectError && e.code === Code.NotFound) return null;
			throw e;
		}
	}

	async function triggerExport() {
		try {
			await resourceClient.delete({
				cluster,
				group,
				version,
				resource: CLUSTER_FINGERPRINT_RESOURCE,
				name: CLUSTER_FINGERPRINT_NAME,
				namespace: ''
			});
		} catch (e) {
			if (!(e instanceof ConnectError && e.code === Code.NotFound)) {
				throw e;
			}
		}

		await resourceClient.create({
			cluster,
			group,
			version,
			resource: CLUSTER_FINGERPRINT_RESOURCE,
			manifest: new TextEncoder().encode(
				JSON.stringify({
					apiVersion: `${group}/${version}`,
					kind: 'ClusterFingerprint',
					metadata: { name: CLUSTER_FINGERPRINT_NAME },
					spec: { exportRequest: true }
				})
			)
		});

		clusterFingerprint = null;

		const maxAttempts = 20;
		for (let i = 0; i < maxAttempts; i++) {
			await new Promise<void>((resolve) => setTimeout(resolve, 2000));
			try {
				const current = await fetchClusterFingerprint();
				clusterFingerprint = current;
				if (current?.status?.lreqB64) break;
			} catch {
				// ignore individual poll errors
			}
		}
	}

	async function handleTrigger() {
		isGenerating = true;
		try {
			await toast.promise(triggerExport(), {
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

<div class="flex items-center gap-2">
	<!-- Upload license -->
	<Tooltip.Root>
		<Dialog.Root
			bind:open={uploadOpen}
			onOpenChangeComplete={(isOpen) => {
				if (isOpen) return;
				resetUpload();
			}}
		>
			<Tooltip.Trigger>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="icon">
							<UploadIcon />
						</Button>
					{/snippet}
				</Dialog.Trigger>
			</Tooltip.Trigger>
			<Dialog.Content class="max-w-md">
				<Dialog.Header>
					<Dialog.Title>{m.license_upload()}</Dialog.Title>
					<Dialog.Description>{m.license_upload_description()}</Dialog.Description>
				</Dialog.Header>
				<div class="space-y-4 py-2">
					<div class="space-y-1.5">
						<Label>{m.license_replace_file_label()}</Label>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/50 {isDragging
								? 'border-primary bg-primary/5'
								: ''}"
							ondrop={(e) => {
								e.preventDefault();
								isDragging = false;
								handleFileSelect(e.dataTransfer?.files ?? null);
							}}
							ondragover={(e) => {
								e.preventDefault();
								isDragging = true;
							}}
							ondragleave={() => (isDragging = false)}
							onclick={() =>
								(document.getElementById('license-file-input') as HTMLInputElement)?.click()}
						>
							<UploadIcon class="mb-2 h-8 w-8 text-muted-foreground" />
							{#if fileName}
								<p class="text-sm font-medium">{fileName}</p>
								<p class="text-xs text-muted-foreground">{m.license_click_to_replace_file()}</p>
							{:else}
								<p class="text-sm text-muted-foreground">{m.license_upload_drop()}</p>
							{/if}
							<input
								id="license-file-input"
								type="file"
								accept=".lic,.jwt"
								class="hidden"
								onchange={(e) => handleFileSelect((e.target as HTMLInputElement).files)}
							/>
						</div>
					</div>

					{#if fileContent}
						{#if crName}
							<!-- Decoded token preview: software-id determines the CR name -->
							<div class="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
								<div class="flex justify-between gap-4">
									<span class="text-muted-foreground">{m.license_import_software_label()}</span>
									<span class="font-mono">{softwareID}</span>
								</div>
								<div class="flex justify-between gap-4">
									<span class="text-muted-foreground">{m.license_import_target_label()}</span>
									<span class="font-mono">{crName}</span>
								</div>
								{#if expiry}
									<div class="flex justify-between gap-4">
										<span class="text-muted-foreground">{m.license_expiry_date()}</span>
										<span>{expiry.toLocaleDateString()}</span>
									</div>
								{/if}
							</div>
						{:else}
							<div
								class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3"
							>
								<TriangleAlertIcon class="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
								<p class="text-sm text-destructive">{m.license_import_parse_error()}</p>
							</div>
						{/if}
					{/if}

					{#if overwriteTarget}
						<div
							class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
						>
							<TriangleAlertIcon
								class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
							/>
							<div class="space-y-1">
								<p class="text-sm font-medium text-amber-700 dark:text-amber-400">
									{m.license_overwrite_confirm_title()}
								</p>
								<p class="text-xs text-amber-700/80 dark:text-amber-300/80">
									{m.license_overwrite_confirm_description({ name: overwriteTarget })}
								</p>
							</div>
						</div>
					{/if}
				</div>
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (uploadOpen = false)}>{m.cancel()}</Button>
					<Button
						variant={overwriteTarget ? 'destructive' : 'default'}
						disabled={isSubmitting || !fileContent || !crName}
						onclick={submitUpload}
					>
						{#if isSubmitting}
							{m.license_uploading_btn()}
						{:else if overwriteTarget}
							{m.license_overwrite_confirm_button()}
						{:else}
							{m.license_upload_btn()}
						{/if}
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
		<Tooltip.Content>{m.license_upload()}</Tooltip.Content>
	</Tooltip.Root>

	<!-- Export license request (.lreq) -->
	<Tooltip.Root>
		<Dialog.Root
			bind:open={exportOpen}
			onOpenChangeComplete={(isOpen) => {
				if (!isOpen) return;
				// Surface a previously generated .lreq without regenerating.
				fetchClusterFingerprint()
					.then((current) => (clusterFingerprint = current))
					.catch(() => {});
			}}
		>
			<Tooltip.Trigger>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="icon">
							<DownloadIcon />
						</Button>
					{/snippet}
				</Dialog.Trigger>
			</Tooltip.Trigger>
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
		<Tooltip.Content>{m.license_export_tab()}</Tooltip.Content>
	</Tooltip.Root>
</div>
