<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import FormIcon from '@lucide/svelte/icons/form';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
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
	import RadioWidget from '$lib/components/dynamic-form/widgets/radio.svelte';
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
		schema: Schema;
		object: SourceToolkitFluxcdIoV1HelmRepository;
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

	let value = $derived.by(() => {
		const filtered = lodash.cloneDeep(values);
		return stringify(filtered);
	});
	const currentIndex = $derived(steps.indexOf(currentStep));

	function getInitialValues() {
		return {
			apiVersion: `${group}/${version}`,
			kind,
			metadata: object.metadata,
			spec: {}
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
					<FormIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Update</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content
		class="max-h-[95vh] min-w-[38vw] overflow-auto"
		onInteractOutside={(e) => {
			e.preventDefault();
		}}
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
						...lodash.omit(lodash.get(jsonSchema, 'properties.spec') as Schema, 'properties'),
						properties: {
							type: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.type') as Schema),
								title: 'Type'
							},
							insecure: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.insecure') as Schema),
								title: 'Insecure'
							},
							url: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.url') as Schema),
								title: 'URL'
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
								selectWidget: RadioWidget
							},
							'ui:options': {
								TailoredRadioLabelGetter: (label: string) => {
									if (label === 'default') return 'index';

									return label;
								}
							}
						},
						secretRef: {
							name: {
								'ui:options': {
									shadcn4Text: {
										placeholder: 'Only accept Secrets with type kubernetes.io/basic-auth',
										class: 'placeholder:text-destructive/50'
									}
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						type: lodash.get(object, 'spec.type'),
						url: lodash.get(object, 'spec.url'),
						insecure: lodash.get(object, 'spec.insecure'),
						secretRef: lodash.get(object, 'spec.secretRef'),
						certSecretRef: lodash.get(object, 'spec.certSecretRef')
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']}
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

									await resourceClient.update({
										cluster,
										namespace,
										name,
										group,
										version,
										resource,
										manifest,
										fieldManager: 'otterscale-web-ui'
									});
								},
								{
									loading: `Updating ${kind} ${name}...`,
									success: () => {
										return `Successfully updated ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to update ${kind} ${name}:`, error);
										return `Failed to update ${kind} ${name}: ${(error as ConnectError).message}`;
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
