<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import XCircleIcon from '@lucide/svelte/icons/circle-x';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileUpIcon from '@lucide/svelte/icons/file-up';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { toast } from 'svelte-sonner';

	import Export from '$lib/components/license/license-export.svelte';
	import type {
		ClusterFingerprintObject,
		LicenseObject,
		NodeGPU
	} from '$lib/components/license/types';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/paraglide/messages';

	let {
		license,
		fingerprint: clusterFingerprint,
		onRefresh,
		onReplace,
		onTriggerExport
	}: {
		license: LicenseObject;
		fingerprint: ClusterFingerprintObject | null;
		onRefresh: () => Promise<void>;
		onReplace: (token: string) => Promise<void>;
		onTriggerExport: () => Promise<void>;
	} = $props();

	// ── Replace dialog ─────────────────────────────────────────────────────────
	let replaceOpen = $state(false);
	let replaceFileContent = $state('');
	let replaceFileName = $state('');
	let replaceIsDragging = $state(false);
	let isReplacing = $state(false);

	// ── Export dialog ──────────────────────────────────────────────────────────
	let exportOpen = $state(false);

	function handleReplaceFileSelect(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		replaceFileName = file.name;
		const reader = new FileReader();
		reader.onload = (e) => {
			replaceFileContent = (e.target?.result as string) ?? '';
		};
		reader.readAsText(file);
	}

	async function handleReplace() {
		if (!replaceFileContent.trim()) {
			toast.error(m.license_replace_empty());
			return;
		}
		isReplacing = true;
		try {
			await toast.promise(onReplace(replaceFileContent.trim()), {
				loading: m.license_replacing(),
				success: m.license_replace_success(),
				error: (err) => m.license_replace_error({ message: (err as Error)?.message ?? String(err) })
			});
			replaceOpen = false;
			replaceFileContent = '';
			replaceFileName = '';
		} finally {
			isReplacing = false;
		}
	}

	// ── Derived data ───────────────────────────────────────────────────────────
	const status = $derived(license.status ?? {});
	const phase = $derived(status.phase ?? 'Pending');
	const maxNodes = $derived(status.maxNodes ?? 0);
	const authorizedCount = $derived(status.authorizedNodeCount ?? 0);
	const gpuQuota = $derived(status.gpuQuota ?? []);
	const nodeAuthorizations = $derived(status.nodeAuthorizations ?? []);
	const conditions = $derived(status.conditions ?? []);

	function phaseLabel(p: string) {
		switch (p) {
			case 'Provisional':
				return m.license_phase_provisional();
			case 'Active':
				return m.license_phase_active();
			case 'Expired':
				return m.license_phase_expired();
			case 'Invalid':
				return m.license_phase_invalid();
			default:
				return m.license_phase_pending();
		}
	}

	function phaseVariant(p: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (p) {
			case 'Active':
				return 'default';
			case 'Provisional':
				return 'secondary';
			case 'Expired':
			case 'Invalid':
				return 'destructive';
			default:
				return 'outline';
		}
	}

	function taintReasonLabel(reason: string) {
		switch (reason) {
			case 'node_quota_exceeded':
				return m.license_taint_node_quota_exceeded();
			case 'gpu_quota_exceeded':
				return m.license_taint_gpu_quota_exceeded();
			case 'gpu_model_unlicensed':
				return m.license_taint_gpu_model_unlicensed();
			case 'admin_override':
				return m.license_taint_admin_override();
			default:
				return reason;
		}
	}

	// Conditions whose True value indicates a problem (inverted semantics)
	const NEGATIVE_CONDITIONS = new Set(['AuthorizedNodesOverrideRejected']);

	// Returns true if cond.status==='True' means healthy for this condition type
	function isConditionHealthy(type: string, status: string): boolean {
		const isTrue = status === 'True';
		return NEGATIVE_CONDITIONS.has(type) ? !isTrue : isTrue;
	}

	function parseJwtPayload(token: string): Record<string, unknown> | null {
		try {
			const [, payload] = token.split('.');
			if (!payload) return null;
			const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
			return JSON.parse(decoded) as Record<string, unknown>;
		} catch {
			return null;
		}
	}

	const jwtPayload = $derived(parseJwtPayload(license.spec?.token ?? ''));
	const licenseId = $derived((jwtPayload?.license_id ?? '') as string);
	const licenseExp = $derived(jwtPayload?.exp ? new Date((jwtPayload.exp as number) * 1000) : null);
	const licenseRemainingDays = $derived(
		licenseExp ? Math.ceil((licenseExp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
	);

	const nodeProgress = $derived(maxNodes > 0 ? Math.round((authorizedCount / maxNodes) * 100) : 0);
	const isProvisional = $derived(phase === 'Provisional');
</script>

<!-- Page header -->
<div class="flex items-center justify-between">
	<Item.Root class="p-0">
		<Item.Content class="text-left">
			<Item.Title class="text-xl font-bold"
				>{m.license_title()}
				<Badge variant={phaseVariant(phase)}>{phaseLabel(phase)}</Badge></Item.Title
			>
			<Item.Description class="text-base">{license.metadata?.name ?? ''}</Item.Description>
		</Item.Content>
		<Item.Actions>
			<!-- Refresh -->
			<Button variant="outline" size="sm" class="gap-2" onclick={onRefresh}>
				<RefreshCwIcon class="h-4 w-4" />
				{m.license_refresh()}
			</Button>
			<!-- Export -->
			<Dialog.Root bind:open={exportOpen}>
				<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>
					<DownloadIcon />
					{m.license_export_tab()}
				</Dialog.Trigger>
			</Dialog.Root>
			<Export bind:open={exportOpen} {clusterFingerprint} onTrigger={onTriggerExport} />
			<!-- Replace -->
			<Dialog.Root bind:open={replaceOpen}>
				<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>
					<UploadIcon />
					{m.license_replace()}
				</Dialog.Trigger>
				<Dialog.Content class="max-w-md">
					<Dialog.Header>
						<Dialog.Title>{m.license_replace()}</Dialog.Title>
						<Dialog.Description>{m.license_replace_description()}</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-4 py-2">
						<Label>{m.license_replace_file_label()}</Label>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/50 {replaceIsDragging
								? 'border-primary bg-primary/5'
								: ''}"
							ondrop={(e) => {
								e.preventDefault();
								replaceIsDragging = false;
								handleReplaceFileSelect(e.dataTransfer?.files ?? null);
							}}
							ondragover={(e) => {
								e.preventDefault();
								replaceIsDragging = true;
							}}
							ondragleave={() => (replaceIsDragging = false)}
							onclick={() =>
								(document.getElementById('replace-file-input') as HTMLInputElement)?.click()}
						>
							<UploadIcon class="mb-2 h-8 w-8 text-muted-foreground" />
							{#if replaceFileName}
								<p class="text-sm font-medium">{replaceFileName}</p>
								<p class="text-xs text-muted-foreground">{m.license_click_to_replace_file()}</p>
							{:else}
								<p class="text-sm text-muted-foreground">{m.license_upload_drop()}</p>
							{/if}
							<input
								id="replace-file-input"
								type="file"
								accept=".lic"
								class="hidden"
								onchange={(e) => handleReplaceFileSelect((e.target as HTMLInputElement).files)}
							/>
						</div>
					</div>
					<Dialog.Footer>
						<Button variant="outline" onclick={() => (replaceOpen = false)}>{m.cancel()}</Button>
						<Button disabled={isReplacing || !replaceFileContent} onclick={handleReplace}>
							{isReplacing ? m.license_replacing() : m.license_replace()}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</Item.Actions>
	</Item.Root>
</div>

<!-- Content -->
<div class="flex flex-col gap-4">
	<!-- License Status Card (full width) -->
	<Card.Root>
		<Card.Header class="pb-2">
			<Card.Title class="text-sm font-medium">{m.license_status_card()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div
				class="grid grid-cols-1 divide-y md:grid-cols-[1fr_1px_1fr_1px_1fr] md:divide-x md:divide-y-0"
			>
				<!-- License info column -->
				<div class="flex flex-col gap-3 py-4 md:px-6 md:py-0">
					<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{m.license_info_section()}
					</p>
					{#if licenseId}
						<div class="flex flex-col gap-0.5">
							<span class="text-xs text-muted-foreground">License ID</span>
							<span class="font-mono text-sm break-all" title={licenseId}>{licenseId}</span>
						</div>
					{/if}
					{#if licenseExp}
						<div class="flex flex-col gap-0.5">
							<span class="text-xs text-muted-foreground">{m.license_expiry_date()}</span>
							<span class="text-sm">{licenseExp.toLocaleDateString()}</span>
						</div>
						<div class="flex flex-col gap-0.5">
							<span class="text-xs text-muted-foreground">{m.license_remaining_days()}</span>
							{#if licenseRemainingDays !== null && licenseRemainingDays <= 0}
								<span class="text-sm font-semibold text-destructive"
									>{m.license_expired_label()}</span
								>
							{:else if licenseRemainingDays !== null && licenseRemainingDays <= 30}
								<span class="text-sm font-semibold text-amber-500"
									>{licenseRemainingDays} {m.day()}</span
								>
							{:else if licenseRemainingDays !== null}
								<span class="text-sm font-semibold text-green-600 dark:text-green-400"
									>{licenseRemainingDays} {m.day()}</span
								>
							{/if}
						</div>
					{/if}
				</div>

				<div class="hidden w-px bg-border md:block"></div>

				<!-- Cluster Fingerprint column -->
				<div class="flex flex-col gap-3 py-4 md:px-6 md:py-0">
					<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{m.license_fingerprint_section()}
					</p>
					{#if isProvisional}
						<span class="text-sm text-muted-foreground">{m.license_fingerprint_provisional()}</span>
					{:else}
						<div class="flex items-center gap-2">
							{#if status.clusterFingerprintOK === true}
								<CheckCircleIcon class="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
								<span class="text-sm text-green-600 dark:text-green-400"
									>{m.license_condition_ok()}</span
								>
							{:else if status.clusterFingerprintOK === false}
								<XCircleIcon class="h-4 w-4 shrink-0 text-destructive" />
								<span class="text-sm text-destructive">{m.license_invalid_cluster()}</span>
							{:else}
								<span class="text-sm text-muted-foreground">{m.license_verifying()}</span>
							{/if}
						</div>
					{/if}
					{#if clusterFingerprint?.status?.clusterFingerprint}
						<code
							class="block rounded bg-muted px-2 py-1.5 font-mono text-xs leading-relaxed break-all"
						>
							{clusterFingerprint.status.clusterFingerprint}
						</code>
					{/if}
				</div>

				<div class="hidden w-px bg-border md:block"></div>

				<!-- Conditions / refresh column -->
				<div class="flex flex-col gap-3 py-4 md:px-6 md:py-0">
					<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{m.license_conditions_section()}
					</p>
					{#if status.bindingRefreshedAt}
						<div class="flex flex-col gap-0.5">
							<span class="text-xs text-muted-foreground">{m.license_binding_refreshed_at()}</span>
							<span class="text-xs">{new Date(status.bindingRefreshedAt).toLocaleString()}</span>
						</div>
					{/if}
					{#each conditions as cond (cond.type)}
						<div class="flex items-center justify-between text-sm">
							<span class="text-xs text-muted-foreground">{cond.type}</span>
							{#if isConditionHealthy(cond.type, cond.status)}
								<CheckCircleIcon class="h-4 w-4 text-green-600 dark:text-green-400" />
							{:else}
								<XCircleIcon class="h-4 w-4 text-destructive" />
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Node Quota + GPU Quota + Node Authorization Status -->
	{#if isProvisional}
		<!-- Provisional: next steps banner -->
		<Card.Root class="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
			<Card.Header class="pb-3">
				<Card.Title class="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
					<FileUpIcon class="h-5 w-5 shrink-0" />
					{m.license_provisional_banner_title()}
				</Card.Title>
				<Card.Description class="text-amber-600/80 dark:text-amber-500/80">
					{m.license_provisional_banner_desc()}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ol class="space-y-2">
					<li class="flex items-center gap-3">
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200"
							>1</span
						>
						<span class="text-xs text-amber-700 dark:text-amber-300"
							>{m.license_provisional_step1()}</span
						>
					</li>
					<li class="flex items-center gap-3">
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200"
							>2</span
						>
						<span class="text-xs text-amber-700 dark:text-amber-300"
							>{m.license_provisional_step2()}</span
						>
					</li>
					<li class="flex items-center gap-3">
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200"
							>3</span
						>
						<span class="text-xs text-amber-700 dark:text-amber-300"
							>{m.license_provisional_step3()}</span
						>
					</li>
					<li class="flex items-center gap-3">
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800 dark:bg-amber-800 dark:text-amber-200"
							>4</span
						>
						<span class="text-xs text-amber-700 dark:text-amber-300"
							>{m.license_provisional_step4()}</span
						>
					</li>
				</ol>
			</Card.Content>
			<Card.Footer>
				<Button
					variant="outline"
					class="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/40"
					onclick={() => {
						exportOpen = true;
					}}
				>
					<DownloadIcon class="h-4 w-4" />
					{m.license_goto_export()}
					<ArrowRightIcon class="h-4 w-4" />
				</Button>
			</Card.Footer>
		</Card.Root>
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<!-- Node Quota Card -->
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-sm font-medium">{m.license_node_quota_card()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="space-y-3">
						<div>
							<div class="mb-1 flex justify-between text-xs">
								<span class="font-medium">{m.license_authorized_count()}</span>
								<span class="text-muted-foreground">{authorizedCount} / {maxNodes}</span>
							</div>
							<Progress value={nodeProgress} class="h-1.5" />
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- GPU Quota Card -->
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-sm font-medium">{m.license_gpu_quota_card()}</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if gpuQuota.length === 0}
						<p class="py-4 text-center text-sm text-muted-foreground">—</p>
					{:else}
						<div class="space-y-3">
							{#each gpuQuota as gpu (gpu.modelID)}
								<div>
									<div class="mb-1 flex justify-between text-xs">
										<span class="font-medium">{gpu.modelID}</span>
										<span class="text-muted-foreground">{gpu.authorizedCards} / {gpu.maxCards}</span
										>
									</div>
									<Progress
										value={gpu.maxCards > 0
											? Math.round((gpu.authorizedCards / gpu.maxCards) * 100)
											: 0}
										class="h-1.5"
									/>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Node Authorization Status Card -->
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium">{m.license_node_authorizations_title()}</Card.Title>
			</Card.Header>
			<Card.Content class="px-4 pt-0 pb-4">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.license_node_col_name()}</Table.Head>
							<Table.Head>{m.license_node_col_authorized()}</Table.Head>
							<Table.Head>{m.license_node_col_gpus()}</Table.Head>
							<Table.Head>{m.license_node_col_reason()}</Table.Head>
							<Table.Head>{m.license_node_col_created()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each nodeAuthorizations as node (node.name)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">{node.name}</Table.Cell>
								<Table.Cell>
									{#if node.authorized}
										<span class="flex items-center gap-1 text-green-600 dark:text-green-400">
											<CheckCircleIcon class="h-4 w-4" />
											{m.license_condition_ok()}
										</span>
									{:else}
										<span class="flex items-center gap-1 text-destructive">
											<XCircleIcon class="h-4 w-4" />
											{m.license_unauthorized()}
										</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-xs">
									{#if node.gpus && node.gpus.length > 0}
										{node.gpus
											.map((g: NodeGPU) => `${g.count} ${g.modelID ?? 'devices'}`)
											.join(', ')}
									{:else}
										—
									{/if}
								</Table.Cell>
								<Table.Cell class="text-xs">
									{node.reason ? taintReasonLabel(node.reason) : '—'}
								</Table.Cell>
								<Table.Cell class="text-xs">
									{node.createdAt ? new Date(node.createdAt).toLocaleDateString() : '—'}
								</Table.Cell>
							</Table.Row>
						{/each}
						{#if nodeAuthorizations.length === 0}
							<Table.Row>
								<Table.Cell colspan={5} class="py-6 text-center text-sm text-muted-foreground">
									{m.license_no_nodes()}
								</Table.Cell>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
