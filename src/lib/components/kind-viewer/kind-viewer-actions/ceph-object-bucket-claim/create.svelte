<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { SquareArrowOutUpRightIcon } from '@lucide/svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormState, FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
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
		schema: jsonSchema
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const steps = Array.from({ length: 3 }, (_, index) => String(index + 1));
	const [firstStep] = steps;

	let values = $state(getInitialValues());
	let currentStep = $state(firstStep);
	let isSubmitting = $state(false);
	let open = $state(false);

	let value = $derived(stringify(values));
	const currentIndex = $derived(steps.indexOf(currentStep));

	function getInitialValues() {
		return {
			apiVersion: `${group}/${version}`,
			kind: kind,
			metadata: {},
			spec: {
				storageClassName: 'ceph-bucket',
				additionalConfig: {}
			}
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

{#snippet document()}
	<Button
		href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html?icmpid=docs_amazons3_console"
		target="_blank"
		rel="noopener noreferrer"
		variant="ghost"
	>
		<SquareArrowOutUpRightIcon size={16} />
	</Button>
{/snippet}

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (isOpen) return;

		initiate();
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
				<Item.Title class="text-xl font-bold">ObjectBucketClaim</Item.Title>
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
						namespace: namespace
					} as FormValue}
					handleSubmit={{
						posthook: (form: FormState<FormValue>) => {
							handleNext();

							const formValue = getValueSnapshot(form);
							lodash.set(
								values,
								'spec.bucketName',
								`${namespace}-${lodash.get(formValue, 'name')}`
							);
						}
					}}
					bind:values={values['metadata']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-end gap-3">
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>

			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						...lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.additionalConfig') as Schema,
							['properties']
						),
						properties: {
							maxSize: {
								// Support Kubernetes quantity units
								type: 'string',
								description:
									'The maximum size of the bucket as a quota on the user account automatically created for the bucket. Please note minimum recommended value is 4K.',
								title: 'Size'
							},
							bucketMaxSize: {
								// Support Kubernetes quantity units
								type: 'string',
								description:
									'(disabled by default) The maximum size of the bucket as an individual bucket quota.',
								title: 'Bucket Size'
							},
							bucketPolicy: {
								type: 'string',
								description:
									'(disabled by default) A raw JSON format string that defines an AWS S3 format the bucket policy. If set, the policy string will override any existing policy set on the bucket and any default bucket policy that the bucket provisioner potentially would have automatically generated.',
								title: 'Bucket Policy'
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							hideTitle: true
						},
						bucketPolicy: {
							'ui:options': {
								action: document
							},
							'ui:components': {
								textWidget: 'textareaWidget'
							}
						}
					} as UiSchemaRoot}
					initialValue={{} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['additionalConfig']}
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
							showFoldingControls: 'always',
							scrollBeyondLastLine: false
						}}
						bind:value
						theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
					/>
					<div class="mt-auto flex items-center justify-between gap-3">
						<Button
							onclick={() => {
								handlePrevious();
							}}
						>
							Previous
						</Button>
						<Button
							onclick={() => {
								if (isSubmitting) return;

								isSubmitting = true;

								// Validator
								const jsonSchemaValidator = new Ajv({
									allErrors: true,
									strict: false
								});
								const validate = jsonSchemaValidator.compile(jsonSchema);

								const parsed = load(value);
								const isValid = validate(parsed);

								if (!isValid) {
									console.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
									toast.error('Validation failed. Please check the YAML.');
									isSubmitting = false;
									return;
								}

								const name = lodash.get(parsed, 'metadata.name') as string;

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
											return `Failed to create ${kind} ${name}: ${lodash.get(error, 'message')}`;
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
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
