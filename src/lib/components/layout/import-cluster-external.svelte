<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Icon from '@iconify/svelte';
	import { type Link, LinkService } from '@otterscale/api/link/v1';
	import { getContext, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { ScopeService } from '$lib/api/scope/v1/scope_pb';
	import * as Code from '$lib/components/custom/code';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils';

	let {
		onBack,
		onFinish
	}: {
		onBack: () => void;
		onFinish: () => void;
	} = $props();

	const POLL_INTERVAL = 3000;

	// Steps configuration for external provider flow
	const steps = [
		{ icon: 'ph:list-checks', label: 'Provider' },
		{ icon: 'ph:note-pencil', label: 'Info' },
		{ icon: 'ph:terminal-window', label: 'Deploy' },
		{ icon: 'ph:shield-check', label: 'Verify' }
	] as const;

	const transport: Transport = getContext('transport');
	const linkClient = createClient(LinkService, transport);
	const scopeClient = createClient(ScopeService, transport);

	const DEFAULT_FORM = {
		step: 2, // 1 is Provider, we start directly at 2
		clusterName: '',
		installUrl: '',
		clusterStatus: 'pending' as 'pending' | 'ready',
		isBinding: false,
		bindingSuccess: false,
		isCreating: false,
		errorMessage: ''
	};

	let form = $state(structuredClone(DEFAULT_FORM));
	let isPolling = false;
	let abortController: AbortController | null = null;

	// Cleanup polling if the user closes the dialog or component unmounts
	onDestroy(() => {
		if (abortController) {
			abortController.abort();
		}
	});

	const installCommand = $derived(
		form.installUrl ? `kubectl apply -f ${form.installUrl}` : 'Generating install command...'
	);

	const canGoNext = $derived.by(() => {
		if (form.step === 2) return form.clusterName.trim().length > 0;
		return false;
	});

	function goBack() {
		if (form.step === 2) {
			onBack();
		} else {
			// Actually we don't allow going back from Deploy/Verify for now to keep it simple,
			// but if needed we could reduce form.step
			onBack();
		}
	}

	async function handleGenerateManifest() {
		if (!form.clusterName.trim() || form.isCreating) return;
		form.isCreating = true;
		form.errorMessage = '';

		try {
			const response = await linkClient.getAgentManifest({
				cluster: form.clusterName
			});

			form.installUrl = response.url;
			form.clusterStatus = 'pending';
			form.step = 3; // Move to Deploy

			toast.success(`Agent manifest generated for "${form.clusterName}"`);
			pollAndBind(); // Imperative trigger instead of $effect
		} catch (e) {
			if (e instanceof ConnectError) {
				form.errorMessage = e.message;
			} else {
				form.errorMessage = e instanceof Error ? e.message : 'Failed to generate manifest';
			}
			toast.error(form.errorMessage);
		} finally {
			form.isCreating = false;
		}
	}

	async function pollAndBind() {
		if (isPolling) return;
		isPolling = true;

		if (abortController) abortController.abort();
		abortController = new AbortController();
		const signal = abortController.signal;

		while (!signal.aborted && form.clusterStatus === 'pending') {
			try {
				const response = await linkClient.listLinks({});
				if (signal.aborted) break;

				const found = response.links.some((link: Link) => link.cluster === form.clusterName);
				if (found) {
					form.clusterStatus = 'ready';
					await execBinding();
					break;
				}
			} catch {
				// Retry silently on error
			}
			if (!signal.aborted) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
			}
		}
		isPolling = false;
	}

	async function execBinding() {
		form.step = 4; // Move to Verify
		form.isBinding = true;
		form.errorMessage = '';
		try {
			await scopeClient.createScope({ name: form.clusterName });
			form.bindingSuccess = true;
			toast.success(`Scope "${form.clusterName}" created`);
		} catch (e) {
			if (e instanceof ConnectError) {
				form.errorMessage = e.message;
			} else {
				form.errorMessage = e instanceof Error ? e.message : 'Failed to create scope';
			}
			toast.error(form.errorMessage);
		} finally {
			form.isBinding = false;
		}
	}
</script>

