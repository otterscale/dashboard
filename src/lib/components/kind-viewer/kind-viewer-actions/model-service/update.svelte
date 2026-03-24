<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { FormIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Form from '$lib/components/dynamic-form/form.svelte';
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

	// Container for Data
	let values: any = $state({
		apiVersion: `${group}/${version}`,
		kind,
		metadata: object.metadata,
		spec: {
			accelerator: {},
			decode: {},
			prefill: {},
			routingProxy: {
				image: 'ghcr.io/llm-d/llm-d-routing-sidecar:v0.4.0'
			}
		}
	});

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

	let mode: any = $state({});

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
						type: object.spec.accelerator.type
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

			<Tabs.Content value={steps[1]}>
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
						mode: object.spec.prefill ? 'Disaggregation' : 'Intelligent',
						decode: { ...lodash.get(object, 'spec.decode') },
						...(object.spec.prefill ? { prefill: { ...lodash.get(object, 'spec.prefill') } } : {})
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
							lodash.set(values, 'spec.decode', lodash.get(mode, 'decode'));
							if (lodash.get(mode, 'mode') === 'Disaggregation') {
								lodash.set(values, 'spec.prefill', lodash.get(mode, 'prefill'));
							} else {
								lodash.set(values, 'spec.prefill', {});
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
						Update
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
