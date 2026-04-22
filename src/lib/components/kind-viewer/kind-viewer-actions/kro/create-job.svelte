<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Plus from '@lucide/svelte/icons/plus';
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
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data — flat structure matching quickJob RGD schema
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: {},
		spec: {}
	});
	let settingsValues: any = $state({});
	let specValues: any = $state({});
	let resourceValues: any = $state({});

	$effect(() => {
		values.spec = { ...settingsValues, ...specValues, ...resourceValues };
	});

	let value = $derived(stringify(values));

	// Steps: 1=Metadata, 2=Setting, 3=Container, 4=Resources, 5=YAML Preview
	const steps = Array.from({ length: 5 }, (_, index) => String(index + 1));
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
			<!-- Step 1: Metadata -->
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
								title: 'Namespace',
								readOnly: true
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
					initialValue={{ namespace: namespace } as FormValue}
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

			<!-- Step 2: Setting -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						title: 'Setting',
						type: 'object',
						properties: {
							completions: {
								type: 'integer',
								title: 'Completions',
								default: 1,
								minimum: 0
							},
							parallelism: {
								type: 'integer',
								title: 'Parallelism',
								default: 1,
								minimum: 0
							},
							backoffLimit: {
								type: 'integer',
								title: 'Backoff Limit',
								default: 6,
								minimum: 0
							},
							activeDeadlineSeconds: {
								type: 'integer',
								title: 'Active Deadline Seconds',
								minimum: 0
							},
							ttlSecondsAfterFinished: {
								type: 'integer',
								title: 'TTL Seconds After Finished',
								minimum: 0
							},
							suspend: {
								type: 'boolean',
								title: 'Suspend',
								default: false
							},
							restartPolicy: {
								type: 'string',
								title: 'Restart Policy',
								default: 'Never',
								enum: ['Never', 'OnFailure']
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							layouts: {
								'object-properties': {
									class: 'grid grid-cols-2 gap-3'
								}
							}
						},
						suspend: {
							'ui:components': {
								checkboxWidget: 'switchWidget'
							},
							'ui:options': {
								layout: {
									class: 'col-span-full'
								}
							}
						},
						restartPolicy: {
							'ui:components': {
								stringField: 'enumField'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						completions: 1,
						parallelism: 1,
						backoffLimit: 6,
						activeDeadlineSeconds: 3600,
						ttlSecondsAfterFinished: 86400,
						suspend: false,
						restartPolicy: 'Never'
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={settingsValues}
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

			<!-- Step 3: Container (name, image, command, args, containerPort) -->
			<Tabs.Content value={steps[2]}>
				<Form
					schema={{
						title: 'Container',
						type: 'object',
						required: ['name', 'image'],
						properties: {
							name: {
								type: 'string',
								title: 'Name',
								description: 'Name of the workload'
							},
							image: {
								type: 'string',
								title: 'Image',
								description: 'Container image to use'
							},
							command: {
								type: 'array',
								title: 'Command',
								items: { type: 'string' }
							},
							args: {
								type: 'array',
								title: 'Arguments',
								items: { type: 'string' }
							},
							containerPort: {
								type: 'integer',
								title: 'Container Port',
								default: 8080
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						command: {
							'ui:options': {
								itemTitle: () => 'command'
							}
						},
						args: {
							'ui:options': {
								itemTitle: () => 'argument'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						name: values.metadata?.name ?? null,
						image: null,
						containerPort: 8080
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={specValues}
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

			<!-- Step 4: Resources -->
			<Tabs.Content value={steps[3]}>
				<Form
					schema={{
						title: 'Resources',
						type: 'object',
						properties: {
							resourcesRequestsCpu: {
								type: 'string',
								title: 'CPU Request',
								default: '100m'
							},
							resourcesRequestsMemory: {
								type: 'string',
								title: 'Memory Request',
								default: '128Mi'
							},
							resourcesLimitsCpu: {
								type: 'string',
								title: 'CPU Limit',
								default: '500m'
							},
							resourcesLimitsMemory: {
								type: 'string',
								title: 'Memory Limit',
								default: '512Mi'
							},
							resourcesGpu: {
								type: 'string',
								title: 'GPU',
								default: '0'
							},
							resourcesGpumem: {
								type: 'string',
								title: 'GPU Memory',
								default: '0'
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							layouts: {
								'object-properties': {
									class: 'grid grid-cols-2 gap-3'
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						resourcesRequestsCpu: '100m',
						resourcesRequestsMemory: '128Mi',
						resourcesLimitsCpu: '500m',
						resourcesLimitsMemory: '512Mi',
						resourcesGpu: '0',
						resourcesGpumem: '0'
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={resourceValues}
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

			<!-- Step 5: YAML Preview & Submit -->
			<Tabs.Content value={steps[4]} class="min-h-[77vh]">
				<div class="flex h-full flex-col gap-3">
					<Monaco
						options={{
							language: 'yaml',
							padding: { top: 24 },
							automaticLayout: true,
							folding: true,
							foldingStrategy: 'indentation',
							showFoldingControls: 'always',
							scrollBeyondLastLine: false
						}}
						bind:value
						theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
					/>
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;

							isSubmitting = true;

							const isValid = validate(load(value));

							if (!isValid) {
								console.error('Validation errors:', validate.errors);
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
										open = false;
										return `Successfully created ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to create ${kind} ${name}:`, error);
										return `Failed to create ${kind} ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
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
