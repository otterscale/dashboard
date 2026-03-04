<script lang="ts">
	import Icon from '@iconify/svelte';

	import * as Code from '$lib/components/custom/code';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';

	// ─── Props ────────────────────────────────────────────────
	let {
		open = $bindable(false),
		onsuccess
	}: {
		open: boolean;
		onsuccess?: () => void;
	} = $props();

	// ─── Constants ───────────────────────────────────────────
	const API_DOMAIN = 'api.otterscale.local';
	const POLL_INTERVAL = 3000;

	const steps = [
		{ icon: 'ph:list-checks', label: 'Provider' },
		{ icon: 'ph:note-pencil', label: 'Info' },
		{ icon: 'ph:terminal-window', label: 'Deploy' },
		{ icon: 'ph:shield-check', label: 'Verify' }
	] as const;

	// ─── Step State ──────────────────────────────────────────
	let currentStep = $state(1);

	// Step 1
	let providerType = $state<'baremetal' | 'external' | null>(null);

	// Step 2
	let clusterName = $state('');
	let clusterDescription = $state('');
	let clusterLabels = $state('');

	// Step 3 (from API response)
	let clusterId = $state('');
	let registrationToken = $state('');
	let clusterStatus = $state<'pending' | 'ready'>('pending');

	// Step 4
	let isBinding = $state(false);
	let bindingSuccess = $state(false);

	// Shared
	let isCreating = $state(false);
	let errorMessage = $state('');

	// ─── Mock API Functions ──────────────────────────────────
	let mockPollCount = 0;

	async function mockCreateCluster(
		name: string,
		description: string,
		_provider: string
	): Promise<{ clusterId: string; token: string }> {
		await new Promise((r) => setTimeout(r, 1200));
		const id = crypto.randomUUID().slice(0, 8);
		return {
			clusterId: id,
			token: `reg-${id}-${Date.now().toString(36)}`
		};
	}

	async function mockGetCluster(_id: string): Promise<{ status: 'pending' | 'ready' }> {
		await new Promise((r) => setTimeout(r, 500));
		mockPollCount++;
		return { status: mockPollCount >= 5 ? 'ready' : 'pending' };
	}

	async function mockBindClusterAdmin(_id: string): Promise<{ success: boolean }> {
		await new Promise((r) => setTimeout(r, 2000));
		return { success: true };
	}

	// ─── Derived ─────────────────────────────────────────────
	const installCommand = $derived(
		`kubectl apply -f https://${API_DOMAIN}/v1/fleet/register/manifest?token=${registrationToken}`
	);

	const canGoNext = $derived.by(() => {
		if (currentStep === 1) return providerType !== null;
		if (currentStep === 2) return clusterName.trim().length > 0;
		return false;
	});

	// ─── Actions ─────────────────────────────────────────────
	function resetState() {
		currentStep = 1;
		providerType = null;
		clusterName = '';
		clusterDescription = '';
		clusterLabels = '';
		clusterId = '';
		registrationToken = '';
		clusterStatus = 'pending';
		isBinding = false;
		bindingSuccess = false;
		isCreating = false;
		errorMessage = '';
		mockPollCount = 0;
	}

	function goNext() {
		if (currentStep < 4) currentStep++;
	}

	function goBack() {
		if (currentStep > 1) currentStep--;
	}

	async function handleCreateCluster() {
		if (!clusterName.trim()) return;
		isCreating = true;
		errorMessage = '';
		try {
			const result = await mockCreateCluster(
				clusterName,
				clusterDescription,
				providerType ?? 'external'
			);
			clusterId = result.clusterId;
			registrationToken = result.token;
			mockPollCount = 0;
			clusterStatus = 'pending';
			currentStep = 3;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to create cluster';
		} finally {
			isCreating = false;
		}
	}

	async function handleBinding() {
		isBinding = true;
		errorMessage = '';
		try {
			const result = await mockBindClusterAdmin(clusterId);
			bindingSuccess = result.success;
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to bind cluster admin';
		} finally {
			isBinding = false;
		}
	}

	function handleFinish() {
		open = false;
		onsuccess?.();
		resetState();
	}

	// ─── Polling Effect (Step 3) ─────────────────────────────
	$effect(() => {
		if (currentStep !== 3 || clusterStatus === 'ready') return;

		let active = true;
		const poll = async () => {
			while (active && clusterStatus === 'pending') {
				try {
					const result = await mockGetCluster(clusterId);
					if (!active) return;
					if (result.status === 'ready') {
						clusterStatus = 'ready';
						currentStep = 4;
						return;
					}
				} catch {
					// Retry on error
				}
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
			}
		};
		poll();

		return () => {
			active = false;
		};
	});

	// ─── Auto-bind Effect (Step 4) ───────────────────────────
	$effect(() => {
		if (currentStep === 4 && !isBinding && !bindingSuccess) {
			handleBinding();
		}
	});

	// ─── Reset on close ──────────────────────────────────────
	$effect(() => {
		if (!open) {
			resetState();
		}
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-2xl overflow-hidden p-0" showCloseButton={currentStep <= 2}>
		<!-- Stepper Header -->
		<div class="flex items-center justify-between border-b px-6 py-4">
			{#each steps as step, i}
				{@const stepNum = i + 1}
				{@const isActive = currentStep === stepNum}
				{@const isCompleted = currentStep > stepNum}

				{#if i > 0}
					<div
						class="mx-1 h-0.5 flex-1 transition-all duration-500 {isCompleted
							? 'bg-primary'
							: 'bg-muted'}"
					></div>
				{/if}

				<div class="flex flex-col items-center gap-1">
					<div
						class={cn(
							'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
							isActive &&
								'border-primary bg-primary text-primary-foreground ring-2 ring-primary/20',
							isCompleted && 'border-primary bg-primary text-primary-foreground',
							!isActive && !isCompleted && 'border-muted bg-muted text-muted-foreground'
						)}
					>
						{#if isCompleted}
							<Icon icon="ph:check-bold" class="size-4" />
						{:else}
							<Icon icon={step.icon} class="size-4" />
						{/if}
					</div>
					<span
						class={cn(
							'text-[10px] font-medium whitespace-nowrap transition-colors',
							isActive ? 'text-foreground' : 'text-muted-foreground'
						)}
					>
						{step.label}
					</span>
				</div>
			{/each}
		</div>

		<!-- Step Content -->
		<div class="max-h-[60vh] overflow-y-auto px-6 py-5">
			{#if currentStep === 1}
				<!-- Step 1: Select Provider -->
				<div class="space-y-3">
					<div>
						<h3 class="text-lg font-semibold">Select Provider</h3>
						<p class="text-sm text-muted-foreground">Choose how you'd like to add a cluster.</p>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<button
							class={cn(
								'group relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all duration-200',
								'hover:border-primary/50 hover:bg-accent/50',
								providerType === 'baremetal'
									? 'border-primary bg-accent shadow-md shadow-primary/10'
									: 'border-muted bg-card'
							)}
							onclick={() => (providerType = 'baremetal')}
						>
							{#if providerType === 'baremetal'}
								<div class="absolute top-2 right-2">
									<Icon icon="ph:check-circle-fill" class="size-5 text-primary" />
								</div>
							{/if}
							<div
								class={cn(
									'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
									providerType === 'baremetal'
										? 'bg-primary/15 text-primary'
										: 'bg-muted text-muted-foreground'
								)}
							>
								<Icon icon="ph:hard-drives" class="size-6" />
							</div>
							<div>
								<h4 class="font-semibold">Bare Metal</h4>
								<p class="mt-0.5 text-xs text-muted-foreground">Talos-based provisioning</p>
							</div>
							<span
								class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
							>
								Coming Soon
							</span>
						</button>

						<button
							class={cn(
								'group relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all duration-200',
								'hover:border-primary/50 hover:bg-accent/50',
								providerType === 'external'
									? 'border-primary bg-accent shadow-md shadow-primary/10'
									: 'border-muted bg-card'
							)}
							onclick={() => (providerType = 'external')}
						>
							{#if providerType === 'external'}
								<div class="absolute top-2 right-2">
									<Icon icon="ph:check-circle-fill" class="size-5 text-primary" />
								</div>
							{/if}
							<div
								class={cn(
									'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
									providerType === 'external'
										? 'bg-primary/15 text-primary'
										: 'bg-muted text-muted-foreground'
								)}
							>
								<Icon icon="ph:cloud-arrow-down" class="size-6" />
							</div>
							<div>
								<h4 class="font-semibold">External K8s</h4>
								<p class="mt-0.5 text-xs text-muted-foreground">Juju, Rancher, EKS, etc.</p>
							</div>
							<span
								class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
							>
								Recommended
							</span>
						</button>
					</div>
				</div>
			{:else if currentStep === 2}
				<!-- Step 2: Cluster Metadata -->
				<div class="space-y-4">
					<div>
						<h3 class="text-lg font-semibold">Cluster Information</h3>
						<p class="text-sm text-muted-foreground">Provide details about this cluster.</p>
					</div>
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="wizard-cluster-name" class="text-sm font-medium">
								Cluster Name <span class="text-destructive">*</span>
							</Label>
							<Input
								id="wizard-cluster-name"
								type="text"
								placeholder="e.g. production-us-west-2"
								bind:value={clusterName}
							/>
						</div>
						<div class="space-y-2">
							<Label for="wizard-cluster-desc" class="text-sm font-medium">Description</Label>
							<Textarea
								id="wizard-cluster-desc"
								placeholder="Optional description..."
								bind:value={clusterDescription}
								rows={2}
							/>
						</div>
						<div class="space-y-2">
							<Label for="wizard-cluster-labels" class="text-sm font-medium">Labels</Label>
							<Input
								id="wizard-cluster-labels"
								type="text"
								placeholder="e.g. env=production, region=us-west-2"
								bind:value={clusterLabels}
							/>
							<p class="text-xs text-muted-foreground">Comma-separated key=value pairs.</p>
						</div>
					</div>
				</div>
			{:else if currentStep === 3}
				<!-- Step 3: Deploy Agent -->
				<div class="space-y-4">
					<div class="flex items-start gap-3">
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
							<Icon icon="ph:info" class="size-4 text-primary" />
						</div>
						<div>
							<h3 class="font-semibold">Run on your target cluster</h3>
							<p class="mt-0.5 text-xs text-muted-foreground">
								Requires <code class="rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
									>cluster-admin</code
								> privileges.
							</p>
						</div>
					</div>

					<Code.Root lang="bash" class="w-full" variant="secondary" code={installCommand} hideLines>
						<Code.CopyButton />
					</Code.Root>

					<div
						class="flex items-center justify-center gap-2 rounded-lg border bg-card/50 p-3 text-sm"
					>
						{#if clusterStatus === 'pending'}
							<Icon icon="ph:spinner-gap" class="size-4 animate-spin text-primary" />
							<span class="text-muted-foreground">Waiting for agent to connect...</span>
						{:else}
							<Icon icon="ph:check-circle-fill" class="size-4 text-green-500" />
							<span class="font-medium text-green-500">Connected!</span>
						{/if}
					</div>

					<div
						class="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"
					>
						<span>ID: <code class="font-mono">{clusterId}</code></span>
						<span class="flex items-center gap-1">
							<span class="relative flex h-1.5 w-1.5">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75"
								></span>
								<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary"></span>
							</span>
							Polling {POLL_INTERVAL / 1000}s
						</span>
					</div>
				</div>
			{:else if currentStep === 4}
				<!-- Step 4: Verification -->
				<div class="flex flex-col items-center justify-center py-8">
					{#if isBinding}
						<div class="flex flex-col items-center gap-4">
							<div class="relative">
								<div
									class="h-16 w-16 animate-spin rounded-full border-4 border-muted border-t-primary"
								></div>
								<div class="absolute inset-0 flex items-center justify-center">
									<Icon icon="ph:shield-check" class="size-6 text-primary" />
								</div>
							</div>
							<div class="text-center">
								<h3 class="font-semibold">Establishing Connection</h3>
								<p class="mt-1 text-xs text-muted-foreground">
									Creating tunnel and assigning permissions...
								</p>
							</div>
						</div>
					{:else if bindingSuccess}
						<div class="flex flex-col items-center gap-4">
							<div
								class="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 ring-4 ring-green-500/5"
							>
								<Icon icon="ph:check-circle-fill" class="size-10 text-green-500" />
							</div>
							<div class="text-center">
								<h3 class="text-lg font-bold">🎉 Import Successful!</h3>
								<p class="mt-1 text-sm text-muted-foreground">
									<strong>{clusterName}</strong> is connected with cluster-admin access.
								</p>
							</div>
							<div class="w-full max-w-xs rounded-lg border bg-card p-4 text-sm">
								<div class="space-y-2">
									<div class="flex justify-between">
										<span class="text-muted-foreground">Cluster</span>
										<span class="font-medium">{clusterName}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-muted-foreground">Provider</span>
										<span class="font-medium"
											>{providerType === 'external' ? 'External K8s' : 'Bare Metal'}</span
										>
									</div>
									<div class="flex justify-between">
										<span class="text-muted-foreground">Status</span>
										<span class="flex items-center gap-1 font-medium text-green-500">
											<span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
											Connected
										</span>
									</div>
								</div>
							</div>
						</div>
					{:else}
						<div class="flex flex-col items-center gap-3">
							<div
								class="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"
							>
								<Icon icon="ph:warning-circle" class="size-8 text-destructive" />
							</div>
							<div class="text-center">
								<h3 class="font-semibold">Binding Failed</h3>
								<p class="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
							</div>
							<Button variant="outline" size="sm" onclick={handleBinding}>
								<Icon icon="ph:arrow-clockwise" class="mr-1 size-3" />
								Retry
							</Button>
						</div>
					{/if}
				</div>
			{/if}

			{#if errorMessage && currentStep < 4}
				<div
					class="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-center text-xs text-destructive"
				>
					{errorMessage}
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-between border-t px-6 py-3">
			{#if currentStep <= 2}
				<Button variant="outline" size="sm" onclick={goBack} disabled={currentStep === 1}>
					<Icon icon="ph:arrow-left" class="mr-1 size-3" />
					Back
				</Button>
				{#if currentStep === 2}
					<Button size="sm" onclick={handleCreateCluster} disabled={!canGoNext || isCreating}>
						{#if isCreating}
							<Icon icon="ph:spinner-gap" class="mr-1 size-3 animate-spin" />
							Creating...
						{:else}
							<Icon icon="ph:terminal-window" class="mr-1 size-3" />
							Generate Command
						{/if}
					</Button>
				{:else}
					<Button size="sm" onclick={goNext} disabled={!canGoNext}>
						Next
						<Icon icon="ph:arrow-right" class="ml-1 size-3" />
					</Button>
				{/if}
			{:else if currentStep === 3}
				<p class="text-xs text-muted-foreground">Auto-advances when agent connects</p>
				<div></div>
			{:else if currentStep === 4 && bindingSuccess}
				<div></div>
				<Button size="sm" onclick={handleFinish}>
					Done
					<Icon icon="ph:check" class="ml-1 size-3" />
				</Button>
			{:else}
				<div></div>
				<div></div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
