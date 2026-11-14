<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import BotIcon from '@lucide/svelte/icons/bot';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { ValidateFunction } from 'ajv';
	import { getContext, untrack } from 'svelte';

	import { fetchAllGpuNodes } from '$lib/components/gpu-allocation';
	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	import Copy from '$lib/components/kind-viewer/kind-viewer-actions/modeltemplate/copy.svelte';
	import Deploy from '$lib/components/kind-viewer/kind-viewer-actions/modeltemplate/deploy.svelte';
	import {
		buildTemplateDict,
		clusterGpuTypes,
		coerceSelection,
		defaultSelection,
		describeEntry,
		gpuOptions,
		gpusOptions,
		kvOffloadOptions,
		type ModelTemplate,
		type ModelTemplateObject,
		pickTemplate,
		type Selection,
		workloadDescription,
		workloadLabel,
		workloadOptions
	} from '$lib/components/kind-viewer/kind-viewer-grid-layouts/modeltemplate/catalog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';

	export type ConfigureAction = 'view' | 'copy' | 'deploy';

	let {
		action,
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		schema,
		validate,
		entry,
		open = $bindable(false)
	}: {
		action: ConfigureAction;
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		validate: ValidateFunction;
		entry: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		open?: boolean;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const ACTION_LABELS: Record<ConfigureAction, string> = {
		view: 'View',
		copy: 'Copy',
		deploy: 'Deploy'
	};

	let templates: ModelTemplateObject[] = $state([]);
	let templatesLoading = $state(false);
	let templatesError: string | undefined = $state(undefined);
	let loadToken = 0;

	const summary = $derived(describeEntry(entry));
	const dict = $derived(buildTemplateDict(templates));

	let selection: Selection = $state({ workload: '', gpu: '', gpus: '', kvOffload: 'false' });
	let topology: Promise<string[]> = $state(Promise.resolve([]));
	let clusterTypes: string[] = $state([]);
	let pendingTemplate: ModelTemplate | undefined = $state(undefined);
	let pendingObject: ServingKserveIoV1Alpha2LLMInferenceServiceConfig | undefined =
		$state(undefined);
	let pendingAction: ConfigureAction | undefined = $state(undefined);
	let handoffOpen = $state(false);

	async function listTemplates(): Promise<ModelTemplateObject[]> {
		const modelLabel = entry.metadata?.labels?.['otterscale.io/model'];
		if (!modelLabel) return [];
		const items: ModelTemplateObject[] = [];
		let continueToken: string | undefined = undefined;
		do {
			const response = await resourceClient.list({
				cluster,
				namespace: entry.metadata?.namespace,
				group,
				version,
				resource,
				labelSelector: `otterscale.io/template-role=deployment,otterscale.io/model=${modelLabel}`,
				continue: continueToken
			} as ListRequest);
			continueToken = response.continue;
			for (const item of response.items) {
				if (item.object) items.push(item.object as unknown as ModelTemplateObject);
			}
		} while (continueToken);
		return items;
	}

	async function loadTemplates() {
		const token = ++loadToken;
		templatesLoading = true;
		templatesError = undefined;
		try {
			const items = await listTemplates();
			if (token !== loadToken) return;
			templates = items;
			selection = defaultSelection(dict);
		} catch (error) {
			if (token !== loadToken) return;
			console.error('Failed to list deployment templates:', error);
			templatesError = error instanceof Error ? error.message : String(error);
		} finally {
			if (token === loadToken) templatesLoading = false;
		}
	}

	$effect(() => {
		if (!open) return;
		untrack(() => {
			templates = [];
			selection = { workload: '', gpu: '', gpus: '', kvOffload: 'false' };
			clusterTypes = [];
			topology = fetchAllGpuNodes(resourceClient, cluster).then((nodes) => {
				clusterTypes = clusterGpuTypes(nodes);
				return clusterTypes;
			});
			loadTemplates();
		});
	});

	const workloads = $derived(workloadOptions(dict));
	const gpus = $derived(gpuOptions(dict, selection.workload));
	const counts = $derived(gpusOptions(dict, selection.workload, selection.gpu));
	const kvValues = $derived(
		kvOffloadOptions(dict, selection.workload, selection.gpu, selection.gpus)
	);
	const kvOn = $derived(kvValues.includes('true'));
	const kvOff = $derived(kvValues.includes('false'));
	const chosen = $derived(pickTemplate(dict, selection));

	function update(patch: Partial<Selection>) {
		selection = coerceSelection(dict, { ...selection, ...patch });
	}

	function proceed() {
		if (!chosen) return;
		pendingTemplate = chosen;
		pendingObject = chosen.object as ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		pendingAction = action;
		open = false;
	}

	function formatDuration(milliseconds: number | null): string {
		if (milliseconds === null) return '–';
		return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(1)} s` : `${milliseconds} ms`;
	}

	function formatTokens(tokens: number): string {
		return tokens >= 1024 && tokens % 1024 === 0 ? `${tokens / 1024}K` : String(tokens);
	}

	function workloadFacts(workload: string): string {
		const lengths: number[] = [];
		for (const byGpus of Object.values(dict[workload] ?? {}))
			for (const byOffload of Object.values(byGpus))
				for (const bucket of Object.values(byOffload))
					for (const template of bucket) {
						const length = template.details.maxModelLen;
						if (length !== null && !lengths.includes(length)) lengths.push(length);
					}
		if (lengths.length === 0) return '';
		return `${lengths
			.sort((a, b) => a - b)
			.map(formatTokens)
			.join(' / ')} context`;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen && pendingTemplate) handoffOpen = true;
	}}
>
	<Dialog.Content
		class="max-h-[95vh] overflow-auto sm:max-w-2xl"
		onInteractOutside={(e) => e.preventDefault()}
	>
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Media variant="image" class="bg-muted">
					<BotIcon />
				</Item.Media>
				<Item.Content class="min-w-0 text-left">
					<Dialog.Title class="truncate">{ACTION_LABELS[action]} — {summary.modelName}</Dialog.Title
					>
					<Dialog.Description class="truncate">
						{summary.modelUri ?? `${templates.length} templates`}
					</Dialog.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>

		{#if templatesLoading}
			<div class="flex items-center gap-2 py-6 text-sm text-muted-foreground" aria-live="polite">
				<Spinner class="size-4" />
				Listing the deployment templates of this model…
			</div>
		{:else if templatesError}
			<Item.Root class="items-start rounded-lg bg-muted p-4">
				<Item.Media variant="icon" class="text-destructive">
					<TriangleAlertIcon />
				</Item.Media>
				<Item.Content class="text-left">
					<Item.Title>Could not list the deployment templates</Item.Title>
					<Item.Description>{templatesError}</Item.Description>
				</Item.Content>
			</Item.Root>
		{:else if workloads.length === 0}
			<Item.Root class="items-start rounded-lg bg-muted p-4">
				<Item.Media variant="icon" class="text-amber-600 dark:text-amber-500">
					<TriangleAlertIcon />
				</Item.Media>
				<Item.Content class="text-left">
					<Item.Title>No deployment templates</Item.Title>
					<Item.Description>
						No deployment template of this model carries the workload, GPU and KV cache offload
						labels.
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{:else}
			<Field.Group class="gap-6">
				<RadioGroup.Root
					value={selection.workload}
					onValueChange={(value) => update({ workload: value })}
					aria-label="Workload"
					class="grid gap-3 sm:grid-cols-3"
				>
					{#each workloads as workload (workload)}
						{@const id = `workload-${workload}`}
						{@const facts = workloadFacts(workload)}
						<Field.Label for={id}>
							<Field.Field orientation="horizontal">
								<Field.Content class="gap-1">
									<Field.Title>{workloadLabel(workload)}</Field.Title>
									{#if facts}
										<p class="text-sm text-muted-foreground">{facts}</p>
									{/if}
									<Field.Description class="text-xs">
										{workloadDescription(workload)}
									</Field.Description>
								</Field.Content>
								<RadioGroup.Item value={workload} {id} />
							</Field.Field>
						</Field.Label>
					{/each}
				</RadioGroup.Root>

				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="gpu-type">Type</Field.Label>
						<Select.Root
							type="single"
							value={selection.gpu}
							onValueChange={(value) => update({ gpu: value })}
						>
							<Select.Trigger id="gpu-type" class="w-full">
								<span class="truncate">{selection.gpu}</span>
							</Select.Trigger>
							<Select.Content>
								{#each gpus as gpu (gpu)}
									<Select.Item value={gpu} label={gpu} />
								{/each}
							</Select.Content>
						</Select.Root>
						{#await topology}
							<Field.Description class="flex items-center gap-2">
								<Spinner class="size-3" />
								Reading cluster GPUs
							</Field.Description>
						{:then}
							{#if clusterTypes.length === 0}
								<Field.Description>No GPUs registered in this cluster.</Field.Description>
							{:else}
								<Field.Description>Cluster GPUs: {clusterTypes.join(', ')}</Field.Description>
							{/if}
						{:catch error}
							<Field.Description class="text-destructive">
								Cluster GPUs unavailable: {(error as Error).message}.
							</Field.Description>
						{/await}
					</Field.Field>

					<Field.Field>
						<Field.Label for="gpu-count">Number</Field.Label>
						<Select.Root
							type="single"
							value={selection.gpus}
							onValueChange={(value) => update({ gpus: value })}
						>
							<Select.Trigger id="gpu-count" class="w-full">
								<span class="truncate">{selection.gpus} GPU</span>
							</Select.Trigger>
							<Select.Content>
								{#each counts as count (count)}
									<Select.Item value={count} label={`${count} GPU`} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>

				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="kv-offload">KV cache offload</Field.Label>
						<Field.Description>
							{#if kvOn && kvOff}
								Keep evicted KV cache in host memory and on disk, so repeated prefixes skip prefill.
							{:else if kvOn}
								Every template for this choice offloads the KV cache.
							{:else}
								No template for this choice offloads the KV cache.
							{/if}
						</Field.Description>
					</Field.Content>
					<Switch
						id="kv-offload"
						checked={selection.kvOffload === 'true'}
						onCheckedChange={(checked) => update({ kvOffload: String(checked) })}
						disabled={!(kvOn && kvOff)}
					/>
				</Field.Field>
			</Field.Group>

			<div class="rounded-lg bg-muted p-4">
				{#if chosen}
					{@const details = chosen.details}
					{@const measured = details.expectedTimeToFirstTokenMs !== null}
					<dl class="grid grid-cols-3 gap-4">
						<div>
							<dt class="text-xs text-muted-foreground">Concurrency</dt>
							<dd class="text-lg font-semibold tabular-nums">
								{details.capacityPerInstance ?? '–'}
							</dd>
							<dd class="text-xs text-muted-foreground">
								requests{details.instances !== null && details.instances > 1
									? ` × ${details.instances} instances`
									: ''}
							</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground">Time to first token</dt>
							<dd class="text-lg font-semibold tabular-nums">
								{formatDuration(details.expectedTimeToFirstTokenMs)}
							</dd>
							<dd class="text-xs text-muted-foreground">
								{measured
									? `${formatDuration(details.worstTimeToFirstTokenMs)} at capacity`
									: 'not measured'}
							</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground">Inter-token latency</dt>
							<dd class="text-lg font-semibold tabular-nums">
								{formatDuration(details.expectedInterTokenLatencyMs)}
							</dd>
							<dd class="text-xs text-muted-foreground">
								{measured
									? `${formatDuration(details.worstInterTokenLatencyMs)} at capacity`
									: 'not measured'}
							</dd>
						</div>
					</dl>
					{#if details.provisional}
						<p class="mt-3 text-xs text-amber-600 dark:text-amber-500">
							Provisional: capacity and latency are predictions, not measurements.
						</p>
					{/if}
				{:else}
					<Item.Root class="items-start p-0">
						<Item.Media variant="icon" class="text-amber-600 dark:text-amber-500">
							<TriangleAlertIcon />
						</Item.Media>
						<Item.Content class="text-left">
							<Item.Title>No matching template</Item.Title>
							<Item.Description>
								No template of this model matches the selected workload, GPU and KV cache offload.
							</Item.Description>
						</Item.Content>
					</Item.Root>
				{/if}
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button disabled={!chosen} onclick={proceed}>{ACTION_LABELS[action]}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

{#if pendingTemplate && pendingObject && pendingAction === 'view'}
	<View
		bind:open={handoffOpen}
		hideTrigger
		{schema}
		object={pendingObject}
		onOpenChangeComplete={(isOpen) => {
			if (!isOpen) pendingTemplate = undefined;
		}}
	/>
{:else if pendingTemplate && pendingObject && pendingAction === 'copy'}
	<Copy
		bind:open={handoffOpen}
		hideTrigger
		{cluster}
		{namespace}
		{group}
		{version}
		{kind}
		{resource}
		{schema}
		{validate}
		object={pendingObject}
		onOpenChangeComplete={(isOpen) => {
			if (!isOpen) pendingTemplate = undefined;
		}}
	/>
{:else if pendingTemplate && pendingObject && pendingAction === 'deploy'}
	<Deploy
		bind:open={handoffOpen}
		hideTrigger
		{cluster}
		{namespace}
		{schema}
		object={pendingObject}
		onOpenChangeComplete={(isOpen) => {
			if (!isOpen) pendingTemplate = undefined;
		}}
	/>
{/if}
