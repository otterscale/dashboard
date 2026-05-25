<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Rocket from '@lucide/svelte/icons/rocket';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { page } from '$app/state';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import { fetchAllGpuNodes, type NodeInfo } from '$lib/components/gpu-allocation';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		cluster,
		schema: jsonSchema,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		schema: Schema;
		object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const targetGroup = 'serving.kserve.io';
	const targetVersion = 'v1alpha2';
	const targetKind = 'LLMInferenceService';
	const targetResource = 'llminferenceservices';
	const configKind = 'LLMInferenceServiceConfig';
	const configResource = 'llminferenceserviceconfigs';

	const steps = Array.from({ length: 3 }, (_, index) => String(index + 1));
	const [firstStep] = steps;

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

	let values = $state(getInitialValues());
	let currentStep = $state(firstStep);
	let isSubmitting = $state(false);
	let open = $state(false);

	let value = $derived(stringify(values));
	const currentIndex = $derived(steps.indexOf(currentStep));
	const templateName = $derived(lodash.get(object, 'metadata.name', ''));

	function getInitialValues() {
		return {
			apiVersion: `${targetGroup}/${targetVersion}`,
			kind: targetKind,
			metadata: { namespace: page.data.namespace } as FormValue,
			spec: {
				baseRefs: [{ name: '' }],
				model: lodash.get(object, 'spec.model')
			}
		};
	}
	function initiate() {
		values = getInitialValues();
		currentStep = firstStep;
		isSubmitting = false;
	}
	function handleNext() {
		currentStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
	}
	function handlePrevious() {
		currentStep = steps[Math.max(currentIndex - 1, 0)];
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();

		if (isOpen) return;

		initiate();
	}}
