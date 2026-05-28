<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Plus from '@lucide/svelte/icons/plus';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import { type ValidateFunction } from 'ajv';
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
		validate,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		validate: ValidateFunction;
		object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const steps = Array.from({ length: 2 }, (_, index) => String(index + 1));
	const [firstStep] = steps;

	let values = $state(getInitialValues());
	let currentStep = $state(firstStep);
	let isSubmitting = $state(false);
	let open = $state(false);

	let value = $derived(stringify(values));
	const currentIndex = $derived(steps.indexOf(currentStep));

	function getInitialValues() {
		return {
			apiVersion: lodash.get(object, 'apiVersion'),
			kind: lodash.get(object, 'kind'),
			metadata: {
				name: '',
				namespace
			},
			spec: lodash.get(object, 'spec')
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
					<Plus />
				</Item.Media>
				<Item.Content>
					<Item.Title>Copy</Item.Title>
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
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...lodash.omit(lodash.get(jsonSchema, 'properties.metadata') as Schema, [
							'properties',
							'required'
						]),
						title: 'Metadata',
						required: [...lodash.get(jsonSchema, 'properties.metadata.required', []), 'name'],
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
					initialValue={{
						namespace
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

							const name = lodash.get(load(value), 'metadata.name');

							const isValid = validate(load(value));

							if (!isValid) {
								console.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

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
										return `Successfully copied ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to cpoy ${kind} ${name}:`, error);
										return `Failed to cpoy ${kind} ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
									}
								}
							);
						}}
					>
						Copy
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