<!-- Stepper Header -->
<div class="flex items-center justify-between border-b px-6 py-4">
	{#each steps as step, i (step.label)}
		{@const stepNum = i + 1}
		{@const isActive = form.step === stepNum}
		{@const isCompleted = form.step > stepNum}

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
					isActive && 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/20',
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
	{#if form.step === 2}
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				if (canGoNext) handleGenerateManifest();
			}}
		>
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
						bind:value={form.clusterName}
						required
					/>
					<p class="text-xs text-muted-foreground">
						This name will be used as the cluster identifier for the agent registration.
					</p>
				</div>
			</div>
			<!-- Hidden submit button to allow Enter key to submit the form -->
			<button type="submit" class="hidden" disabled={!canGoNext || form.isCreating}>Submit</button>
		</form>
	{:else if form.step === 3}
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
						>
						privileges. The agent will self-register via
						<code class="rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
							>LinkService.Register</code
						>.
					</p>
				</div>
			</div>

			<Code.Root lang="bash" class="w-full" variant="secondary" code={installCommand} hideLines>
				<Code.CopyButton />
			</Code.Root>

			<div class="flex items-center justify-center gap-2 rounded-lg border bg-card/50 p-3 text-sm">
				{#if form.clusterStatus === 'pending'}
					<Icon icon="ph:spinner-gap" class="size-4 animate-spin text-primary" />
					<span class="text-muted-foreground">
						Polling <code class="font-mono text-xs">LinkService.ListLinks</code> for agent registration...
					</span>
				{:else}
					<Icon icon="ph:check-circle-fill" class="size-4 text-green-500" />
					<span class="font-medium text-green-500">Agent registered!</span>
				{/if}
			</div>

			<div
				class="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground"
			>
				<span>
					Cluster: <code class="font-mono">{form.clusterName}</code>
				</span>
				<span class="flex items-center gap-1">
					<span class="relative flex h-1.5 w-1.5">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75"
						></span>
						<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary"></span>
					</span>
					Polling every {POLL_INTERVAL / 1000}s
				</span>
			</div>
		</div>
	{:else if form.step === 4}
		<div class="flex flex-col items-center justify-center py-8">
			{#if form.isBinding}
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
						<h3 class="font-semibold">Creating Scope</h3>
						<p class="mt-1 text-xs text-muted-foreground">
							Calling <code class="font-mono">ScopeService.CreateScope</code>...
						</p>
					</div>
				</div>
			{:else if form.bindingSuccess}
				<div class="flex flex-col items-center gap-4">
					<div
						class="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 ring-4 ring-green-500/5"
					>
						<Icon icon="ph:check-circle-fill" class="size-10 text-green-500" />
					</div>
					<div class="text-center">
						<h3 class="text-lg font-bold">🎉 Import Successful!</h3>
						<p class="mt-1 text-sm text-muted-foreground">
							<strong>{form.clusterName}</strong> is connected and registered.
						</p>
					</div>
					<div class="w-full max-w-xs rounded-lg border bg-card p-4 text-sm">
						<div class="space-y-2">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Cluster</span>
								<span class="font-medium">{form.clusterName}</span>
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
					<div class="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
						<Icon icon="ph:warning-circle" class="size-8 text-destructive" />
					</div>
					<div class="text-center">
						<h3 class="font-semibold">Binding Failed</h3>
						<p class="mt-1 text-xs text-muted-foreground">{form.errorMessage}</p>
					</div>
					<Button variant="outline" size="sm" onclick={execBinding}>
						<Icon icon="ph:arrow-clockwise" class="mr-1 size-3" />
						Retry
					</Button>
				</div>
			{/if}
		</div>
	{/if}

	{#if form.errorMessage && form.step < 4}
		<div
			class="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-center text-xs text-destructive"
		>
			{form.errorMessage}
		</div>
	{/if}
</div>

<!-- Footer -->
<div class="flex items-center justify-between border-t px-6 py-3">
	{#if form.step === 2}
		<Button variant="outline" size="sm" onclick={goBack}>
			<Icon icon="ph:arrow-left" class="mr-1 size-3" />
			Back
		</Button>
		<Button size="sm" onclick={handleGenerateManifest} disabled={!canGoNext || form.isCreating}>
			{#if form.isCreating}
				<Icon icon="ph:spinner-gap" class="mr-1 size-3 animate-spin" />
				Generating...
			{:else}
				<Icon icon="ph:terminal-window" class="mr-1 size-3" />
				Generate Install Command
			{/if}
		</Button>
	{:else if form.step === 3}
		<p class="text-xs text-muted-foreground">Auto-advances when agent registers</p>
		<div></div>
	{:else if form.step === 4 && form.bindingSuccess}
		<div></div>
		<Button size="sm" onclick={onFinish}>
			Done
			<Icon icon="ph:check" class="ml-1 size-3" />
		</Button>
	{:else}
		<div></div>
	{/if}
</div>
