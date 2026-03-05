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

	let {
		stepIndex = $bindable(1),
		onBack,
		onFinish
	}: {
		stepIndex: number;
		onBack: () => void;
		onFinish: () => void;
	} = $props();

	const POLL_INTERVAL = 3000;

	const transport: Transport = getContext('transport');
	const linkClient = createClient(LinkService, transport);
	const scopeClient = createClient(ScopeService, transport);

	let clusterName = $state('');
	let installUrl = $state('');
	let clusterStatus = $state<'pending' | 'ready'>('pending');
	let isBinding = $state(false);
	let bindingSuccess = $state(false);
	let isCreating = $state(false);
	let errorMessage = $state('');

	let isPolling = false;
	let abortController: AbortController | null = null;

	// Cleanup polling if the user closes the dialog or component unmounts
	onDestroy(() => {
		if (abortController) {
			abortController.abort();
		}
	});

	const installCommand = $derived(
		installUrl ? `kubectl apply -f ${installUrl}` : 'Generating install command...'
	);

	const canGoNext = $derived(stepIndex === 1 ? clusterName.trim().length > 0 : false);

	function goBack() {
		if (stepIndex === 1) {
			onBack();
		} else {
			// Actually we don't allow going back from Deploy/Verify for now to keep it simple,
			// but if needed we could reduce stepIndex
			onBack();
		}
	}

	async function handleGenerateManifest() {
		if (!clusterName.trim() || isCreating) return;
		isCreating = true;
		errorMessage = '';

		try {
			const response = await linkClient.getAgentManifest({
				cluster: clusterName
			});

			installUrl = response.url;
			clusterStatus = 'pending';
			stepIndex = 2; // Move to Deploy

			toast.success(`Agent manifest generated for "${clusterName}"`);
			pollAndBind(); // Imperative trigger instead of $effect
		} catch (e) {
			if (e instanceof ConnectError) {
				errorMessage = e.message;
			} else {
				errorMessage = e instanceof Error ? e.message : 'Failed to generate manifest';
			}
			toast.error(errorMessage);
		} finally {
			isCreating = false;
		}
	}

	async function pollAndBind() {
		if (isPolling) return;
		isPolling = true;

		if (abortController) abortController.abort();
		abortController = new AbortController();
		const signal = abortController.signal;

		while (!signal.aborted && clusterStatus === 'pending') {
			try {
				const response = await linkClient.listLinks({});
				if (signal.aborted) break;

				const found = response.links.some((link: Link) => link.cluster === clusterName);
				if (found) {
					clusterStatus = 'ready';
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
		stepIndex = 3; // Move to Verify
		isBinding = true;
		errorMessage = '';
		try {
			await scopeClient.createScope({ name: clusterName });
			bindingSuccess = true;
			toast.success(`Scope "${clusterName}" created`);
		} catch (e) {
			if (e instanceof ConnectError) {
				errorMessage = e.message;
			} else {
				errorMessage = e instanceof Error ? e.message : 'Failed to create scope';
			}
			toast.error(errorMessage);
		} finally {
			isBinding = false;
		}
	}
</script>

<!-- Step Content -->
<div class="max-h-[60vh] overflow-y-auto px-6 py-5">
	{#if stepIndex === 1}
		{@render stepClusterInfo()}
	{:else if stepIndex === 2}
		{@render stepDeployAgent()}
	{:else if stepIndex === 3}
		{@render stepVerifyBinding()}
	{/if}

	{#if errorMessage && stepIndex < 3}
		<div
			class="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-center text-xs text-destructive"
		>
			{errorMessage}
		</div>
	{/if}
</div>

<!-- Footer -->
<div class="flex items-center justify-between border-t px-6 py-3">
	{#if stepIndex === 1}
		<Button variant="outline" size="sm" onclick={goBack}>
			<Icon icon="ph:arrow-left" class="mr-1 size-3" />
			Back
		</Button>
		<Button size="sm" onclick={handleGenerateManifest} disabled={!canGoNext || isCreating}>
			{#if isCreating}
				<Icon icon="ph:spinner-gap" class="mr-1 size-3 animate-spin" />
				Generating...
			{:else}
				<Icon icon="ph:terminal-window" class="mr-1 size-3" />
				Generate Install Command
			{/if}
		</Button>
	{:else if stepIndex === 2}
		<p class="text-xs text-muted-foreground">Auto-advances when agent registers</p>
		<div></div>
	{:else if stepIndex === 3 && bindingSuccess}
		<div></div>
		<Button size="sm" onclick={onFinish}>
			Done
			<Icon icon="ph:check" class="ml-1 size-3" />
		</Button>
	{:else}
		<div></div>
	{/if}
</div>

{#snippet stepClusterInfo()}
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
					bind:value={clusterName}
					required
				/>
				<p class="text-xs text-muted-foreground">
					This name will be used as the cluster identifier for the agent registration.
				</p>
			</div>
		</div>
		<!-- Hidden submit button to allow Enter key to submit the form -->
		<button type="submit" class="hidden" disabled={!canGoNext || isCreating}>Submit</button>
	</form>
{/snippet}

{#snippet stepDeployAgent()}
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
			{#if clusterStatus === 'pending'}
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
				Cluster: <code class="font-mono">{clusterName}</code>
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
{/snippet}

{#snippet stepVerifyBinding()}
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
					<h3 class="font-semibold">Creating Scope</h3>
					<p class="mt-1 text-xs text-muted-foreground">
						Calling <code class="font-mono">ScopeService.CreateScope</code>...
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
						<strong>{clusterName}</strong> is connected and registered.
					</p>
				</div>
				<div class="w-full max-w-xs rounded-lg border bg-card p-4 text-sm">
					<div class="space-y-2">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Cluster</span>
							<span class="font-medium">{clusterName}</span>
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
					<p class="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
				</div>
				<Button variant="outline" size="sm" onclick={execBinding}>
					<Icon icon="ph:arrow-clockwise" class="mr-1 size-3" />
					Retry
				</Button>
			</div>
		{/if}
	</div>
{/snippet}
