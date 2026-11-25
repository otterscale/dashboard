<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import BotIcon from '@lucide/svelte/icons/bot';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { ValidateFunction } from 'ajv';
	import { getContext, untrack } from 'svelte';

	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	import Copy from '$lib/components/kind-viewer/kind-viewer-actions/modeltemplate/copy.svelte';
	import Deploy from '$lib/components/kind-viewer/kind-viewer-actions/modeltemplate/deploy.svelte';
	import {
		buildTemplateDict,
		coerceSelection,
		defaultSelection,
		describeEntry,
		gpuAmountLabel,
		gpuOptions,
		gpuProductLabel,
		gpusOptions,
		kvOffloadOptions,
		type ModelTemplate,
		type ModelTemplateObject,
		pickTemplate,
		replicasOptions,
		routingOptions,
		type Selection,
		templateResources,
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

	let selection: Selection = $state({
		workload: '',
		gpu: '',
		gpus: '',
		replicas: '',
		kvOffload: 'false',
		routing: 'false'
	});
	let pendingTemplate: ModelTemplate | undefined = $state(undefined);
	let pendingObject: ServingKserveIoV1Alpha2LLMInferenceServiceConfig | undefined =
		$state(undefined);
	let pendingAction: ConfigureAction | undefined = $state(undefined);
	let handoffOpen = $state(false);
	let isPublic = $state(false);

	async function listTemplates(): Promise<ModelTemplateObject[]> {
		const modelLabel = entry.metadata?.labels?.['template.otterscale.io/model'];
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
				labelSelector: `template.otterscale.io/template-role=deployment,template.otterscale.io/model=${modelLabel}`,
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
			selection = {
				workload: '',
				gpu: '',
				gpus: '',
				replicas: '',
				kvOffload: 'false',
				routing: 'false'
			};
			isPublic = false;
			loadTemplates();
		});
	});

	const workloads = $derived(workloadOptions(dict));
	const gpus = $derived(gpuOptions(dict, selection.workload));
	const counts = $derived(gpusOptions(dict, selection.workload, selection.gpu));
	const replicaCounts = $derived(
		replicasOptions(dict, selection.workload, selection.gpu, selection.gpus)
	);
	const kvValues = $derived(
		kvOffloadOptions(dict, selection.workload, selection.gpu, selection.gpus, selection.replicas)
	);
	const kvOn = $derived(kvValues.includes('true'));
	const kvOff = $derived(kvValues.includes('false'));
	const routingValues = $derived(
		routingOptions(
			dict,
			selection.workload,
			selection.gpu,
			selection.gpus,
			selection.replicas,
			selection.kvOffload
		)
	);
	const routingOn = $derived(routingValues.includes('true'));
	const routingOff = $derived(routingValues.includes('false'));
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

	function formatTokens(tokens: number): string {
		return tokens >= 1024 && tokens % 1024 === 0 ? `${tokens / 1024}K` : String(tokens);
	}

	function workloadFacts(workload: string): string {
		const lengths: number[] = [];
		for (const byGpus of Object.values(dict[workload] ?? {}))
			for (const byReplicas of Object.values(byGpus))
				for (const byOffload of Object.values(byReplicas))
					for (const byRouting of Object.values(byOffload))
						for (const bucket of Object.values(byRouting))
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
						No deployment template of this model carries the workload, GPU, replicas and KV cache
						offload labels.
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

				<div class="grid gap-4 sm:grid-cols-3">
					<Field.Field>
						<Field.Label for="gpu-type">Type</Field.Label>
						<Select.Root
							type="single"
							value={selection.gpu}
							onValueChange={(value) => update({ gpu: value })}
						>
							<Select.Trigger id="gpu-type" class="w-full">
								<span class="truncate">
									{gpuProductLabel(dict, selection.workload, selection.gpu)}
								</span>
							</Select.Trigger>
							<Select.Content>
								{#each gpus as gpu (gpu)}
									<Select.Item value={gpu} label={gpuProductLabel(dict, selection.workload, gpu)} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>

					<Field.Field>
						<Field.Label for="gpu-count">GPU per replica</Field.Label>
						<Select.Root
							type="single"
							value={selection.gpus}
							onValueChange={(value) => update({ gpus: value })}
						>
							<Select.Trigger id="gpu-count" class="w-full">
								<span class="truncate">{gpuAmountLabel(selection.gpus)} GPU</span>
							</Select.Trigger>
							<Select.Content>
								{#each counts as count (count)}
									<Select.Item value={count} label={`${gpuAmountLabel(count)} GPU`} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>

					<Field.Field>
						<Field.Label for="replica-count">Replicas</Field.Label>
						<Select.Root
							type="single"
							value={selection.replicas}
							onValueChange={(value) => update({ replicas: value })}
						>
							<Select.Trigger id="replica-count" class="w-full">
								<span class="truncate">
									{selection.replicas || '–'}
									{selection.replicas === '1' ? 'replica' : 'replicas'}
								</span>
							</Select.Trigger>
							<Select.Content>
								{#each replicaCounts as count (count)}
									<Select.Item
										value={count}
										label={`${count} ${count === '1' ? 'replica' : 'replicas'}`}
									/>
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

				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="prefix-routing">Precise prefix cache routing</Field.Label>
						<Field.Description>
							{#if routingOn && routingOff}
								Send each request to the replica holding the longest prefix of its prompt in KV
								cache.
							{:else if routingOn}
								Every template for this choice routes by the precise prefix cache.
							{:else}
								No template for this choice routes by the precise prefix cache.
							{/if}
						</Field.Description>
					</Field.Content>
					<Switch
						id="prefix-routing"
						checked={selection.routing === 'true'}
						onCheckedChange={(checked) => update({ routing: String(checked) })}
						disabled={!(routingOn && routingOff)}
					/>
				</Field.Field>

				{#if action === 'deploy'}
					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label for="public-access">Public</Field.Label>
							<Field.Description>
								Anyone who can reach the gateway can call this model without an API key.
							</Field.Description>
						</Field.Content>
						<Switch
							id="public-access"
							checked={isPublic}
							onCheckedChange={(checked) => (isPublic = checked)}
						/>
					</Field.Field>
				{/if}
			</Field.Group>

			<div class="rounded-lg bg-muted p-4">
				{#if chosen}
					{@const details = chosen.details}
					{@const resources = templateResources(chosen.object)}
					{@const replicaCount = Number(chosen.replicas) || 1}
					<dl class="grid grid-cols-3 gap-4">
						<div>
							<dt class="text-xs text-muted-foreground">Concurrency</dt>
							<dd class="text-lg font-semibold tabular-nums">
								{details.concurrency ?? '–'}
							</dd>
							<dd class="text-xs text-muted-foreground">
								requests{replicaCount > 1 ? ` × ${replicaCount} replicas` : ''}
							</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground">Context length</dt>
							<dd class="text-lg font-semibold tabular-nums">
								{details.maxModelLen !== null ? formatTokens(details.maxModelLen) : '–'}
							</dd>
							<dd class="text-xs text-muted-foreground">tokens</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground">Engine</dt>
							<dd class="text-lg font-semibold tabular-nums">
								{details.vllmVersion ? `vLLM ${details.vllmVersion}` : '–'}
							</dd>
							<dd class="text-xs text-muted-foreground">
								{details.tensorParallelSize !== null
									? `tensor parallel ${details.tensorParallelSize}`
									: ''}
							</dd>
						</div>
					</dl>
					{#if resources.cpu !== null || resources.memory !== null || resources.vram !== null}
						<dl class="mt-4 grid grid-cols-3 gap-4 border-t pt-4">
							<div>
								<dt class="text-xs text-muted-foreground">CPU</dt>
								<dd class="text-lg font-semibold tabular-nums">{resources.cpu ?? '–'}</dd>
								<dd class="text-xs text-muted-foreground">cores per replica</dd>
							</div>
							<div>
								<dt class="text-xs text-muted-foreground">DRAM</dt>
								<dd class="text-lg font-semibold tabular-nums">{resources.memory ?? '–'}</dd>
								<dd class="text-xs text-muted-foreground">host memory per replica</dd>
							</div>
							<div>
								<dt class="text-xs text-muted-foreground">VRAM</dt>
								<dd class="text-lg font-semibold tabular-nums">{resources.vram ?? '–'}</dd>
								<dd class="text-xs text-muted-foreground">{resources.gpu ?? 'in total'}</dd>
							</div>
						</dl>
					{/if}
					{#if selection.kvOffload === 'true' && details.kvOffloadCpuGibibytes !== null}
						<p class="mt-3 text-xs text-muted-foreground">
							KV cache offload tiers: {details.kvOffloadCpuGibibytes} Gi host memory{details.kvOffloadStorageDefaultGibibytes !==
							null
								? ` + ${details.kvOffloadStorageDefaultGibibytes} Gi disk`
								: ''}.
						</p>
					{/if}
					{#if details.provisional}
						<p class="mt-3 text-xs text-amber-600 dark:text-amber-500">
							Provisional: capacity and resources are predictions, not measurements.
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
								No template of this model matches the selected workload, GPU, replicas, KV cache
								offload and routing.
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
		{isPublic}
		object={pendingObject}
		onOpenChangeComplete={(isOpen) => {
			if (!isOpen) pendingTemplate = undefined;
		}}
	/>
{/if}
