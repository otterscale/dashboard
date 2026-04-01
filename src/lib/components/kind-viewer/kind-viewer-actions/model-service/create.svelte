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
	import { getContext, onMount } from 'svelte';
	import { SvelteMap, SvelteSet, SvelteURL } from 'svelte/reactivity';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { env as publicEnv } from '$env/dynamic/public';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import ComboboxWidget from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import { fetchAllGpuNodes, type NodeInfo } from '$lib/components/gpu-allocation';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { ArtifactType } from '$lib/server/harbor';

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
			accelerator: {},
			decode: {},
			engine: {},
			model: {},
			routingProxy: {
				image: 'ghcr.io/llm-d/llm-d-routing-sidecar:v0.6.0'
			}
		}
	});
	let value = $derived(stringify(values));

	let mode: any = $state({});
	let placement: any = $state({});

	// Steps Manager
	const steps = Array.from({ length: 7 }, (_, index) => String(index + 1));
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

	const imageToArtifact = new SvelteMap<string, ArtifactType>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	function fetchModelArtifacts(): Promise<{ label: string; value: string }[]> {
		return new Promise((resolve) => {
			if (timer) clearTimeout(timer);

			timer = setTimeout(async () => {
				try {
					const response = await fetch(`/bff/harbor/models?project=${namespace}`);
					if (response.ok) {
						const harborUrl = new SvelteURL(publicEnv.PUBLIC_HARBOR_URL ?? '');
						const modelArtifacts: ArtifactType[] = await response.json();

						const modelRepositories: string[] = [];
						modelArtifacts.forEach((artifact) => {
							if (
								Array.isArray(artifact.tags) &&
								artifact.tags.some((tag) => tag.name === 'latest')
							) {
								imageToArtifact.set(
									`${harborUrl.host}/${artifact.repository_name}:latest`,
									artifact
								);
								modelRepositories.push(artifact.repository_name);
							}
						});

						resolve(
							modelRepositories.map((repositoryName: string) => ({
								label: repositoryName,
								value: `${harborUrl.host}/${repositoryName}:latest`
							}))
						);
					} else {
						console.error('Failed to fetch models:', response.statusText);
						resolve([]);
					}
				} catch (error) {
					console.error('Error fetching models:', error);
					resolve([]);
				}
			}, 300);
		});
	}
	let gpuNodes: NodeInfo[] = $state([]);

	onMount(async () => {
		try {
			gpuNodes = await fetchAllGpuNodes(resourceClient, cluster);
		} catch {
			console.error('Failed to fetch GPU nodes');
		}
	});

	const nodeNameOptions = $derived(
		gpuNodes.map((n) => ({
			label: `${n.name} (${n.devices.length} GPUs)`,
			value: n.name
		}))
	);

	const gpuTypeOptions = $derived(() => {
		const types = new SvelteSet<string>();
		for (const node of gpuNodes) {
			for (const device of node.devices) {
				if (device.type) types.add(device.type);
			}
		}
		return [...types].map((t) => ({ label: t, value: t }));
	});

	const gpuUuidOptions = $derived(
		gpuNodes.flatMap((node) =>
			node.devices.map((device) => ({
				label: `${node.name} - GPU ${device.index}`,
				value: device.id
			}))
		)
	);
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
	<Dialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
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
				<Form
					schema={{
						...(lodash.omit(lodash.get(jsonSchema, 'properties.spec.properties.model'), [
							'required',
							'properties'
						]) as any),
						title: 'Model',
						properties: {
							image: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.model.properties.image'
								) as any),
								title: 'Image'
							}
						},
						required: lodash
							.get(jsonSchema, 'properties.spec.properties.model.required')
							.filter((property: string) => property !== 'name')
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						image: {
							'ui:components': {
								textWidget: ComboboxWidget
							},
							'ui:options': {
								TailoredComboboxEnumerations: fetchModelArtifacts,
								TailoredComboboxVisibility: 10,
								TailoredComboboxInput: {
									placeholder: 'Name'
								},
								TailoredComboboxEmptyText: 'No names available.'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						image: null
					} as FormValue}
					handleSubmit={{
						posthook: (form) => {
							handleNext();

							const formValue = getValueSnapshot(form);
							const image = String(lodash.get(formValue, 'image'));
							const artifact = imageToArtifact.get(image) as ArtifactType;
							if (artifact) {
								const extraAttributes = artifact.extra_attrs;
								const name = [
									...(lodash.get(extraAttributes, 'descriptor.authors') as []),
									lodash.get(extraAttributes, 'descriptor.name')
								].join('/');

								lodash.set(values, 'spec.model.name', name);
							}
						}
					}}
					bind:values={values['spec']['model']}
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
				<Form
					schema={{
						...(lodash.get(jsonSchema, 'properties.spec.properties.accelerator') as any),
						title: 'Accelerator'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						type: {
							'ui:components': {
								stringField: 'enumField',
								selectWidget: 'comboboxWidget'
							},
							'ui:options': {
								disabledEnumValues: lodash
									.get(jsonSchema, 'properties.spec.properties.accelerator.properties.type.enum')
									.filter((accelerator: string) => accelerator !== 'nvidia')
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						type: 'nvidia'
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['accelerator']}
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

			<Tabs.Content value={steps[3]}>
				{@const decodeSchema = {
					...(lodash.omit(
						lodash.get(jsonSchema, 'properties.spec.properties.decode'),
						'properties'
					) as any),
					title: 'Decode',
					properties: {
						parallelism: {
							...(lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.decode.properties.parallelism'),
								['description', 'properties']
							) as any),
							properties: {
								tensor: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.decode.properties.parallelism.properties.tensor'
									),
									title: 'Tensor'
								}
							}
						},
						replicas: {
							...lodash.get(jsonSchema, 'properties.spec.properties.decode.properties.replicas'),
							title: 'Replicas'
						},
						resources: {
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.decode.properties.resources'),
								'properties'
							),
							title: 'Resources',
							properties: {
								requests: {
									...(lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.decode.properties.resources.properties.requests'
										),
										'additionalProperties'
									) as any),
									title: 'Requests',
									properties: {
										'nvidia.com/gpumem': {
											title: 'GPU Memory',
											type: 'string'
										}
									}
								}
							}
						}
					}
				}}
				{@const prefillSchema = {
					...(lodash.omit(
						lodash.get(jsonSchema, 'properties.spec.properties.prefill'),
						'properties'
					) as any),
					title: 'Prefill',
					properties: {
						parallelism: {
							...(lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.prefill.properties.parallelism'),
								['description', 'properties']
							) as any),
							properties: {
								tensor: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.prefill.properties.parallelism.properties.tensor'
									),
									title: 'Tensor'
								}
							}
						},
						replicas: {
							...lodash.get(jsonSchema, 'properties.spec.properties.prefill.properties.replicas'),
							title: 'Replicas'
						},
						resources: {
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.prefill.properties.resources'),
								'properties'
							),
							title: 'Resources',
							properties: {
								requests: {
									...(lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.prefill.properties.resources.properties.requests'
										),
										'additionalProperties'
									) as any),
									title: 'Requests',
									properties: {
										'nvidia.com/gpumem': {
											title: 'GPU Memory',
											type: 'string'
										}
									}
								}
							}
						}
					}
				}}
				<Form
					schema={{
						type: 'object',
						properties: {
							mode: {
								title: 'Mode',
								type: 'string',
								enum: ['Intelligent', 'Disaggregation'],
								default: 'Intelligent'
							}
						},
						allOf: [
							{
								if: {
									properties: {
										mode: {
											const: 'Intelligent'
										}
									}
								},
								then: {
									type: 'object',
									properties: {
										decode: decodeSchema
									},
									required: ['decode']
								}
							},
							{
								if: {
									properties: {
										mode: {
											const: 'Disaggregation'
										}
									}
								},
								then: {
									type: 'object',
									properties: {
										decode: decodeSchema,
										prefill: prefillSchema
									},
									required: ['decode', 'prefill']
								}
							},
							{
								required: ['mode']
							}
						]
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						mode: {
							'ui:components': {
								stringField: 'enumField'
							}
						},
						decode: {
							parallelism: {
								'ui:options': {
									hideTitle: true
								}
							},
							resources: {
								'ui:options': {
									hideTitle: true
								}
							}
						},
						prefill: {
							parallelism: {
								'ui:options': {
									hideTitle: true
								}
							},
							resources: {
								'ui:options': {
									hideTitle: true
								}
							}
						}
					} as UiSchemaRoot}
					transformer={(value: FormValue) => {
						const formValue: any = value;
						lodash.set(
							formValue,
							['decode', 'resources', 'requests', 'nvidia.com/gpu'],
							lodash.get(formValue, 'decode.parallelism.tensor')
						);
						lodash.set(
							formValue,
							['decode', 'resources', 'limits', 'nvidia.com/gpu'],
							lodash.get(formValue, ['decode', 'resources', 'requests', 'nvidia.com/gpu'])
						);
						lodash.set(
							formValue,
							['decode', 'resources', 'limits', 'nvidia.com/gpumem'],
							lodash.get(formValue, ['decode', 'resources', 'requests', 'nvidia.com/gpumem'])
						);

						if (lodash.get(formValue, 'mode') === 'Disaggregation') {
							lodash.set(
								formValue,
								['prefill', 'resources', 'requests', 'nvidia.com/gpu'],
								lodash.get(formValue, 'prefill.parallelism.tensor')
							);
							lodash.set(
								formValue,
								['prefill', 'resources', 'limits', 'nvidia.com/gpu'],
								lodash.get(formValue, ['prefill', 'resources', 'requests', 'nvidia.com/gpu'])
							);
							lodash.set(
								formValue,
								['prefill', 'resources', 'limits', 'nvidia.com/gpumem'],
								lodash.get(formValue, ['prefill', 'resources', 'requests', 'nvidia.com/gpumem'])
							);
						} else {
							lodash.set(values, 'spec.prefill.resources', {});
						}
						return formValue;
					}}
					initialValue={{
						mode: 'Intelligent'
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
							lodash.set(values, 'spec.decode', lodash.get(mode, 'decode'));
							if (lodash.get(mode, 'mode') === 'Disaggregation') {
								lodash.set(values, 'spec.prefill', lodash.get(mode, 'prefill'));
							} else {
								lodash.unset(values, 'spec.prefill');
							}
						}
					}}
					bind:values={mode}
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

			<Tabs.Content value={steps[4]}>
				<Form
					schema={{
						type: 'object',
						title: 'GPU Placement',
						description:
							'Configure GPU/Node scheduling constraints (HAMI). Leave all fields empty for automatic scheduling. GPU Type and UUID support multiple AND-combined selections.',
						properties: {
							nodeName: {
								title: 'Node',
								type: 'string',
								description: 'Select a GPU node (nodeSelector: kubernetes.io/hostname)',
								enum: nodeNameOptions.map((o) => o.value)
							},
							gpuType: {
								title: 'GPU Type',
								type: 'array',
								description: 'Select GPU types (annotation: nvidia.com/use-gputype)',
								items: {
									type: 'string',
									enum: gpuTypeOptions().map((o) => o.value)
								},
								uniqueItems: true
							},
							gpuUuid: {
								title: 'GPU UUID',
								type: 'array',
								description: 'Select GPU UUIDs (annotation: nvidia.com/use-gpuuuid)',
								items: {
									type: 'string',
									enum: gpuUuidOptions.map((o) => o.value)
								},
								uniqueItems: true
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						nodeName: {
							'ui:components': {
								stringField: 'enumField'
							},
							'ui:options': {
								useLabel: true,
								title: 'Node'
							}
						},
						gpuType: {
							'ui:components': {
								arrayField: 'multiEnumField',
								checkboxesWidget: 'multiSelectWidget'
							},
							'ui:options': {
								useLabel: true,
								title: 'GPU Type'
							}
						},
						gpuUuid: {
							'ui:components': {
								arrayField: 'multiEnumField',
								checkboxesWidget: 'multiSelectWidget'
							},
							'ui:options': {
								useLabel: true,
								title: 'GPU UUID',
								enumNames: gpuUuidOptions.map((o) => o.label)
							}
						}
					} as UiSchemaRoot}
					initialValue={{} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();

							const nodeName: string = lodash.get(placement, 'nodeName', '');
							const gpuTypes: string[] = lodash.get(placement, 'gpuType', []);
							const gpuUuids: string[] = lodash.get(placement, 'gpuUuid', []);

							// Clear any previous placement values
							lodash.unset(values, 'spec.decode.nodeSelector');
							lodash.unset(values, 'spec.decode.annotations');
							lodash.unset(values, 'spec.prefill.nodeSelector');
							lodash.unset(values, 'spec.prefill.annotations');

							const isDisaggregation = lodash.get(mode, 'mode') === 'Disaggregation';

							// Nodes → nodeSelector
							if (nodeName) {
								const selector = { 'kubernetes.io/hostname': nodeName };
								lodash.set(values, 'spec.decode.nodeSelector', selector);
								if (isDisaggregation) {
									lodash.set(values, 'spec.prefill.nodeSelector', selector);
								}
							}

							// GPU Type & GPU UUID → spec.decode.annotations / spec.prefill.annotations (HAMI spec)
							const annotations: Record<string, string> = {};
							if (gpuTypes.length > 0) {
								annotations['nvidia.com/use-gputype'] = gpuTypes.join(',');
							}
							if (gpuUuids.length > 0) {
								annotations['nvidia.com/use-gpuuuid'] = gpuUuids.join(',');
							}

							if (Object.keys(annotations).length > 0) {
								lodash.set(values, 'spec.decode.annotations', annotations);
								if (isDisaggregation) {
									lodash.set(values, 'spec.prefill.annotations', annotations);
								}
							}
						}
					}}
					bind:values={placement}
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

			<Tabs.Content value={steps[5]}>
				{#key JSON.stringify(lodash.get(values, 'spec.decode.parallelism.tensor'))}
					{@const initialValue =
						lodash.get(values, 'spec.decode.parallelism.tensor') &&
						Number(lodash.get(values, 'spec.decode.parallelism.tensor')) > 1
							? {
									args: [
										'--max-model-len',
										'8192',
										'--kv-transfer-config',
										`{"kv_connector":"NixlConnector", "kv_role":"kv_both"}`,
										'--disable-uvicorn-access-log',
										'--tensor-parallel-size'
									]
								}
							: {
									args: [
										'--max-model-len',
										'8192',
										'--kv-transfer-config',
										`{"kv_connector":"NixlConnector", "kv_role":"kv_both"}`,
										'--disable-uvicorn-access-log'
									]
								}}
					<Form
						schema={{
							...(lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.engine'),
								'properties'
							) as any),
							title: 'Engine',
							properties: {
								args: {
									...lodash.get(jsonSchema, 'properties.spec.properties.engine.properties.args'),
									title: 'Arguments'
								},
								env: {
									...lodash.omit(
										lodash.get(jsonSchema, 'properties.spec.properties.engine.properties.env'),
										'items'
									),
									title: 'Environment Variables',
									items: {
										...lodash.omit(
											lodash.get(
												jsonSchema,
												'properties.spec.properties.engine.properties.env.items'
											),
											'properties'
										),
										properties: {
											name: {
												...lodash.get(
													jsonSchema,
													'properties.spec.properties.engine.properties.env.items.properties.name'
												),
												title: 'Name'
											},
											value: {
												...lodash.get(
													jsonSchema,
													'properties.spec.properties.engine.properties.env.items.properties.value'
												),
												title: 'Value'
											}
										}
									}
								}
							}
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							},
							args: {
								'ui:options': {
									itemTitle: () => 'argument'
								}
							},
							env: {
								'ui:options': {
									itemTitle: () => 'environment variable'
								},
								items: {
									'ui:options': {
										layouts: {
											'object-properties': {
												class: 'grid grid-cols-2 gap-3'
											}
										}
									}
								}
							}
						} as UiSchemaRoot}
						{initialValue}
						transformer={(value: FormValue) => {
							const formValue: any = value;
							lodash.set(formValue, 'env', [
								{
									name: 'VLLM_NIXL_SIDE_CHANNEL_HOST',
									valueFrom: { fieldRef: { fieldPath: 'status.podIP' } }
								},
								{
									name: 'VLLM_NIXL_SIDE_CHANNEL_PORT',
									value: '5557'
								},
								{ name: 'UCX_TLS', value: 'cuda_ipc,cuda_copy,tcp' },
								{ name: 'VLLM_LOGGING_LEVEL', value: 'INFO' }
							]);
							return formValue;
						}}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['spec']['engine']}
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
				{/key}
			</Tabs.Content>

			<Tabs.Content value={steps[6]} class="min-h-[77vh]">
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
