<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { PencilIcon } from '@lucide/svelte';
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
		schema: jsonSchema,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: any;
		object?: any;
		onOpenChangeComplete?: () => void;
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
		metadata: { name: lodash.get(object, 'metadata.name', '') },
		spec: {
			accelerator: lodash.get(object, 'spec.accelerator', {}),
			decode: lodash.get(object, 'spec.decode', {}),
			prefill: lodash.get(object, 'spec.prefill', {}),
			engine: lodash.get(object, 'spec.engine', {}),
			model: lodash.get(object, 'spec.model', {})
		}
	});

	// Steps Manager
	const steps = Array.from({ length: 3 }, (_, index) => String(index + 1));
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
		onOpenChangeComplete?.();
		reset();
	}}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<PencilIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Edit</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Edit ModelService</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
			<!-- Step 1: Model Config -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						type: 'object',
						title: 'Model Configuration',
						description: 'Configure the OCI model artifact and serving identity.',
						required: ['name', 'image'],
						properties: {
							name: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.model.properties.name'
								) as any),
								title: 'Model Name',
								description: 'Model identifier for API requests (e.g., "qwen/Qwen3-32B")'
							},
							image: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.model.properties.image'
								) as any),
								title: 'Model Image',
								description:
									'OCI reference for the model artifact (e.g., "registry.example.com/models/qwen3-32b:v1")'
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
									class: 'flex flex-col gap-3'
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						name: lodash.get(object, 'spec.model.name', ''),
						image: lodash.get(object, 'spec.model.image', '')
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
								disabled={currentIndex === 0}
							>
								Previous
							</Button>
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>

			<!-- Step 2: Accelerator -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						type: 'object',
						title: 'Accelerator Configuration',
						description: 'Configure the GPU/accelerator type for serving pods.',
						required: ['type'],
						properties: {
							type: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.accelerator.properties.type'
								) as any),
								title: 'Accelerator Type',
								description: 'Type of accelerator hardware'
							}
						}
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
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						type: lodash.get(object, 'spec.accelerator.type', 'nvidia')
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

			<!-- Step 3: Review -->
			<Tabs.Content value={steps[2]}>
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

							const name = lodash.get(object, 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(JSON.stringify(values));

									await resourceClient.apply({
										cluster,
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
									loading: `Editing ModelService ${name}...`,
									success: () => {
										return `Successfully edited ModelService ${name}`;
									},
									error: (error) => {
										console.error(`Failed to edit ModelService ${name}:`, error);
										return `Failed to edit ModelService ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Edit
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</AlertDialog.Content>
</AlertDialog.Root>
