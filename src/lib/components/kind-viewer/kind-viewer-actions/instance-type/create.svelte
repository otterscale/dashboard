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
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		schema: jsonSchema,
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		open = $bindable(false),
		showTrigger = true,
		onsuccess
	}: {
		schema: any;
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		open?: boolean;
		showTrigger?: boolean;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Container for Data
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: { name: {} },
		cpuGuest: 1,
		memoryGuest: '1Gi'
	});

	// Derived submission values
	const submissionValues = $derived.by(() => {
		return {
			apiVersion: group ? `${group}/${version}` : version,
			kind,
			metadata: {
				name: values.metadata.name,
				namespace
			},
			spec: {
				cpu: {
					guest: Number(values.cpuGuest) || 1
				},
				memory: {
					guest: String(values.memoryGuest) || '1Gi'
				}
			}
		};
	});
	let value = $derived(stringify(submissionValues));

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
	let isSubmitting = $state(false);
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			reset();
		}
	}}
>
	{#if showTrigger}
		<Dialog.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="icon">
					<Plus />
				</Button>
			{/snippet}
		</Dialog.Trigger>
	{/if}
	<Dialog.Content
		class="max-h-[95vh] min-w-[38vw] overflow-auto"
		onInteractOutside={(e) => {
			e.preventDefault();
		}}
	>
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">{kind}</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep}>
			<!-- Step 1: Name -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.get(jsonSchema, 'properties.metadata.properties.name') ?? {
							type: 'string'
						}),
						title: 'Name'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={null as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['metadata']['name']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-end gap-3">
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<!-- Step 2: CPU & Memory -->
			<Tabs.Content value={steps[1]}>
				<div class="flex flex-col gap-4">
					<Form
						schema={{
							type: 'number',
							title: 'CPU (Cores)',
							minimum: 1
						} as Schema}
						uiSchema={{} as UiSchemaRoot}
						initialValue={1 as FormValue}
						bind:values={values['cpuGuest']}
					/>
					<Form
						schema={{
							type: 'string',
							title: 'Memory (e.g. 1Gi, 512Mi)'
						} as Schema}
						uiSchema={{} as UiSchemaRoot}
						initialValue={'1Gi' as FormValue}
						bind:values={values['memoryGuest']}
					/>
					<div class="flex w-full items-center justify-between gap-3">
						<Button
							onclick={() => {
								handlePrevious();
							}}
						>
							Previous
						</Button>
						<Button
							onclick={() => {
								handleNext();
							}}
						>
							Next
						</Button>
					</div>
				</div>
			</Tabs.Content>
			<!-- Step 3: Review & Create -->
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
										onsuccess?.();
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
