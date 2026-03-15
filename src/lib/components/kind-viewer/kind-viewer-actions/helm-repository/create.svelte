<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Plus } from '@lucide/svelte';
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
							},
							labels: {
								title: 'Labels',
								...lodash.get(jsonSchema, 'properties.metadata.properties.labels'),
								properties: {
									'tenant.otterscale.io/from-harbor': {
										type: 'boolean'
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
							'tenant.otterscale.io/from-harbor': {
								'ui:options': {
									help: 'Indicates whether this repository originates from Harbor'
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						name: null,
						namespace: namespace,
						labels: {
							'tenant.otterscale.io/from-harbor': null
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
							insecure: {
								...lodash.get(jsonSchema, 'properties.spec.properties.insecure'),
								title: 'Insecure'
							},
							secretRef: {
								...lodash.get(jsonSchema, 'properties.spec.properties.secretRef'),
								title: 'Secret Reference'
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
									help: 'To connect to the internal Harbor service, use "harbor-credential" as the Secret name.'
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						type: 'oci',
						url: '',
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

			<Tabs.Content value={steps[2]}>
				<div class="flex h-full flex-col gap-3">
					<!-- <Code.Root lang="yaml" class="w-full" hideLines code={stringify(values, null, 2)} /> -->
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
								throw Error(`Validation errors: ${JSON.stringify(validate.errors)}`);
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
	</AlertDialog.Content>
</AlertDialog.Root>
