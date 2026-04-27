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
	import * as Tooltip from '$lib/components/ui/tooltip';

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

	// Container for Data
	let values: any = $state({
		apiVersion: `${group}/${version}`,
		kind,
		metadata: {},
		spec: {}
	});
	let value = $derived(stringify(values));

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

<Tooltip.Root>
	<Dialog.Root
		bind:open
		onOpenChangeComplete={(isOpen) => {
			if (!isOpen) {
				reset();
			}
		}}
	>
		<Tooltip.Trigger>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="icon">
						<Plus />
					</Button>
				{/snippet}
			</Dialog.Trigger>
		</Tooltip.Trigger>
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
							...(lodash.omit(lodash.get(jsonSchema, 'properties.metadata'), 'properties') as any),
							title: 'Metadata',
							properties: {
								name: {
									...lodash.get(jsonSchema, 'properties.metadata.properties.name'),
									title: 'Name'
								},
								labels: {
									title: 'Labels',
									...lodash.omit(lodash.get(jsonSchema, 'properties.metadata.properties.labels'), [
										'additionalProperties'
									]),
									properties: {
										'tenant.otterscale.io/from-harbor': {
											type: 'boolean',
											title: 'Harbor'
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
							labels: {
								'ui:options': {
									addable: false
								},
								'tenant.otterscale.io/from-harbor': {
									'ui:options': {
										help: 'Indicates whether this repository originates from Harbor'
									}
								}
							}
						} as UiSchemaRoot}
						initialValue={{
							namespace: namespace,
							labels: {
								'tenant.otterscale.io/from-harbor': false
							}
						} as FormValue}
						handleSubmit={{
							posthook: () => {
								lodash.set(
									values,
									['metadata', 'labels', 'tenant.otterscale.io/from-harbor'],
									String(
										lodash.get(values, ['metadata', 'labels', 'tenant.otterscale.io/from-harbor'])
									)
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

				<Tabs.Content value={steps[1]}>
					<Form
						schema={{
							...(lodash.omit(lodash.get(jsonSchema, 'properties.spec'), 'properties') as any),
							properties: {
								type: {
									...lodash.get(jsonSchema, 'properties.spec.properties.type'),
									title: 'Type'
								},
								url: {
									...lodash.get(jsonSchema, 'properties.spec.properties.url'),
									title: 'URL'
								},
								secretRef: {
									...lodash.get(jsonSchema, 'properties.spec.properties.secretRef'),
									title: 'Secret Reference'
								},
								insecure: {
									...lodash.get(jsonSchema, 'properties.spec.properties.insecure'),
									title: 'Insecure'
								},
								certSecretRef: {
									...lodash.get(jsonSchema, 'properties.spec.properties.certSecretRef'),
									title: 'Certificate Secret Reference'
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
									stringField: 'enumField'
								},
								'ui:options': {
									disabledEnumValues: lodash
										.get(jsonSchema, 'properties.spec.properties.type.enum')
										.filter((type: string) => type !== 'oci')
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
							type: 'oci',
							interval: '10m'
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
							Create
						</Button>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Dialog.Content>
	</Dialog.Root>
	<Tooltip.Content>Create Resource</Tooltip.Content>
</Tooltip.Root>
