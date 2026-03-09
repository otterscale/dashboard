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

	import { page } from '$app/state';
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
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data.
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: {
			name: lodash.get(object, 'metadata.name'),
			namespace:
				lodash.get(object, 'metadata.namespace') ??
				page.url.searchParams.get('namespace') ??
				'default'
		},
		spec: {
			deploymentSpec: {},
			serviceSpec: {},
			pvcSpec: {}
		}
	});

	// Refactor into StepsManager.
	const steps = Array.from({ length: 4 }, (_, index) => String(index + 1)); // no need to edit Name
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
				<Item.Title class="text-xl font-bold">{kind}</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.get(jsonSchema, 'properties.spec.properties.deploymentSpec') as any),
						title: 'Deployment'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={{ ...lodash.get(object, 'spec.deploymentSpec') } as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['deploymentSpec']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-between gap-3">
							<Button
								onclick={() => {
									handlePrevious();
								}}
								disabled={true}
								class="invisible"
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
						...(lodash.get(jsonSchema, 'properties.spec.properties.serviceSpec') as any),
						title: 'Service'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={{ ...lodash.get(object, 'spec.serviceSpec') } as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['serviceSpec']}
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
						...(lodash.get(jsonSchema, 'properties.spec.properties.pvcSpec') as any),
						title: 'Storage PVC'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={{ ...lodash.get(object, 'spec.pvcSpec') } as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['pvcSpec']}
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
				<div class="flex h-full flex-col gap-3">
					<Code.Root lang="yaml" class="w-full" hideLines code={stringify(values, null, 2)} />
					<div class="mt-auto flex w-full items-center justify-between gap-3">
						<Button
							onclick={() => {
								handlePrevious();
							}}
						>
							Previous
						</Button>
						<Button
							class="flex-1"
							onclick={() => {
								if (isSubmitting) return;

								isSubmitting = true;

								// Application specific label linking
								const name = lodash.get(values, 'metadata.name');
								const labels = { app: name };

								if (values.spec?.deploymentSpec) {
									values.spec.deploymentSpec.selector = { matchLabels: labels };
									if (!values.spec.deploymentSpec.template) {
										values.spec.deploymentSpec.template = {};
									}
									if (!values.spec.deploymentSpec.template.metadata) {
										values.spec.deploymentSpec.template.metadata = {};
									}
									values.spec.deploymentSpec.template.metadata.labels = labels;
								}
								if (values.spec?.serviceSpec) {
									values.spec.serviceSpec.selector = labels;
									// Fix targetPort typing
									if (Array.isArray(values.spec.serviceSpec.ports)) {
										values.spec.serviceSpec.ports.forEach((port: any) => {
											if (port.targetPort !== undefined) {
												const numValue = parseInt(port.targetPort, 10);
												if (
													!isNaN(numValue) &&
													String(numValue) === String(port.targetPort).trim()
												) {
													port.targetPort = numValue;
												}
											}
										});
									}
								}

								const isValid = validate(values);

								if (!isValid) {
									isSubmitting = false;
									throw Error(`Validation errors: ${JSON.stringify(validate.errors)}`);
								}

								toast.promise(
									async () => {
										const manifest = new TextEncoder().encode(JSON.stringify(values));

										await resourceClient.apply({
											cluster,
											namespace: values.metadata.namespace,
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
										loading: `Editing application ${name}...`,
										success: () => {
											return `Successfully edited application ${name}`;
										},
										error: (error) => {
											console.error(`Failed to edit application ${name}:`, error);
											return `Failed to edit application ${name}: ${(error as ConnectError).message}`;
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
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</AlertDialog.Content>
</AlertDialog.Root>
