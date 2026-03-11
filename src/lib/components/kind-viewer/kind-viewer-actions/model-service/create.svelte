<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Plus } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { SvelteMap, SvelteURL } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { env as publicEnv } from '$env/dynamic/public';
	import type { ArtifactType } from '$lib/components/artifact-viewer/types';
	import * as Code from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import ComboboxWidget from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
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
			engine: {},
			model: {}
		}
	});

	let mode: any = $state({});

	// Steps Manager
	const steps = Array.from({ length: 6 }, (_, index) => String(index + 1));
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
					const response = await fetch(`/rest/harbor/models?project=${namespace}`);
					if (response.ok) {
						const harborUrl = new SvelteURL(publicEnv.PUBLIC_HARBOR_URL);
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
				<Item.Title class="text-xl font-bold">{kind}</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
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
						image: ''
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
						lodash.get(jsonSchema, 'properties.spec.properties.decode.properties'),
						'properties'
					) as any),
					title: 'Decode',
					properties: {
						parallelism: {
							...(lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.decode.properties.parallelism'),
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
						},
						resources: {
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.decode.properties.resources'),
								'properties'
							),
							title: 'Resources',
							properties: {
								requests: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.prefill.properties.resources.properties.requests'
									) as any),
									additionalProperties: {
										...(lodash.omit(
											lodash.get(
												jsonSchema,
												'properties.spec.properties.prefill.properties.resources.properties.requests.additionalProperties'
											),
											'anyOf'
										) as any),
										type: 'string'
									}
								}
							}
						}
					}
				}}
				{@const prefillSchema = {
					...(lodash.omit(
						lodash.get(jsonSchema, 'properties.spec.properties.prefill.properties'),
						'properties'
					) as any),
					title: 'Prefill',
					properties: {
						parallelism: {
							...(lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.prefill.properties.parallelism'),
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
						},
						resources: {
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.prefill.properties.resources'),
								'properties'
							),
							title: 'Resources',
							properties: {
								requests: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.prefill.properties.resources.properties.requests'
									) as any),
									additionalProperties: {
										...(lodash.omit(
											lodash.get(
												jsonSchema,
												'properties.spec.properties.prefill.properties.resources.properties.requests.additionalProperties'
											),
											'anyOf'
										) as any),
										type: 'string'
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
							resources: {
								requests: {
									'ui:options': {
										layouts: {
											'object-properties': {
												class: 'grid grid-cols-2 gap-3'
											}
										},
										translations: {
											'additional-property': 'additional request',
											'add-object-property': 'Add Request'
										},
										additionalPropertyKey: (key: string, attempt: number) => {
											const index = attempt + 1;
											switch (index) {
												case 1: {
													return `1st ${key}`;
												}
												case 2: {
													return `2nd ${key}`;
												}
												case 3: {
													return `3rd ${key}`;
												}
												default: {
													return `${index}th ${key}`;
												}
											}
										}
									},
									additionalProperties: {
										'ui:options': {
											translations: {
												'key-input-title': 'request'
											},
											hideTitle: true
										}
									}
								}
							}
						},
						prefill: {
							resources: {
								requests: {
									'ui:options': {
										layouts: {
											'object-properties': {
												class: 'grid grid-cols-2 gap-3'
											}
										},
										translations: {
											'additional-property': 'additional request',
											'add-object-property': 'Add Request'
										},
										additionalPropertyKey: (key: string, attempt: number) => {
											const index = attempt + 1;
											switch (index) {
												case 1: {
													return `1st ${key}`;
												}
												case 2: {
													return `2nd ${key}`;
												}
												case 3: {
													return `3rd ${key}`;
												}
												default: {
													return `${index}th ${key}`;
												}
											}
										}
									},
									additionalProperties: {
										'ui:options': {
											translations: {
												'key-input-title': 'request'
											},
											hideTitle: true
										}
									}
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						mode: 'Intelligent',
						decode: {
							replicas: '',
							parallelism: { tensor: '' },
							resources: {
								requests: { cpu: '', memory: '' }
							}
						},
						prefill: {
							replicas: '',
							parallelism: { tensor: '' },
							resources: {
								requests: { cpu: '', memory: '' }
							}
						}
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
							lodash.set(values, 'spec.decode', lodash.get(mode, 'decode'));
							if (lodash.get(mode, 'mode') === 'Disaggregation') {
								lodash.set(values, 'spec.prefill', lodash.get(mode, 'prefill'));
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
								layouts: {
									'array-items': { class: 'grid grid-cols-2 gap-3' }
								},
								itemTitle: (title, index) => {
									switch (index) {
										case 1: {
											return `1st ${title}`;
										}
										case 2: {
											return `2nd ${title}`;
										}
										case 3: {
											return `3rd ${title}`;
										}
										default: {
											return `${index}th ${title}`;
										}
									}
								}
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

			<Tabs.Content value={steps[5]}>
				<div class="flex h-full flex-col gap-3">
					<Code.Root
						lang="yaml"
						class="no-shiki-limit w-full"
						hideLines
						code={stringify(values, null, 2)}
					/>
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
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	@reference '../../../../../app.css';

	:global(.no-shiki-limit pre.shiki:not([data-code-overflow] *):not([data-code-overflow])) {
		overflow-y: visible !important;
		max-height: none !important;
	}
</style>
