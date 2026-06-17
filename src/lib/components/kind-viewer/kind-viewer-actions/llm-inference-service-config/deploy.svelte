<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { BanIcon } from '@lucide/svelte';
	import Rocket from '@lucide/svelte/icons/rocket';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { FormState, FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
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
	import {
		fetchAllGpuNodes as fetchComputeResourceNodes,
		type NodeInfo
	} from '$lib/components/gpu-allocation';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		cluster,
		namespace,
		schema: jsonSchema,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		schema: Schema;
		object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const kserveGroup = 'serving.kserve.io';
	const kserveVersion = 'v1alpha2';
	const serviceKind = 'LLMInferenceService';
	const serviceResource = 'llminferenceservices';

	const steps = Array.from({ length: 4 }, (_, index) => String(index + 1));
	const [firstStep] = steps;

	type GPUDevice = { type: string; node: string };

	function getComputeResources(nodes: NodeInfo[]): GPUDevice[] {
		return nodes.flatMap((node) =>
			node.devices.map((device) => ({
				type: device.type,
				node: node.name
			}))
		);
	}

	function getResourceTopology(devices: GPUDevice[]): Record<string, string[]> {
		const container: Record<string, Set<string>> = {};
		for (const { type, node } of devices) {
			if (!container[type]) {
				container[type] = new Set();
			}
			container[type].add(node);
		}

		const resourceTopology: Record<string, string[]> = {};
		for (const [type, nodes] of Object.entries(container)) {
			resourceTopology[type] = [...nodes];
		}
		return resourceTopology;
	}

	function getWorkloadPlacementSchema(resourceTopology: Record<string, string[]>): Schema {
		const types = Object.keys(resourceTopology);
		return {
			type: 'object',
			properties: {
				type: { type: 'string', title: 'Type', enum: types }
			},
			dependencies: {
				type: {
					oneOf: Object.entries(resourceTopology).map(([type, nodes]) => ({
						properties: {
							type: { enum: [type] },
							node: { type: 'string', title: 'Node', enum: nodes }
						}
					}))
				}
			}
		};
	}

	function getWorkloadPlacementUISchema() {
		return {
			type: {
				'ui:components': {
					stringField: 'enumField',
					selectWidget: 'comboboxWidget'
				}
			},
			node: {
				'ui:components': {
					stringField: 'enumField',
					selectWidget: 'comboboxWidget'
				}
			}
		};
	}

	let values = $state(getInitialValues());
	let currentStep = $state(firstStep);
	let isSubmitting = $state(false);
	let metadataFormReference: FormState<FormValue> | null = $state(null);
	let open = $state(false);

	let value = $derived(stringify(values));
	const currentIndex = $derived(steps.indexOf(currentStep));

	function getInitialValues() {
		return {
			apiVersion: `${kserveGroup}/${kserveVersion}`,
			kind: serviceKind,
			metadata: {},
			spec: {}
		};
	}
	function initiate() {
		values = getInitialValues();
		currentStep = firstStep;
		isSubmitting = false;
		metadataFormReference = null;
	}
	function handleNext() {
		currentStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
	}
	function handlePrevious() {
		currentStep = steps[Math.max(currentIndex - 1, 0)];
	}
</script>

{#if !page.data.isRestricted}
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
					<Item.Title class="text-xl font-bold">{serviceKind}</Item.Title>
				</Item.Content>
			</Item.Root>
			<Tabs.Root value={currentStep}>
				<Tabs.Content value={steps[0]}>
					<Form
						bind:reference={metadataFormReference}
						schema={{
							...lodash.omit(lodash.get(jsonSchema, 'properties.metadata') as Schema, [
								'properties',
								'required'
							]),
							title: 'Metadata',
							required: [
								...(lodash.get(jsonSchema, 'properties.metadata.required', []) as string[]),
								'name'
							],
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
						initialValue={{}}
						handleSubmit={{
							posthook: (form: FormState<FormValue>) => {
								const formValue = getValueSnapshot(form);

								lodash.set(values, 'metadata', {
									name: lodash.get(formValue, ['name'], ''),
									namespace,
									labels: lodash.get(object, ['metadata', 'labels'], {}),
									annotations: lodash.get(object, ['metadata', 'annotations'], {})
								});

								lodash.update(values, ['spec', 'baseRefs'], (references = []) => [
									...references,
									{ name: lodash.get(object, ['metadata', 'name'], '') }
								]);

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
				</Tabs.Content>

				<Tabs.Content value={steps[1]}>
					<Form
						schema={{
							title: 'Model',
							...(lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.model') as Schema,
								['properties']
							) as Schema),
							properties: {
								uri: {
									title: 'URI',
									description:
										'Override the default model source to load weights from a specific location — for example, a private OCI registry, a Hugging Face repository, or an S3-compatible bucket. Leave unchanged to use the platform default.',
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.model.properties.uri'
										) as Schema,
										['description']
									)
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
						initialValue={{ uri: lodash.get(object, 'spec.model.uri', '') } as FormValue}
						handleSubmit={{
							posthook: (form) => {
								const formValue = getValueSnapshot(form);

								lodash.set(values, ['spec', 'model'], {
									...lodash.omit(lodash.get(object, ['spec', 'model'], {}), ['uri']),
									uri: lodash.get(formValue, 'uri', '')
								});

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
				</Tabs.Content>

				<Tabs.Content value={steps[2]}>
					{#await fetchComputeResourceNodes(resourceClient, cluster)}
						<Empty.Root>
							<Empty.Header>
								<Empty.Media variant="icon">
									<Spinner />
								</Empty.Media>
								<Empty.Title>Loading</Empty.Title>
							</Empty.Header>
						</Empty.Root>
					{:then computeResourceNodes}
						{@const computeResources = getComputeResources(computeResourceNodes)}
						{@const resourceTopology = getResourceTopology(computeResources)}
						{@const workloadPlacementSchema = getWorkloadPlacementSchema(resourceTopology)}
						{@const workloadPlacementUISchema = getWorkloadPlacementUISchema()}
						{@const isSingleNode =
							lodash.has(object, 'spec.template') && !lodash.has(object, 'spec.prefill')}
						{@const isPrefillDecode =
							lodash.has(object, 'spec.template') && lodash.has(object, 'spec.prefill')}
						{@const title = 'Workload Placement'}
						{@const description = 'Workload Placement'}
						{#if isSingleNode}
							<Form
								schema={{
									title: title,
									description: description,
									...workloadPlacementSchema
								} as Schema}
								uiSchema={{
									'ui:options': {
										translations: {
											submit: 'Next'
										}
									},
									...workloadPlacementUISchema
								} as UiSchemaRoot}
								initialValue={{} as FormValue}
								handleSubmit={{
									posthook: (form) => {
										const value = getValueSnapshot(form);

										const type = lodash.get(value, 'type') as string | undefined;
										if (type) {
											lodash.set(values, ['spec', 'annotations', 'nvidia.com/use-gputype'], type);
										}

										const node = lodash.get(value, 'node') as string | undefined;
										if (node) {
											lodash.set(
												values,
												['spec', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
												node
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
									title: title,
									description: description,
									type: 'object',
									properties: {
										decode: { title: 'Decode', ...workloadPlacementSchema },
										prefill: { title: 'Prefill', ...workloadPlacementSchema }
									}
								} as Schema}
								uiSchema={{
									'ui:options': {
										translations: {
											submit: 'Next'
										}
									},
									decode: {
										...workloadPlacementUISchema
									},
									prefill: {
										...workloadPlacementUISchema
									}
								} as UiSchemaRoot}
								initialValue={{} as FormValue}
								handleSubmit={{
									posthook: (form) => {
										const value = getValueSnapshot(form);

										const decodeType = lodash.get(value, ['decode', 'type']) as string | undefined;
										if (decodeType) {
											lodash.set(
												values,
												['spec', 'annotations', 'nvidia.com/use-gputype'],
												decodeType
											);
										}

										const decodeNode = lodash.get(value, ['decode', 'node']) as string | undefined;
										if (decodeNode) {
											lodash.set(
												values,
												['spec', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
												decodeNode
											);
										}

										const prefillType = lodash.get(value, ['prefill', 'type']) as
											| string
											| undefined;
										if (prefillType) {
											lodash.set(
												values,
												['spec', 'prefill', 'annotations', 'nvidia.com/use-gputype'],
												prefillType
											);
										}

										const prefillNode = lodash.get(value, ['prefill', 'node']) as
											| string
											| undefined;
										if (prefillNode) {
											lodash.set(
												values,
												['spec', 'prefill', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
												prefillNode
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
					{:catch error}
						<Empty.Root>
							<Empty.Header class="**:text-destructive">
								<Empty.Media variant="icon" class="bg-destructive/30">
									<BanIcon />
								</Empty.Media>
								<Empty.Title>Failed to Load Compute Resources.</Empty.Title>
							</Empty.Header>
							<Empty.Content>{(error as Error).message}</Empty.Content>
						</Empty.Root>
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

								let manifest;
								try {
									manifest = load(value);
								} catch {
									toast.error('Invalid YAML syntax. Please check the editor.');
									isSubmitting = false;
									return;
								}

								const name = lodash.get(manifest, ['metadata', 'name'], '');

								toast.promise(
									async () => {
										await resourceClient.create({
											cluster,
											namespace,
											group: kserveGroup,
											version: kserveVersion,
											resource: serviceResource,
											manifest: new TextEncoder().encode(value)
										});
									},
									{
										loading: `Deploying ${serviceKind} ${name}...`,
										success: () => {
											return `Successfully deployed ${serviceKind} ${name}`;
										},
										error: (error) => {
											console.error(`Failed to deploy ${serviceKind} ${name}:`, error);
											return `Failed to deploy ${serviceKind} ${name}: ${(error as ConnectError).message}`;
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
{/if}
