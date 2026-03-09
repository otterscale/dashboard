<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Plus } from '@lucide/svelte';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import * as Code from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		schema: jsonSchema
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data
	let values: any = $state({
		apiVersion: `${group}/${version}`,
		kind,
		metadata: {},
		spec: {
			accelerator: {},
			decode: {},
			prefill: {},
			engine: {},
			model: {}
		}
	});

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
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={() => {
		reset();
	}}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="icon">
				<Plus />
			</Button>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">ModelService</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
			<!-- Step 1: Basic Info -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.omit(lodash.get(jsonSchema, 'properties.metadata'), 'properties') as any),
						title: 'Metadata',
						properties: {
							name: {
								...lodash.get(jsonSchema, 'properties.metadata.properties.name'),
								title: 'Name'
							},
							namespace: {
								...lodash.get(jsonSchema, 'properties.metadata.properties.namespace'),
								title: 'Namespace'
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
						name: '',
						namespace: ''
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

			<!-- Step 2: Model Config -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						...(lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.model'),
							'properties'
						) as any),
						title: 'Model',
						properties: {
							name: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.model.properties.name'
								) as any),
								title: 'Name'
							},
							image: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.model.properties.image'
								) as any),
								title: 'Image'
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
						name: '',
						image: ''
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
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

			<!-- Step 3: Accelerator -->
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

			<!-- Step 4: Decode -->
			<Tabs.Content value={steps[3]}>
				<Form
					schema={{
						...(lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.decode.properties'),
							'properties'
						) as any),
						title: 'Decode',
						properties: {
							parallelism: {
								...(lodash.omit(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.decode.properties.parallelism'
									),
									'properties'
								) as any),
								title: 'Parallelism',
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
					initialValue={{} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['decode']}
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

			<!-- Step 5: Prefill -->
			<Tabs.Content value={steps[4]}>
				<Form
					schema={{
						...(lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.prefill.properties'),
							'properties'
						) as any),
						title: 'Prefill',
						properties: {
							parallelism: {
								...(lodash.omit(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.prefill.properties.parallelism'
									),
									'properties'
								) as any),
								title: 'Parallelism',
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
					initialValue={{} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['prefill']}
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

			<!-- Step 6: Engine -->
			<Tabs.Content value={steps[5]}>
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
						}
					} as UiSchemaRoot}
					initialValue={{
						args: [
							'--kv-transfer-config',
							`{"kv_connector":"NixlConnector", "kv_role":"kv_both"}`,
							'--disable-uvicorn-access-log',
							'--max-model-len',
							'8192'
						]
					} as FormValue}
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
			</Tabs.Content>

			<!-- Step 7: Review -->
			<Tabs.Content value={steps[6]}>
				<div class="flex h-full flex-col gap-3">
					<Code.Root lang="yaml" class="w-full" hideLines code={stringify(values, null, 2)} />
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const isValid = validate(values);

							if (!isValid) {
								throw Error(`Validation errors: ${JSON.stringify(validate.errors)}`);
							}

							const name = lodash.get(values, 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(JSON.stringify(values));

									await resourceClient.create({
										cluster,
										group,
										version,
										resource,
										manifest
									});
								},
								{
									loading: `Creating ModelService ${name}...`,
									success: () => {
										return `Successfully created ModelService ${name}`;
									},
									error: (error) => {
										console.error(`Failed to create ModelService ${name}:`, error);
										return `Failed to create ModelService ${name}: ${(error as ConnectError).message}`;
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
	</AlertDialog.Content>
</AlertDialog.Root>
