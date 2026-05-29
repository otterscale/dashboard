<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import FormIcon from '@lucide/svelte/icons/form-input';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
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
		object: ScheduleObject;
		onOpenChangeComplete: () => void;
	} = $props();

	type ScheduleSpec = {
		name?: string;
		image?: string;
		command?: string[];
		args?: string[];
		cronSchedule?: string;
		containerPort?: number;
		concurrencyPolicy?: string;
		suspend?: boolean;
		successfulJobsHistoryLimit?: number;
		failedJobsHistoryLimit?: number;
		restartPolicy?: string;
		resourcesRequestsCpu?: string;
		resourcesRequestsMemory?: string;
		resourcesLimitsCpu?: string;
		resourcesLimitsMemory?: string;
		resourcesGpu?: string;
		resourcesGpumem?: string;
	};

	type ScheduleObject = {
		metadata?: { name?: string; namespace?: string; [k: string]: unknown };
		spec?: ScheduleSpec;
	};

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let values = $state(getInitialValues());
	let settingsValues = $state<FormValue>({});
	let specValues = $state<FormValue>({});
	let resourceValues = $state<FormValue>({});

	function getInitialValues() {
		return {
			apiVersion: group ? `${group}/${version}` : version,
			kind,
			metadata: (object.metadata ?? {}) as Record<string, unknown>,
			spec: {} as Record<string, unknown>
		};
	}

	$effect(() => {
		values.spec = {
			...(settingsValues as Record<string, unknown>),
			...(specValues as Record<string, unknown>),
			...(resourceValues as Record<string, unknown>)
		};
	});

	let value = $state('');
	$effect(() => {
		const filtered = lodash.cloneDeep(values) as typeof values & { status?: unknown };
		delete filtered.status;
		value = stringify(filtered);
	});
	const steps = Array.from({ length: 4 }, (_, index) => String(index + 1));
	const [firstStep] = steps;
	let currentStep = $state(firstStep);
	const currentIndex = $derived(steps.indexOf(currentStep));
	function handleNext() {
		currentStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
	}
	function handlePrevious() {
		currentStep = steps[Math.max(currentIndex - 1, 0)];
	}
	let open = $state(false);
	let isSubmitting = $state(false);

	function initiate() {
		values = getInitialValues();
		settingsValues = {};
		specValues = {};
		resourceValues = {};
		currentStep = firstStep;
		isSubmitting = false;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();
		if (!isOpen) {
			initiate();
		}
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
			<!-- Step 1: Setting -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						title: 'Setting',
						...lodash.omit(lodash.get(jsonSchema, 'properties.spec') as Schema, 'properties'),
						properties: {
							concurrencyPolicy: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.concurrencyPolicy'
								) as Schema),
								title: 'Concurrency Policy',
								enum: ['Allow', 'Forbid', 'Replace']
							},
							suspend: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.suspend') as Schema),
								title: 'Suspend'
							},
							successfulJobsHistoryLimit: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.successfulJobsHistoryLimit'
								) as Schema),
								title: 'Successful Jobs History Limit'
							},
							failedJobsHistoryLimit: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.failedJobsHistoryLimit'
								) as Schema),
								title: 'Failed Jobs History Limit'
							},
							restartPolicy: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.restartPolicy') as Schema),
								title: 'Restart Policy',
								enum: ['OnFailure', 'Never']
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
						concurrencyPolicy: {
							'ui:components': {
								stringField: 'enumField'
							}
						},
						restartPolicy: {
							'ui:components': {
								stringField: 'enumField'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						concurrencyPolicy: object.spec?.concurrencyPolicy ?? 'Allow',
						suspend: object.spec?.suspend ?? false,
						successfulJobsHistoryLimit: object.spec?.successfulJobsHistoryLimit ?? 3,
						failedJobsHistoryLimit: object.spec?.failedJobsHistoryLimit ?? 1,
						restartPolicy: object.spec?.restartPolicy ?? 'OnFailure'
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
								disabled={currentIndex === 0}
							>
								Previous
							</Button>
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>

			<!-- Step 2: Container (name, image, command, args, cronSchedule, containerPort) -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						title: 'Container',
						type: 'object',
						required: (lodash.get(jsonSchema, 'properties.spec.required', []) as string[]).filter(
							(f) => ['name', 'image', 'cronSchedule'].includes(f)
						),
						properties: {
							name: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.name') as Schema),
								title: 'Name'
							},
							image: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.image') as Schema),
								title: 'Image'
							},
							command: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.command') as Schema),
								title: 'Command'
							},
							args: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.args') as Schema),
								title: 'Arguments'
							},
							cronSchedule: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.cronSchedule') as Schema),
								title: 'Cron Schedule'
							},
							containerPort: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.containerPort') as Schema),
								title: 'Container Port'
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
						name: object.spec?.name ?? null,
						image: object.spec?.image ?? null,
						command: object.spec?.command ?? [],
						args: object.spec?.args ?? [],
						cronSchedule: object.spec?.cronSchedule ?? '*/5 * * * *',
						containerPort: object.spec?.containerPort ?? 8080
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
								disabled={currentIndex === 0}
							>
								Previous
							</Button>
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>

			<!-- Step 3: Resources -->
			<Tabs.Content value={steps[2]}>
				<Form
					schema={{
						title: 'Resources',
						type: 'object',
						properties: {
							resourcesRequestsCpu: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.resourcesRequestsCpu'
								) as Schema),
								title: 'CPU Request'
							},
							resourcesRequestsMemory: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.resourcesRequestsMemory'
								) as Schema),
								title: 'Memory Request'
							},
							resourcesLimitsCpu: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.resourcesLimitsCpu'
								) as Schema),
								title: 'CPU Limit'
							},
							resourcesLimitsMemory: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.resourcesLimitsMemory'
								) as Schema),
								title: 'Memory Limit'
							},
							resourcesGpu: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.resourcesGpu') as Schema),
								title: 'GPU'
							},
							resourcesGpumem: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.resourcesGpumem') as Schema),
								title: 'GPU Memory'
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
						resourcesRequestsCpu: object.spec?.resourcesRequestsCpu ?? '100m',
						resourcesRequestsMemory: object.spec?.resourcesRequestsMemory ?? '128Mi',
						resourcesLimitsCpu: object.spec?.resourcesLimitsCpu ?? '500m',
						resourcesLimitsMemory: object.spec?.resourcesLimitsMemory ?? '512Mi',
						resourcesGpu: object.spec?.resourcesGpu ?? '0',
						resourcesGpumem: object.spec?.resourcesGpumem ?? '0'
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

			<!-- Step 4: YAML Preview & Submit -->
			<Tabs.Content value={steps[3]} class="min-h-[77vh]">
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

							const name = object.metadata?.name;
							const manifest = new TextEncoder().encode(value);

							toast.promise(
								async () => {
									await resourceClient.update({
										cluster,
										namespace,
										group,
										version,
										resource,
										name,
										manifest,
										fieldManager: 'otterscale-web-ui'
									});
								},
								{
									loading: `Updating ${kind} ${name}...`,
									success: () => {
										open = false;
										return `Successfully updated ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to update ${kind} ${name}:`, error);
										return `Failed to update ${kind} ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
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
