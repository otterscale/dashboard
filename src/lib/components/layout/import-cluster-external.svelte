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
<div class="flex h-full flex-1 flex-col gap-6">
	{#if stepIndex === 1}
		{@render stepClusterInfo()}
	{:else if stepIndex === 2}
		{@render stepDeployAgent()}
	{:else if stepIndex === 3}
		{@render stepVerifyBinding()}
	{/if}

	<!-- Footer -->
	<div class="mt-auto flex w-full items-center justify-between gap-3 pt-4">
		{#if stepIndex === 1}
			<Button variant="outline" onclick={goBack}>Previous</Button>
			<Button onclick={handleGenerateManifest} disabled={!canGoNext || isCreating}>
				{#if isCreating}
					<Icon icon="ph:spinner-gap" class="size-4 animate-spin" />
					Generating...
				{:else}
					<Icon icon="ph:terminal-window" class="size-4" />
					Generate Install Command
				{/if}
			</Button>
		{:else if stepIndex === 2}
			<p class="text-sm text-muted-foreground">Auto-advances when agent registers</p>
			<div></div>
		{:else if stepIndex === 3 && bindingSuccess}
			<div></div>
			<Button onclick={onFinish}>Done</Button>
		{:else}
			<div></div>
		{/if}
	</div>
</div>

{#snippet stepClusterInfo()}
	<form
		class="flex flex-col gap-6"
		onsubmit={(e) => {
			e.preventDefault();
			if (canGoNext) handleGenerateManifest();
		}}
	>
		<div>
			<h3 class="text-xl font-bold">Cluster Information</h3>
			<p class="mt-1 text-sm text-muted-foreground">Provide details about this cluster.</p>
		</div>
		<div class="flex flex-col gap-3">
			<Label for="wizard-cluster-name" class="text-sm font-medium">Cluster Name</Label>
			<Input
				id="wizard-cluster-name"
				type="text"
				placeholder="e.g. production-us-west-2"
				bind:value={clusterName}
				required
			/>
		</div>
		<!-- Hidden submit button to allow Enter key to submit the form -->
		<button type="submit" class="hidden" disabled={!canGoNext || isCreating}>Submit</button>
	</form>
{/snippet}

{#snippet stepDeployAgent()}
	<div class="flex flex-col gap-6">
		<div>
			<h3 class="text-xl font-bold">Deploy Agent</h3>
			<p class="mt-1 text-sm text-muted-foreground">Run this command on your target cluster.</p>
		</div>
		<Code.Root
			lang="bash"
			class="w-full text-sm"
			variant="secondary"
			code={installCommand}
			hideLines
		>
			<Code.CopyButton />
		</Code.Root>

		<div
			class="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground"
		>
			<span>
				Target Cluster: <code class="rounded bg-muted px-1 py-0.5 font-mono text-foreground"
					>{clusterName}</code
				>
			</span>
			{#if clusterStatus === 'pending'}
				<span class="flex items-center gap-2">
					<span class="relative flex h-2 w-2">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75"
						></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
					</span>
					Waiting for connection
				</span>
			{:else}
				<span class="flex items-center gap-2 text-primary">
					<Icon icon="ph:check-circle-fill" class="size-4" />
					<span class="font-medium">Agent connected</span>
				</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet stepVerifyBinding()}
	<div class="flex flex-col gap-6">
		<div>
			<h3 class="text-xl font-bold">Verification</h3>
			<p class="mt-1 text-sm text-muted-foreground">Finalizing cluster connection.</p>
		</div>

		<div class="flex flex-col items-center justify-center gap-6 py-12">
			{#if isBinding}
				<div class="relative">
					<div
						class="h-20 w-20 animate-spin rounded-full border-4 border-muted border-t-primary"
					></div>
					<div class="absolute inset-0 flex items-center justify-center">
						<Icon icon="ph:shield-check" class="size-8 text-primary" />
					</div>
				</div>
				<div class="space-y-1 text-center">
					<h3 class="text-lg font-semibold text-foreground">Creating Scope</h3>
					<p class="text-sm text-muted-foreground">
						Registering <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs"
							>ScopeService.CreateScope</code
						>
					</p>
				</div>
			{:else if bindingSuccess}
				<div
					class="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/5"
				>
					<Icon icon="ph:check-circle-fill" class="size-10 text-primary" />
				</div>
				<div class="space-y-1 text-center">
					<h3 class="text-2xl font-bold text-foreground">Cluster Connected</h3>
					<p class="text-sm text-muted-foreground">
						<strong>{clusterName}</strong> is now securely registered.
					</p>
				</div>
				<div class="w-full max-w-sm rounded-lg border bg-card p-4 text-sm shadow-sm">
					<div class="space-y-3">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Cluster</span>
							<span class="font-medium">{clusterName}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Status</span>
							<span class="flex items-center gap-1.5 font-medium text-primary">
								<span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
								Connected
							</span>
						</div>
					</div>
				</div>
			{:else}
				<div
					class="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 ring-4 ring-destructive/5"
				>
					<Icon icon="ph:warning-circle" class="size-10 text-destructive" />
				</div>
				<div class="space-y-1 text-center">
					<h3 class="text-lg font-semibold text-destructive">Binding Failed</h3>
					<p class="max-w-xs text-sm text-muted-foreground">{errorMessage}</p>
				</div>
				<Button variant="outline" onclick={execBinding}>
					<Icon icon="ph:arrow-clockwise" class="mr-2 size-4" />
					Retry Verification
				</Button>
			{/if}
		</div>
	</div>
{/snippet}
