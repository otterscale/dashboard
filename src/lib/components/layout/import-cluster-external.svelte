<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FileCodeIcon from '@lucide/svelte/icons/file-code';
	import TerminalIcon from '@lucide/svelte/icons/terminal';
	import { type Link, LinkService } from '@otterscale/api/link/v1';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import * as Code from '$lib/components/custom/code';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';

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
	const resourceClient = createClient(ResourceService, transport);

	let clusterName = $state('');
	let installUrl = $state('');
	let manifestYaml = $state('');
	let clusterStatus = $state<'pending' | 'installing' | 'ready'>('pending');
	let isCreating = $state(false);
	let errorMessage = $state('');

	let isPolling = false;
	let abortController: AbortController | null = null;

	onDestroy(() => {
		abortController?.abort();
	});

	const installCommand = $derived(
		installUrl ? `kubectl apply -f ${installUrl}` : 'Generating install command...'
	);

	const canGoNext = $derived(stepIndex === 1 ? clusterName.trim().length > 0 : false);

	async function handleGenerateManifest() {
		if (!clusterName.trim() || isCreating) return;
		isCreating = true;
		errorMessage = '';

		try {
			const response = await linkClient.getAgentManifest({
				cluster: clusterName
			});

			installUrl = response.url;
			manifestYaml = response.manifest;
			clusterStatus = 'pending';
			stepIndex = 2;

			toast.success(`Agent manifest generated for "${clusterName}"`);
			pollForConnection();
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

	async function pollForConnection() {
		if (isPolling) return;
		isPolling = true;

		abortController?.abort();
		abortController = new AbortController();
		const signal = abortController.signal;

		while (!signal.aborted && clusterStatus === 'pending') {
			try {
				const response = await linkClient.listLinks({});
				if (signal.aborted) break;

				const found = response.links.some((link: Link) => link.cluster === clusterName);
				if (found) {
					clusterStatus = 'installing';
					break;
				}
			} catch {
				// retry silently
			}
			if (!signal.aborted) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
			}
		}

		while (!signal.aborted && clusterStatus === 'installing') {
			try {
				const response = await resourceClient.get({
					cluster: clusterName,
					namespace: 'otterscale-system',
					group: 'apps',
					version: 'v1',
					resource: 'deployments',
					name: 'tenant-operator-controller-manager'
				});
				if (signal.aborted) break;

				const obj = response.object as Record<string, any>;
				const conditions: any[] = obj?.status?.conditions ?? [];
				const available = conditions.find((c: any) => c.type === 'Available');
				if (available?.status === 'True') {
					clusterStatus = 'ready';
					stepIndex = 3;
					break;
				}
			} catch {
				// deployment may not exist yet, retry silently
			}
			if (!signal.aborted) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
			}
		}

		isPolling = false;
	}
</script>

<div class="flex h-full flex-1 flex-col gap-6">
	{#if stepIndex === 1}
		{@render stepClusterInfo()}
	{:else if stepIndex === 2}
		{@render stepDeployAgent()}
	{:else if stepIndex === 3}
		{@render stepVerifyBinding()}
	{/if}

	<div class="mt-auto flex w-full items-center justify-between gap-3 pt-4">
		{#if stepIndex === 1}
			<Button variant="outline" onclick={onBack}>Previous</Button>
			<Button onclick={handleGenerateManifest} disabled={!canGoNext || isCreating}>
				{#if isCreating}
					<Spinner data-icon="inline-start" />
					Generating...
				{:else}
					<TerminalIcon data-icon="inline-start" />
					Generate Install Command
				{/if}
			</Button>
		{:else if stepIndex === 3}
			<div></div>
			<Button onclick={onFinish}>Done</Button>
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
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold">Cluster Information</h3>
			<p class="text-sm text-muted-foreground">Provide details about this cluster.</p>
		</div>

		<Field.FieldGroup>
			<Field.Field>
				<Field.FieldLabel for="wizard-cluster-name">Cluster Name</Field.FieldLabel>
				<Input
					id="wizard-cluster-name"
					type="text"
					placeholder="e.g. production-us-west-2"
					bind:value={clusterName}
					required
				/>
			</Field.Field>
		</Field.FieldGroup>

		<button type="submit" class="hidden" disabled={!canGoNext || isCreating}>Submit</button>
	</form>
{/snippet}

{#snippet stepDeployAgent()}
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold">Deploy Agent</h3>
			<p class="text-sm text-muted-foreground">Run this command on your target cluster.</p>
		</div>

		<Code.Root
			lang="bash"
			class="w-full text-sm"
			variant="secondary"
			code={installUrl
				? `# Command\nkubectl apply -f ${installUrl}`
				: 'Generating install command...'}
			hideLines
		>
			<Code.CopyButton />
		</Code.Root>

		{#if manifestYaml}
			<Collapsible.Root>
				<Collapsible.Trigger
					class="group flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
				>
					<span class="flex items-center gap-2">
						<FileCodeIcon class="size-4" />
						Preview YAML Manifest
					</span>
					<ChevronDownIcon
						class="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
					/>
				</Collapsible.Trigger>
				<Collapsible.Content>
					<div class="mt-2 max-h-125 overflow-auto rounded-md border">
						<Code.Root lang="yaml" class="w-full text-xs" code={manifestYaml}>
							<Code.CopyButton />
						</Code.Root>
					</div>
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}

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
					<span class="relative flex size-2">
						<span
							class="absolute inline-flex size-full animate-ping rounded-full bg-primary/75 opacity-75"
						></span>
						<span class="relative inline-flex size-2 rounded-full bg-primary"></span>
					</span>
					Waiting for connection
				</span>
			{:else if clusterStatus === 'installing'}
				<span class="flex items-center gap-2 text-amber-500">
					<Spinner />
					<span class="font-medium">Installing...</span>
				</span>
			{:else}
				<span class="flex items-center gap-2 text-primary">
					<CircleCheckIcon class="size-4" />
					<span class="font-medium">Managed successfully</span>
				</span>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet stepVerifyBinding()}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon" class="size-14 bg-primary/10 ring-4 ring-primary/5">
				<CircleCheckIcon class="size-8 text-primary" />
			</Empty.Media>
			<Empty.Title>Managed Successfully</Empty.Title>
			<Empty.Description>
				<strong>{clusterName}</strong> is now managed and ready to use.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<div class="w-full max-w-sm rounded-lg border bg-card p-3 text-sm shadow-sm">
				<div class="flex flex-col gap-2">
					<div class="flex justify-between">
						<span class="text-muted-foreground">Cluster</span>
						<span class="font-medium">{clusterName}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Status</span>
						<span class="flex items-center gap-1.5 font-medium text-primary">
							<span class="size-1.5 rounded-full bg-primary"></span>
							Managed
						</span>
					</div>
				</div>
			</div>
		</Empty.Content>
	</Empty.Root>
{/snippet}