>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<Rocket />
				</Item.Media>
				<Item.Content>
					<Item.Title>Deploy</Item.Title>
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
				<Item.Title class="text-xl font-bold">{targetKind}</Item.Title>
				<Item.Description>Deploy a model from template {templateName}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep}>
			<!-- Step 1 — Metadata -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...lodash.omit(lodash.get(jsonSchema, 'properties.metadata') as Schema, 'properties'),
						title: 'Metadata',
						properties: {
							name: {
								...(lodash.get(jsonSchema, 'properties.metadata.properties.name') as Schema),
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
					initialValue={{ namespace: page.data.namespace } as FormValue}
					handleSubmit={{
						posthook: () => {
							lodash.set(
								values,
								['spec', 'baseRefs', 0, 'name'],
								lodash.get(values, ['metadata', 'name'], '')
							);
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

			<!-- Step 2 — GPU Selector -->
			<Tabs.Content value={steps[1]}>
				{#await fetchAllGpuNodes(resourceClient, cluster)}
					Loading
				{:then allGPUNodes}
					{@const allGPUDevices = getAllGPUDevices(allGPUNodes)}
					{@const allNodes = new Set(allGPUDevices.map((device) => device.node))}
					{@const allTypes = new Set(allGPUDevices.map((device) => device.type))}
					{@const allUUIDs = new Set(allGPUDevices.map((device) => device.uuid))}
					{@const isSingleNode =
						lodash.has(object, 'spec.template') && !lodash.has(object, 'spec.prefill')}
					{@const isPrefillDecode =
						lodash.has(object, 'spec.template') && lodash.has(object, 'spec.prefill')}
					{#if isSingleNode}
						<Form
							schema={{
								title: 'GPU Selector',
								type: 'object',
								properties: {
									node: {
										title: 'Node',
										type: 'string',
										enum: [...allNodes]
									},
									type: {
										title: 'Type',
										type: 'array',
										items: {
											type: 'string',
											enum: [...allTypes]
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
										itemTitle: () => null
									},
									items: {
										'ui:components': {
											stringField: 'enumField',
											selectWidget: 'comboboxWidget'
										}
									}
								},
								node: {
									'ui:components': {
										stringField: 'enumField'
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
									lodash.unset(values, ['spec', 'annotations']);
									lodash.unset(values, ['spec', 'prefill']);

									const node = lodash.get(value, 'node', null) as string[];
									if (node) {
										lodash.set(
											values,
											['spec', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
											node
										);
									}

									const types = lodash.get(value, 'type', []) as string[];
									if (types.length > 0) {
										lodash.set(
											values,
											['spec', 'annotations', 'nvidia.com/use-gputype'],
											types.join(',')
										);
									}
									const uuids = lodash.get(value, 'uuid', []) as string[];
									if (uuids.length > 0) {
										lodash.set(
											values,
											['spec', 'annotations', 'nvidia.com/use-gpuuuid'],
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
					{:else if isPrefillDecode}
						<Form
							schema={{
								title: 'GPU Selector',
								type: 'object',
								properties: {
									decode: {
										title: 'Decode',
										type: 'object',
										properties: {
											node: {
												title: 'Node',
												type: 'string',
												enum: [...allNodes]
											},
											type: {
												title: 'Type',
												type: 'array',
												items: {
													type: 'string',
													enum: [...allTypes]
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
											node: {
												title: 'Node',
												type: 'string',
												enum: [...allNodes]
											},
											type: {
												title: 'Type',
												type: 'array',
												items: {
													type: 'string',
													enum: [...allTypes]
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
											itemTitle: () => null
										},
										items: {
											'ui:components': {
												stringField: 'enumField',
												selectWidget: 'comboboxWidget'
											}
										}
									},
									node: {
										'ui:components': {
											stringField: 'enumField'
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
											itemTitle: () => null
										},
										items: {
											'ui:components': {
												stringField: 'enumField',
												selectWidget: 'comboboxWidget'
											}
										}
									},
									node: {
										'ui:components': {
											stringField: 'enumField'
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
									lodash.unset(values, ['spec', 'annotations']);
									lodash.unset(values, ['spec', 'prefill']);

									const value = getValueSnapshot(form);

									const decodeNode = lodash.get(value, 'decode.node', null) as string[];
									if (decodeNode) {
										lodash.set(
											values,
											['spec', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
											decodeNode
										);
									}

									const decodeTypes = lodash.get(value, 'decode.type', []) as string[];
									if (decodeTypes.length > 0) {
										lodash.set(
											values,
											['spec', 'annotations', 'nvidia.com/use-gputype'],
											decodeTypes.join(',')
										);
									}
									const decodeUUIDs = lodash.get(value, 'decode.uuid', []) as string[];
									if (decodeUUIDs.length > 0) {
										lodash.set(
											values,
											['spec', 'annotations', 'nvidia.com/use-gpuuuid'],
											decodeUUIDs.join(',')
										);
									}
									const prefillNode = lodash.get(value, 'prefill.node', null) as string[];
									if (prefillNode) {
										lodash.set(
											values,
											['spec', 'prefill', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
											prefillNode
										);
									}
									const prefillTypes = lodash.get(value, 'prefill.type', []) as string[];
									if (prefillTypes.length > 0) {
										lodash.set(
											values,
											['spec', 'prefill', 'annotations', 'nvidia.com/use-gputype'],
											prefillTypes.join(',')
										);
									}
									const prefillUUIDs = lodash.get(value, 'prefill.uuid', []) as string[];
									if (prefillUUIDs.length > 0) {
										lodash.set(
											values,
											['spec', 'prefill', 'annotations', 'nvidia.com/use-gpuuuid'],
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
					{/if}
				{/await}
			</Tabs.Content>

			<!-- Step 3 — YAML preview -->
			<Tabs.Content value={steps[2]} class="min-h-[77vh]">
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

							const parsed = load(value);
							const name = lodash.get(parsed, 'metadata.name');
							const namespace = lodash.get(parsed, 'metadata.namespace', page.data.namespace);

							toast.promise(
								async () => {
									const configManifest = new TextEncoder().encode(
										stringify({
											apiVersion: `${targetGroup}/${targetVersion}`,
											kind: configKind,
											metadata: { name, namespace },
											spec: lodash.get(object, 'spec')
										})
									);

									await resourceClient.create({
										cluster,
										namespace,
										group: targetGroup,
										version: targetVersion,
										resource: configResource,
										manifest: configManifest
									});

									const manifest = new TextEncoder().encode(value);

									await resourceClient.create({
										cluster,
										namespace,
										group: targetGroup,
										version: targetVersion,
										resource: targetResource,
										manifest
									});
								},
								{
									loading: `Deploying ${targetKind} ${name}...`,
									success: () => {
										return `Successfully deployed ${targetKind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to deploy ${targetKind} ${name}:`, error);
										return `Failed to deploy ${targetKind} ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Deploy
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
