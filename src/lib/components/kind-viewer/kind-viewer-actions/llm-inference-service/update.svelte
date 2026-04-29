<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import FormIcon from '@lucide/svelte/icons/form';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import { fetchAllGpuNodes, type NodeInfo } from '$lib/components/gpu-allocation';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		schema: jsonSchema,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: any;
		object: any;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Container for Data – initialised from the existing object
	let values: any = $state(lodash.cloneDeep(object));

	const systemFields = [
		'clusterName',
		'creationTimestamp',
		'deletionGracePeriodSeconds',
		'deletionTimestamp',
		'finalizers',
		'generateName',
		'generation',
		'initializers',
		'managedFields',
		'ownerReferences',
		'resourceVersion',
		'relationships',
		'selfLink',
		'state',
		'uid'
	];

	let value = $derived.by(() => {
		const filtered = lodash.cloneDeep(values);
		if (filtered.metadata) {
			for (const field of systemFields) {
				delete filtered.metadata[field];
			}
		}
		return stringify(filtered);
	});

	// ===== Faceted GPU selector =====
	type GPUDevice = { uuid: string; type: string; node: string };

	function getAllGPUDevices(nodes: NodeInfo[]): GPUDevice[] {
		return nodes.flatMap((node) =>
			node.devices.map((device) => ({
				uuid: device.id,
				type: device.type,
				node: node.name
			}))
		);
	}

	// Steps Manager (2 steps: GPU selector + YAML review)
	const steps = Array.from({ length: 2 }, (_, index) => String(index + 1));
	const [firstStep] = steps;
	let currentStep = $state(firstStep);
	const currentIndex = $derived(steps.indexOf(currentStep));
	function handleNext() {
		currentStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
	}
	function handlePrevious() {
		currentStep = steps[Math.max(currentIndex - 1, 0)];
	}
	function reset() {
		currentStep = firstStep;
	}

	// Flag for Dialog
	let open = $state(false);
	let isSubmitting = $state(false);
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();
		if (!isOpen) {
			reset();
		}
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<FormIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Update</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		class="max-h-[95vh] min-w-[38vw] overflow-auto"
		onInteractOutside={(e) => e.preventDefault()}
	>
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} class="mt-1 mr-6" />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">{kind}</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep}>
			<!-- Step 1: GPU Selector -->
			<Tabs.Content value={steps[0]}>
				{#await fetchAllGpuNodes(resourceClient, 'cluster-4090')}
					Loading
				{:then allGPUNodes}
					{@const isSingleNode =
						lodash.has(object, 'spec.template') &&
						!lodash.has(object, 'spec.prefill') &&
						!lodash.has(object, 'spec.worker')}
					{@const isPrefillDecodeReplica =
						lodash.has(object, 'spec.template') &&
						lodash.has(object, 'spec.prefill') &&
						!lodash.has(object, 'spec.worker')}
					{@const isPrefillDecodeLeaderWorkerSet =
						lodash.has(object, 'spec.template') &&
						lodash.has(object, 'spec.prefill') &&
						lodash.has(object, 'spec.worker')}
					{@const allGPUDevices = getAllGPUDevices(allGPUNodes)}
					{@const allNodes = new Set(allGPUDevices.map((device) => device.node))}
					{@const allTypes = new Set(allGPUDevices.map((device) => device.type))}
					{@const allUUIDs = new Set(allGPUDevices.map((device) => device.uuid))}
					{#if isSingleNode}
						<Form
							schema={{
								title: 'GPU Selector',
								type: 'object',
								properties: {
									type: {
										title: 'Type',
										type: 'array',
										items: {
											type: 'string',
											enum: [...allTypes]
										}
									},
									node: {
										title: 'Node',
										type: 'array',
										items: {
											type: 'string',
											enum: [...allNodes]
										}
									},
									uuid: {
										title: 'UUID',
										type: 'array',
										items: {
											type: 'string',
											enum: [...allUUIDs]
										}
									}
								}
							}}
							uiSchema={{
								'ui:options': {
									translations: {
										submit: 'Next'
									}
								},
								type: {
									'ui:options': {
										itemTitle: () => null,
										layouts: {
											'array-items': {
												class: 'grid grid-cols-2 gap-3'
											}
										}
									},
									items: {
										'ui:components': {
											stringField: 'enumField',
											selectWidget: 'comboboxWidget'
										}
									}
								},
								node: {
									'ui:options': {
										itemTitle: () => null,
										layouts: {
											'array-items': {
												class: 'grid grid-cols-2 gap-3'
											}
										}
									},
									items: {
										'ui:components': {
											stringField: 'enumField',
											selectWidget: 'comboboxWidget'
										}
									}
								},
								uuid: {
									'ui:options': {
										itemTitle: () => null
									},
									items: {
										'ui:components': {
											stringField: 'enumField',
											selectWidget: 'comboboxWidget'
										}
									}
								}
							} as UiSchemaRoot}
							initialValue={{} as FormValue}
							handleSubmit={{
								posthook: (form) => {
									const formValue = getValueSnapshot(form);
									// Restore original spec.template from object, then apply GPU overrides on top
									lodash.set(
										values,
										['spec', 'template'],
										lodash.get(object, ['spec', 'template'])
									);

									const nodes = lodash.get(formValue, 'node', []) as string[];
									if (nodes.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'spec', 'nodeSelector', 'kubernetes.io/hostname'],
											nodes.join(',')
										);
									}

									const types = lodash.get(formValue, 'type', []) as string[];
									if (types.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gputype'],
											types.join(',')
										);
									}

									const uuids = lodash.get(formValue, 'uuid', []) as string[];
									if (uuids.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gpuuuid'],
											uuids.join(',')
										);
									}

									handleNext();
								}
							}}
						>
							{#snippet actions()}
								<div class="flex w-full items-center justify-between gap-3">
									<Button
										onclick={() => {
											handlePrevious();
										}}
										disabled={currentIndex === 0}
									>
										Previous
									</Button>
									<SubmitButton />
								</div>
							{/snippet}
						</Form>
					{:else if isPrefillDecodeReplica}
						<Form
							schema={{
								title: 'GPU Selector',
								type: 'object',
								properties: {
									decode: {
										title: 'Decode',
										type: 'object',
										properties: {
											type: {
												title: 'Type',
												type: 'array',
												items: { type: 'string', enum: [...allTypes] }
											},
											node: {
												title: 'Node',
												type: 'array',
												items: { type: 'string', enum: [...allNodes] }
											},
											uuid: {
												title: 'UUID',
												type: 'array',
												items: { type: 'string', enum: [...allUUIDs] }
											}
										}
									},
									prefill: {
										title: 'Prefill',
										type: 'object',
										properties: {
											type: {
												title: 'Type',
												type: 'array',
												items: { type: 'string', enum: [...allTypes] }
											},
											node: {
												title: 'Node',
												type: 'array',
												items: { type: 'string', enum: [...allNodes] }
											},
											uuid: {
												title: 'UUID',
												type: 'array',
												items: { type: 'string', enum: [...allUUIDs] }
											}
										}
									}
								}
							}}
							uiSchema={{
								'ui:options': { translations: { submit: 'Next' } },
								prefill: {
									type: {
										'ui:options': {
											itemTitle: () => null,
											layouts: { 'array-items': { class: 'grid grid-cols-2 gap-3' } }
										},
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									},
									node: {
										'ui:options': {
											itemTitle: () => null,
											layouts: { 'array-items': { class: 'grid grid-cols-2 gap-3' } }
										},
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									},
									uuid: {
										'ui:options': { itemTitle: () => null },
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									}
								},
								decode: {
									type: {
										'ui:options': {
											itemTitle: () => null,
											layouts: { 'array-items': { class: 'grid grid-cols-2 gap-3' } }
										},
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									},
									node: {
										'ui:options': {
											itemTitle: () => null,
											layouts: { 'array-items': { class: 'grid grid-cols-2 gap-3' } }
										},
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									},
									uuid: {
										'ui:options': { itemTitle: () => null },
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									}
								}
							} as UiSchemaRoot}
							initialValue={{} as FormValue}
							handleSubmit={{
								posthook: (form) => {
									// Restore originals from object, then apply GPU overrides on top
									lodash.set(
										values,
										['spec', 'template'],
										lodash.get(object, ['spec', 'template'])
									);
									lodash.set(values, ['spec', 'prefill'], lodash.get(object, ['spec', 'prefill']));

									const formValue = getValueSnapshot(form);

									const decodeNodes = lodash.get(formValue, 'decode.node', []) as string[];
									if (decodeNodes.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'spec', 'nodeSelector', 'kubernetes.io/hostname'],
											decodeNodes.join(',')
										);
									}
									const decodeTypes = lodash.get(formValue, 'decode.type', []) as string[];
									if (decodeTypes.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gputype'],
											decodeTypes.join(',')
										);
									}
									const decodeUUIDs = lodash.get(formValue, 'decode.uuid', []) as string[];
									if (decodeUUIDs.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gpuuuid'],
											decodeUUIDs.join(',')
										);
									}

									const prefillNodes = lodash.get(formValue, 'prefill.node', []) as string[];
									if (prefillNodes.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'template',
												'spec',
												'nodeSelector',
												'kubernetes.io/hostname'
											],
											prefillNodes.join(',')
										);
									}
									const prefillTypes = lodash.get(formValue, 'prefill.type', []) as string[];
									if (prefillTypes.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'template',
												'metadata',
												'annotations',
												'nvidia.com/use-gputype'
											],
											prefillTypes.join(',')
										);
									}
									const prefillUUIDs = lodash.get(formValue, 'prefill.uuid', []) as string[];
									if (prefillUUIDs.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'template',
												'metadata',
												'annotations',
												'nvidia.com/use-gpuuuid'
											],
											prefillUUIDs.join(',')
										);
									}

									handleNext();
								}
							}}
						>
							{#snippet actions()}
								<div class="flex w-full items-center justify-between gap-3">
									<Button onclick={() => handlePrevious()} disabled={currentIndex === 0}>
										Previous
									</Button>
									<SubmitButton />
								</div>
							{/snippet}
						</Form>
					{:else if isPrefillDecodeLeaderWorkerSet}
						<Form
							schema={{
								title: 'GPU Selector',
								type: 'object',
								properties: {
									prefillLeader: {
										title: 'Prefill Leader',
										type: 'object',
										properties: {
											type: {
												title: 'Type',
												type: 'array',
												items: { type: 'string', enum: [...allTypes] }
											},
											node: {
												title: 'Node',
												type: 'array',
												items: { type: 'string', enum: [...allNodes] }
											},
											uuid: {
												title: 'UUID',
												type: 'array',
												items: { type: 'string', enum: [...allUUIDs] }
											}
										}
									},
									prefillWorker: {
										title: 'Prefill Worker',
										type: 'object',
										properties: {
											type: {
												title: 'Type',
												type: 'array',
												items: { type: 'string', enum: [...allTypes] }
											},
											node: {
												title: 'Node',
												type: 'array',
												items: { type: 'string', enum: [...allNodes] }
											},
											uuid: {
												title: 'UUID',
												type: 'array',
												items: { type: 'string', enum: [...allUUIDs] }
											}
										}
									},
									decodeLeader: {
										title: 'Decode Leader',
										type: 'object',
										properties: {
											type: {
												title: 'Type',
												type: 'array',
												items: { type: 'string', enum: [...allTypes] }
											},
											node: {
												title: 'Node',
												type: 'array',
												items: { type: 'string', enum: [...allNodes] }
											},
											uuid: {
												title: 'UUID',
												type: 'array',
												items: { type: 'string', enum: [...allUUIDs] }
											}
										}
									},
									decodeWorker: {
										title: 'Decode Worker',
										type: 'object',
										properties: {
											type: {
												title: 'Type',
												type: 'array',
												items: { type: 'string', enum: [...allTypes] }
											},
											node: {
												title: 'Node',
												type: 'array',
												items: { type: 'string', enum: [...allNodes] }
											},
											uuid: {
												title: 'UUID',
												type: 'array',
												items: { type: 'string', enum: [...allUUIDs] }
											}
										}
									}
								}
							}}
							uiSchema={(() => {
								const subUi = (key: string) => ({
									type: {
										'ui:options': {
											itemTitle: () => null,
											layouts: { 'array-items': { class: 'grid grid-cols-2 gap-3' } }
										},
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									},
									node: {
										'ui:options': {
											itemTitle: () => null,
											layouts: { 'array-items': { class: 'grid grid-cols-2 gap-3' } }
										},
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									},
									uuid: {
										'ui:options': { itemTitle: () => null },
										items: {
											'ui:components': { stringField: 'enumField', selectWidget: 'comboboxWidget' }
										}
									}
								});
								return {
									'ui:options': { translations: { submit: 'Next' } },
									decodeLeader: subUi('decodeLeader'),
									decodeWorker: subUi('decodeWorker'),
									prefillLeader: subUi('prefillLeader'),
									prefillWorker: subUi('prefillWorker')
								} as UiSchemaRoot;
							})()}
							initialValue={{} as FormValue}
							handleSubmit={{
								posthook: (form) => {
									// Restore originals from object, then apply GPU overrides on top
									lodash.set(
										values,
										['spec', 'template'],
										lodash.get(object, ['spec', 'template'])
									);
									lodash.set(values, ['spec', 'worker'], lodash.get(object, ['spec', 'worker']));
									lodash.set(values, ['spec', 'prefill'], lodash.get(object, ['spec', 'prefill']));

									const formValue = getValueSnapshot(form);

									// decodeLeader → spec.template
									const decodeLeaderNodes = lodash.get(
										formValue,
										'decodeLeader.node',
										[]
									) as string[];
									if (decodeLeaderNodes.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'spec', 'nodeSelector', 'kubernetes.io/hostname'],
											decodeLeaderNodes.join(',')
										);
									}
									const decodeLeaderTypes = lodash.get(
										formValue,
										'decodeLeader.type',
										[]
									) as string[];
									if (decodeLeaderTypes.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gputype'],
											decodeLeaderTypes.join(',')
										);
									}
									const decodeLeaderUUIDs = lodash.get(
										formValue,
										'decodeLeader.uuid',
										[]
									) as string[];
									if (decodeLeaderUUIDs.length > 0) {
										lodash.set(
											values,
											['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gpuuuid'],
											decodeLeaderUUIDs.join(',')
										);
									}

									// decodeWorker → spec.worker
									const decodeWorkerNodes = lodash.get(
										formValue,
										'decodeWorker.node',
										[]
									) as string[];
									if (decodeWorkerNodes.length > 0) {
										lodash.set(
											values,
											['spec', 'worker', 'spec', 'nodeSelector', 'kubernetes.io/hostname'],
											decodeWorkerNodes.join(',')
										);
									}
									const decodeWorkerTypes = lodash.get(
										formValue,
										'decodeWorker.type',
										[]
									) as string[];
									if (decodeWorkerTypes.length > 0) {
										lodash.set(
											values,
											['spec', 'worker', 'metadata', 'annotations', 'nvidia.com/use-gputype'],
											decodeWorkerTypes.join(',')
										);
									}
									const decodeWorkerUUIDs = lodash.get(
										formValue,
										'decodeWorker.uuid',
										[]
									) as string[];
									if (decodeWorkerUUIDs.length > 0) {
										lodash.set(
											values,
											['spec', 'worker', 'metadata', 'annotations', 'nvidia.com/use-gpuuuid'],
											decodeWorkerUUIDs.join(',')
										);
									}

									// prefillLeader → spec.prefill.template
									const prefillLeaderNodes = lodash.get(
										formValue,
										'prefillLeader.node',
										[]
									) as string[];
									if (prefillLeaderNodes.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'template',
												'spec',
												'nodeSelector',
												'kubernetes.io/hostname'
											],
											prefillLeaderNodes.join(',')
										);
									}
									const prefillLeaderTypes = lodash.get(
										formValue,
										'prefillLeader.type',
										[]
									) as string[];
									if (prefillLeaderTypes.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'template',
												'metadata',
												'annotations',
												'nvidia.com/use-gputype'
											],
											prefillLeaderTypes.join(',')
										);
									}
									const prefillLeaderUUIDs = lodash.get(
										formValue,
										'prefillLeader.uuid',
										[]
									) as string[];
									if (prefillLeaderUUIDs.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'template',
												'metadata',
												'annotations',
												'nvidia.com/use-gpuuuid'
											],
											prefillLeaderUUIDs.join(',')
										);
									}

									// prefillWorker → spec.prefill.worker
									const prefillWorkerNodes = lodash.get(
										formValue,
										'prefillWorker.node',
										[]
									) as string[];
									if (prefillWorkerNodes.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'worker',
												'spec',
												'nodeSelector',
												'kubernetes.io/hostname'
											],
											prefillWorkerNodes.join(',')
										);
									}
									const prefillWorkerTypes = lodash.get(
										formValue,
										'prefillWorker.type',
										[]
									) as string[];
									if (prefillWorkerTypes.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'worker',
												'metadata',
												'annotations',
												'nvidia.com/use-gputype'
											],
											prefillWorkerTypes.join(',')
										);
									}
									const prefillWorkerUUIDs = lodash.get(
										formValue,
										'prefillWorker.uuid',
										[]
									) as string[];
									if (prefillWorkerUUIDs.length > 0) {
										lodash.set(
											values,
											[
												'spec',
												'prefill',
												'worker',
												'metadata',
												'annotations',
												'nvidia.com/use-gpuuuid'
											],
											prefillWorkerUUIDs.join(',')
										);
									}

									handleNext();
								}
							}}
						>
							{#snippet actions()}
								<div class="flex w-full items-center justify-between gap-3">
									<Button onclick={() => handlePrevious()} disabled={currentIndex === 0}>
										Previous
									</Button>
									<SubmitButton />
								</div>
							{/snippet}
						</Form>
					{/if}
				{/await}
			</Tabs.Content>

			<!-- Step 2: YAML Review + Submit -->
			<Tabs.Content value={steps[1]} class="min-h-[77vh]">
				<div class="flex h-full flex-col gap-3">
					<Monaco
						options={{
							language: 'yaml',
							padding: { top: 24 },
							automaticLayout: true,
							folding: true,
							foldingStrategy: 'indentation',
							showFoldingControls: 'always'
						}}
						bind:value
						theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
					/>
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const jsonSchemaValidator = new Ajv({
								allErrors: true,
								strict: false
							});
							const validate = jsonSchemaValidator.compile(jsonSchema);

							const isValid = validate(load(value));

							if (!isValid) {
								console.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

							const name = lodash.get(load(value), 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(value);

									await resourceClient.apply({
										cluster,
										namespace,
										name,
										group,
										version,
										resource,
										manifest,
										fieldManager: 'otterscale-web-ui',
										force: true
									});
								},
								{
									loading: `Updating ${kind} ${name}...`,
									success: () => {
										return `Successfully updated ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to update ${kind} ${name}:`, error);
										return `Failed to update ${kind} ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Update
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
