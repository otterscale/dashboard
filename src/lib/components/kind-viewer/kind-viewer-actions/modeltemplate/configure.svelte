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
		clusterGpuTypesFor,
		coerceSelection,
		composeTemplate,
		defaultSelection,
		fitsOnOneNode,
		gpuCountOptions,
		gpuTypeOptions,
		type GpuTypeSummary,
		groupForEntry,
		kvOffloadOptions,
		type ModelGroup,
		type ModelTemplateObject,
		pinClusterGpuType,
		resolveTemplate,
		type Selection,
		summarizeGpuTopology,
		TEMPLATE_LABELS,
		TEMPLATE_ROLES,
		type TemplateVariant,
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
	import { cn } from '$lib/utils';

	/** Which per-template action the picked template is handed to. */
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
		/** Workspace namespace that Copy and Deploy write to. */
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		validate: ValidateFunction;
		/** The model entry; its deployment templates are listed each time the dialog opens. */
		entry: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		open?: boolean;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// The entry alone until its templates arrive; every opening reloads them.
	// svelte-ignore state_referenced_locally
	let model: ModelGroup = $state(groupForEntry(entry, []));
	let templatesLoading = $state(false);
	let templatesError: string | undefined = $state(undefined);
	let loadToken = 0;

	/** Every deployment template in the entry's namespace that carries its model label. */
	async function listTemplates(): Promise<ModelTemplateObject[]> {
		const modelLabel = entry.metadata?.labels?.[TEMPLATE_LABELS.model];
		if (!modelLabel) return [];
		const templates: ModelTemplateObject[] = [];
		let continueToken: string | undefined = undefined;
		do {
			const response = await resourceClient.list({
				cluster,
				namespace: entry.metadata?.namespace,
				group,
				version,
				resource,
				labelSelector: `${TEMPLATE_LABELS.role}=${TEMPLATE_ROLES.deployment},${TEMPLATE_LABELS.model}=${modelLabel}`,
				continue: continueToken
			} as ListRequest);
			continueToken = response.continue;
			for (const item of response.items) {
				if (item.object) templates.push(item.object as unknown as ModelTemplateObject);
			}
		} while (continueToken);
		return templates;
	}

	// A reopening while a list is in flight must not let the older result land.
	async function loadTemplates() {
		const token = ++loadToken;
		templatesLoading = true;
		templatesError = undefined;
		try {
			const templates = await listTemplates();
			if (token !== loadToken) return;
			model = groupForEntry(entry, templates);
			reset();
		} catch (error) {
			if (token !== loadToken) return;
			console.error('Failed to list deployment templates:', error);
			templatesError = error instanceof Error ? error.message : String(error);
		} finally {
			if (token === loadToken) templatesLoading = false;
		}
	}

	const ACTION_LABELS: Record<ConfigureAction, string> = {
		view: 'View',
		copy: 'Copy',
		deploy: 'Deploy'
	};

	// A legacy middleware template only wraps another one, so Copy (like the
	// row menu) does not offer it; the picker then narrows to the standalone ones.
	const candidatesModel: ModelGroup = $derived(
		action === 'copy'
			? { ...model, variants: model.variants.filter((variant) => !variant.middleware) }
			: model
	);

	// Only the initial value: every opening resets it from the current model.
	// svelte-ignore state_referenced_locally
	let selection: Selection = $state(defaultSelection(candidatesModel));
	let tieBreaker: string | undefined = $state(undefined);
	let topology: Promise<GpuTypeSummary[]> = $state(Promise.resolve([]));
	let summaries: GpuTypeSummary[] = $state([]);
	let pendingTemplate: TemplateVariant | undefined = $state(undefined);
	/** The template with its entry's model merged in: what View shows and Copy/Deploy write. */
	let pendingObject: ServingKserveIoV1Alpha2LLMInferenceServiceConfig | undefined =
		$state(undefined);
	let pendingAction: ConfigureAction | undefined = $state(undefined);
	let handoffOpen = $state(false);

	// Every opening starts from the entry alone, the defaults, one fresh list
	// of its templates and one fresh look at the cluster GPUs. The entry row may
	// refresh while the dialog is open; that must not discard the viewer's
	// choices, hence `untrack`.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			model = groupForEntry(entry, []);
			reset();
			summaries = [];
			topology = fetchAllGpuNodes(resourceClient, cluster).then((nodes) => {
				summaries = summarizeGpuTopology(nodes);
				return summaries;
			});
			loadTemplates();
		});
	});

	const workloads = $derived(workloadOptions(candidatesModel));
	const gpuTypes = $derived(gpuTypeOptions(candidatesModel, selection.workload));
	const counts = $derived(gpuCountOptions(candidatesModel, selection.workload, selection.gpuType));
	const kv = $derived(
		kvOffloadOptions(candidatesModel, selection.workload, selection.gpuType, selection.gpuCount)
	);
	const resolution = $derived(resolveTemplate(candidatesModel, selection));
	const candidates = $derived(resolution.kind === 'ambiguous' ? resolution.candidates : []);
	const chosen = $derived(
		resolution.kind === 'match'
			? resolution.variant
			: candidates.find((candidate) => candidate.name === tieBreaker)
	);

	/** Cluster GPU models the selected template GPU names; one exact hit can be pinned. */
	const clusterMatches = $derived(clusterGpuTypesFor(selection.gpuType, summaries));
	const pinnedClusterType = $derived(
		pinClusterGpuType(
			selection.gpuType,
			summaries.map((summary) => summary.type)
		)
	);

	function reset() {
		selection = defaultSelection(candidatesModel);
		tieBreaker = undefined;
	}

	function update(patch: Partial<Selection>) {
		selection = coerceSelection(candidatesModel, { ...selection, ...patch });
		tieBreaker = undefined;
	}

	function proceed() {
		if (!chosen) return;
		pendingTemplate = chosen;
		pendingObject = composeTemplate(
			model,
			chosen
		) as ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		pendingAction = action;
		// The follow-up dialog opens once this one has finished closing (see onOpenChangeComplete).
		open = false;
	}

	function describeUnmet(unmet: Array<keyof Selection>): string {
		const names: Record<keyof Selection, string> = {
			workload: `the ${workloadLabel(selection.workload)} workload`,
			gpuType: `the ${selection.gpuType} GPU`,
			gpuCount: `${selection.gpuCount} GPUs`,
			kvOffload: selection.kvOffload ? 'KV cache offload' : 'running without KV cache offload'
		};
		return unmet.map((key) => names[key]).join(', ');
	}

	function formatDuration(milliseconds: number | null): string {
		if (milliseconds === null) return '–';
		return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(1)} s` : `${milliseconds} ms`;
	}

	function formatTokens(tokens: number | null): string {
		if (tokens === null) return '–';
		return tokens >= 1024 && tokens % 1024 === 0 ? `${tokens / 1024}K` : String(tokens);
	}

	/** Facts of every template sharing this workload, for the radio description. */
	function workloadFacts(workload: string): string {
		const variants = candidatesModel.variants.filter((variant) => variant.workload === workload);
		const lengths = [
			...new Set(
				variants
					.map((variant) => variant.details.maxModelLen)
					.filter((length): length is number => length !== null)
			)
		];
		return lengths.length ? `${lengths.map(formatTokens).join(' / ')} context` : '';
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
					<Dialog.Title class="truncate">{ACTION_LABELS[action]} — {model.modelName}</Dialog.Title>
					<Dialog.Description class="truncate">
						{model.modelUri ?? `${model.variants.length} templates`}
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
		{:else if candidatesModel.variants.length === 0}
			<Item.Root class="items-start rounded-lg bg-muted p-4">
				<Item.Media variant="icon" class="text-amber-600 dark:text-amber-500">
					<TriangleAlertIcon />
				</Item.Media>
				<Item.Content class="text-left">
					<Item.Title>
						{model.variants.length === 0 ? 'No deployment templates' : 'Nothing to copy'}
					</Item.Title>
					<Item.Description>
						{#if model.variants.length === 0 && model.skipped.length}
							Every deployment template of this model is missing a required label.
						{:else if model.variants.length === 0}
							This model is declared, but no deployment template carries its model label yet.
						{:else}
							Every template of this model wraps the KV cache middleware, which is not copied on its
							own.
						{/if}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{:else}
			<Field.Group class="gap-6">
				<!-- 1. Workload -->
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

				<!-- 2. GPU model and count -->
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="gpu-type">Type</Field.Label>
						<Select.Root
							type="single"
							value={selection.gpuType}
							onValueChange={(value) => update({ gpuType: value })}
						>
							<Select.Trigger id="gpu-type" class="w-full">
								<span class="truncate">{selection.gpuType}</span>
							</Select.Trigger>
							<Select.Content>
								{#each gpuTypes as gpuType (gpuType)}
									{@const matches = clusterGpuTypesFor(gpuType, summaries)}
									<Select.Item value={gpuType} label={gpuType}>
										<div class="flex min-w-0 flex-col">
											<span class="truncate">{gpuType}</span>
											{#if summaries.length}
												<span
													class={cn(
														'text-xs text-muted-foreground',
														matches.length === 0 && 'text-amber-600 dark:text-amber-500'
													)}
												>
													{#if matches.length === 0}
														Not found in this cluster
													{:else}
														{matches.map((match) => match.type).join(', ')}
													{/if}
												</span>
											{/if}
										</div>
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						{#await topology}
							<Field.Description class="flex items-center gap-2">
								<Spinner class="size-3" />
								Reading cluster GPUs
							</Field.Description>
						{:then}
							{#if summaries.length === 0}
								<Field.Description>No GPUs registered in this cluster.</Field.Description>
							{:else if clusterMatches.length === 0}
								<Field.Description class="text-amber-600 dark:text-amber-500">
									This cluster has no {selection.gpuType} cards.
								</Field.Description>
							{:else}
								{@const fits = clusterMatches.some((match) =>
									fitsOnOneNode(match, selection.gpuCount)
								)}
								<Field.Description class={cn(!fits && 'text-amber-600 dark:text-amber-500')}>
									{clusterMatches.reduce((sum, match) => sum + match.totalCards, 0)} cards on
									{clusterMatches.reduce((sum, match) => sum + match.nodeCount, 0)} nodes, up to
									{Math.max(...clusterMatches.map((match) => match.maxPerNode))} per node.
									{#if !fits}
										No node holds {selection.gpuCount}.
									{/if}
									{#if action === 'deploy' && pinnedClusterType}
										Pinned in the next step.
									{/if}
								</Field.Description>
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
							value={String(selection.gpuCount)}
							onValueChange={(value) => update({ gpuCount: Number(value) })}
						>
							<Select.Trigger id="gpu-count" class="w-full">
								<span class="truncate">{selection.gpuCount} GPU</span>
							</Select.Trigger>
							<Select.Content>
								{#each counts as count (count)}
									<Select.Item value={String(count)} label={`${count} GPU`} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>

				<!-- 3. KV cache offload -->
				<Field.Field orientation="horizontal">
					<Field.Content>
						<Field.Label for="kv-offload">KV cache offload</Field.Label>
						<Field.Description>
							{#if kv.on && kv.off}
								Keep evicted KV cache in host memory and on disk, so repeated prefixes skip prefill.
							{:else if kv.on}
								Every template for this choice offloads the KV cache.
							{:else}
								No template for this choice offloads the KV cache.
							{/if}
						</Field.Description>
					</Field.Content>
					<Switch
						id="kv-offload"
						checked={selection.kvOffload}
						onCheckedChange={(checked) => update({ kvOffload: checked })}
						disabled={!(kv.on && kv.off)}
					/>
				</Field.Field>
			</Field.Group>

			<!-- Performance of the resolved template -->
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
				{:else if resolution.kind === 'ambiguous'}
					<Field.Field>
						<Field.Description>
							{candidates.length} templates fit this choice. Pick the one to {action}.
						</Field.Description>
						<Select.Root
							type="single"
							value={tieBreaker ?? ''}
							onValueChange={(value) => (tieBreaker = value || undefined)}
						>
							<Select.Trigger id="template" class="w-full" aria-label="Template">
								<span class="truncate font-mono">{tieBreaker ?? 'Choose a template'}</span>
							</Select.Trigger>
							<Select.Content>
								{#each candidates as candidate (candidate.name)}
									<Select.Item value={candidate.name} label={candidate.name} class="font-mono" />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				{:else if resolution.kind === 'none'}
					<Item.Root class="items-start p-0">
						<Item.Media variant="icon" class="text-amber-600 dark:text-amber-500">
							<TriangleAlertIcon />
						</Item.Media>
						<Item.Content class="text-left">
							<Item.Title>No matching template</Item.Title>
							<Item.Description>
								None of the {candidatesModel.variants.length} templates for this model supports
								{describeUnmet(resolution.unmet)}.
							</Item.Description>
						</Item.Content>
					</Item.Root>
				{/if}
			</div>
		{/if}

		{#if !templatesLoading && !templatesError && model.skipped.length}
			<div class="text-xs text-muted-foreground">
				<p>
					Skipped {model.skipped.length}
					{model.skipped.length === 1 ? 'template' : 'templates'} with missing or invalid labels:
				</p>
				<ul class="mt-1 space-y-0.5">
					{#each model.skipped as template (template.name)}
						<li>
							<span class="font-mono">{template.name}</span> — {template.labels.join(', ')}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button disabled={!chosen} onclick={proceed}>{ACTION_LABELS[action]}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- The follow-up dialog lives outside the picker, so closing the picker never unmounts it. -->
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
