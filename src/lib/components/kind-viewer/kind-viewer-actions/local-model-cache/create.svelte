<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Plus from '@lucide/svelte/icons/plus';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
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
		schema: jsonSchema
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: any;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Container for Data
	let values: any = $state({
		apiVersion: `${group}/${version}`,
		kind,
		metadata: {},
		spec: {
			baseRefs: []
		}
	});
	let value = $derived(stringify(values));

	// ===== Faceted GPU selector =====
	type GPUDevice = { uuid: string; type: string; node: string };

	// Flatten NodeInfo[] into a single Device[] (the source of truth).
	function getAllGPUDevices(nodes: NodeInfo[]): GPUDevice[] {
		return nodes.flatMap((node) =>
			node.devices.map((device) => ({
				uuid: device.id,
				type: device.type,
				node: node.name
			}))
		);
	}

	// Steps Manager
	const steps = Array.from({ length: 4 }, (_, index) => String(index + 1));
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

	let selectedTemplateName = $state('');
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			reset();
		}
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="icon">
				<Plus />
			</Button>
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
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.omit(lodash.get(jsonSchema, 'properties.metadata'), 'properties') as any),
						title: 'Metadata',
						properties: {
							name: {
								...lodash.get(jsonSchema, 'properties.metadata.properties.name'),
								title: 'Name'
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						namespace: namespace
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['metadata']}
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
			</Tabs.Content>

			<Tabs.Content value={steps[1]}>
				{#await resourceClient.list( { cluster, namespace, group: 'serving.kserve.io', version: 'v1alpha2', resource: 'llminferenceserviceconfigs' } )}
					Loading
				{:then response}
					{@const templateNames = response.items.map((item: any) =>
						lodash.get(item.object, 'metadata.name')
					)}
					<Form
						schema={{
							title: 'Template',
							description: 'template',
							type: 'string',
							enum: templateNames
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							},
							'ui:components': {
								stringField: 'enumField',
								selectWidget: 'comboboxWidget'
							}
						} as UiSchemaRoot}
						initialValue={{} as FormValue}
						handleSubmit={{
							posthook: () => {
								values.spec.baseRefs = selectedTemplateName ? [{ name: selectedTemplateName }] : [];
								handleNext();
							}
						}}
						bind:values={selectedTemplateName}
					>
						{#snippet actions()}
							<div class="flex w-full items-center justify-between gap-3">
								<Button
									onclick={() => {
										handlePrevious();
									}}
								>
									Previous
								</Button>
								<SubmitButton />
							</div>
						{/snippet}
					</Form>
				{/await}
			</Tabs.Content>

			<Tabs.Content value={steps[2]}>
				<!-- <pre>{JSON.stringify(nodeSelector, null, 2)}</pre> -->
				{#await fetchAllGpuNodes(resourceClient, cluster)}
					Loading
				{:then allGPUNodes}
					{@const allGPUDevices = getAllGPUDevices(allGPUNodes)}
					{@const allNodes = new Set(allGPUDevices.map((device) => device.node))}
					{@const allTypes = new Set(allGPUDevices.map((device) => device.type))}
					{@const allUUIDs = new Set(allGPUDevices.map((device) => device.uuid))}
					{#await resourceClient.get( { cluster, namespace, group: 'serving.kserve.io', version: 'v1alpha2', resource: 'llminferenceserviceconfigs', name: selectedTemplateName } )}
						Loading
					{:then response}
						{@const isSingleNode =
							lodash.has(response.object, 'spec.template') &&
							!lodash.has(response.object, 'spec.prefill') &&
							!lodash.has(response.object, 'spec.worker')}
						{@const isPrefillDecodeReplica =
							lodash.has(response.object, 'spec.template') &&
							lodash.has(response.object, 'spec.prefill') &&
							!lodash.has(response.object, 'spec.worker')}
						{@const isPrefillDecodeLeaderWorkerSet =
							lodash.has(response.object, 'spec.template') &&
							lodash.has(response.object, 'spec.prefill') &&
							lodash.has(response.object, 'spec.worker')}
						{#key selectedTemplateName}
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
											const value = getValueSnapshot(form);
											lodash.unset(values, ['spec', 'template']);

											const nodes = lodash.get(value, 'node', []) as string[];
											if (nodes.length > 0) {
												lodash.set(
													values,
													['spec', 'template', 'spec', 'nodeSelector', 'kubernetes.io/hostname'],
													nodes.join(',')
												);
											}

											const types = lodash.get(value, 'type', []) as string[];
											if (types.length > 0) {
												lodash.set(
													values,
													['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gputype'],
													types.join(',')
												);
											}
											const uuids = lodash.get(value, 'uuid', []) as string[];
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
											},
											prefill: {
												title: 'Prefill',
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
											}
										}
									}}
									uiSchema={{
										'ui:options': {
											translations: {
												submit: 'Next'
											}
										},
										prefill: {
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
										},
										decode: {
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
										}
									} as UiSchemaRoot}
									initialValue={{} as FormValue}
									handleSubmit={{
										posthook: (form) => {
											lodash.unset(values, ['spec', 'template']);
											lodash.unset(values, ['spec', 'prefill']);

											const value = getValueSnapshot(form);

											const decodeNodes = lodash.get(value, 'decode.node', []) as string[];
											if (decodeNodes.length > 0) {
												lodash.set(
													values,
													['spec', 'template', 'spec', 'nodeSelector', 'kubernetes.io/hostname'],
													decodeNodes.join(',')
												);
											}

											const decodeTypes = lodash.get(value, 'decode.type', []) as string[];
											if (decodeTypes.length > 0) {
												lodash.set(
													values,
													['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gputype'],
													decodeTypes.join(',')
												);
											}
											const decodeUUIDs = lodash.get(value, 'decode.uuid', []) as string[];
											if (decodeUUIDs.length > 0) {
												lodash.set(
													values,
													['spec', 'template', 'metadata', 'annotations', 'nvidia.com/use-gpuuuid'],
													decodeUUIDs.join(',')
												);
											}
											const prefillNodes = lodash.get(value, 'prefill.node', []) as string[];
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
											const prefillTypes = lodash.get(value, 'prefill.type', []) as string[];
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
											const prefillUUIDs = lodash.get(value, 'prefill.uuid', []) as string[];
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
											<Button
												onclick={() => {
													handlePrevious();
												}}
											>
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
											},
											prefillWorker: {
												title: 'Prefill Worker',
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
											},
											decodeLeader: {
												title: 'Decode Leader',
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
											},
											decodeWorker: {
												title: 'Decode Worker',
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
											}
										}
									}}
									uiSchema={{
										'ui:options': {
											translations: {
												submit: 'Next'
											}
										},
										decodeLeader: {
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
										},
										decodeWorker: {
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
										},
										prefillLeader: {
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
										},
										prefillWorker: {
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
										}
									} as UiSchemaRoot}
									initialValue={{} as FormValue}
									handleSubmit={{
										posthook: (form) => {
											lodash.unset(values, ['spec', 'template']);
											lodash.unset(values, ['spec', 'worker']);
											lodash.unset(values, ['spec', 'prefill']);

											const value = getValueSnapshot(form);

											const decodeLeaderNodes = lodash.get(
												value,
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
												value,
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
												value,
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
											const decodeWorkerNodes = lodash.get(
												value,
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
												value,
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
												value,
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
											const prefillLeaderNodes = lodash.get(
												value,
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
												value,
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
												value,
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
											const prefillWorkerNodes = lodash.get(
												value,
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
												value,
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
												value,
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
											<Button
												onclick={() => {
													handlePrevious();
												}}
											>
												Previous
											</Button>
											<SubmitButton />
										</div>
									{/snippet}
								</Form>
							{/if}
						{/key}
					{/await}
				{/await}
			</Tabs.Content>

			<Tabs.Content value={steps[3]} class="min-h-[77vh]">
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

									await resourceClient.create({
										cluster,
										namespace,
										group,
										version,
										resource,
										manifest
									});
								},
								{
									loading: `Creating ${kind} ${name}...`,
									success: () => {
										return `Successfully created ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to create ${kind} ${name}:`, error);
										return `Failed to create ${kind} ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Create
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
