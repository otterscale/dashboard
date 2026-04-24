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
		schema: any;
		object: any;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const systemFields = [
		'clusterName',
		'creationTimestamp',
		'deletionGracePeriodSeconds',
		'deletionTimestamp',
		'finalizers',
		'generateName',
		'generation',
		'initializers',
		'managedFields',
		'ownerReferences',
		'resourceVersion',
		'relationships',
		'selfLink',
		'state',
		'uid'
	];

	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: object.metadata,
		spec: {}
	});
	let settingsValues: any = $state({});
	let specValues: any = $state({});
	let resourceValues: any = $state({});

	$effect(() => {
		values.spec = { ...settingsValues, ...specValues, ...resourceValues };
	});

	let value = $state('');
	$effect(() => {
		const filtered = lodash.cloneDeep(values);
		if (filtered.metadata) {
			for (const field of systemFields) {
				delete filtered.metadata[field];
			}
		}
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
	function reset() {
		currentStep = firstStep;
	}

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
						...lodash.omit(lodash.get(jsonSchema, 'properties.spec'), 'properties'),
						properties: {
							completions: {
								...lodash.get(jsonSchema, 'properties.spec.properties.completions'),
								title: 'Completions'
							},
							parallelism: {
								...lodash.get(jsonSchema, 'properties.spec.properties.parallelism'),
								title: 'Parallelism'
							},
							backoffLimit: {
								...lodash.get(jsonSchema, 'properties.spec.properties.backoffLimit'),
								title: 'Backoff Limit'
							},
							activeDeadlineSeconds: {
								...lodash.get(jsonSchema, 'properties.spec.properties.activeDeadlineSeconds'),
								title: 'Active Deadline Seconds'
							},
							ttlSecondsAfterFinished: {
								...lodash.get(jsonSchema, 'properties.spec.properties.ttlSecondsAfterFinished'),
								title: 'TTL Seconds After Finished'
							},
							suspend: {
								...lodash.get(jsonSchema, 'properties.spec.properties.suspend'),
								title: 'Suspend'
							},
							restartPolicy: {
								...lodash.get(jsonSchema, 'properties.spec.properties.restartPolicy'),
								title: 'Restart Policy',
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
						completions: object.spec?.completions ?? 1,
						parallelism: object.spec?.parallelism ?? 1,
						backoffLimit: object.spec?.backoffLimit ?? 6,
						activeDeadlineSeconds: object.spec?.activeDeadlineSeconds ?? 0,
						ttlSecondsAfterFinished: object.spec?.ttlSecondsAfterFinished ?? 0,
						suspend: object.spec?.suspend ?? false,
						restartPolicy: object.spec?.restartPolicy ?? 'Never'
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

			<!-- Step 2: Container -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						title: 'Container',
						type: 'object',
						required: lodash
							.get(jsonSchema, 'properties.spec.required', [])
							.filter((f: string) => ['name', 'image'].includes(f)),
						properties: {
							name: {
								...lodash.get(jsonSchema, 'properties.spec.properties.name'),
								title: 'Name'
							},
							image: {
								...lodash.get(jsonSchema, 'properties.spec.properties.image'),
								title: 'Image'
							},
							command: {
								...lodash.get(jsonSchema, 'properties.spec.properties.command'),
								title: 'Command'
							},
							args: {
								...lodash.get(jsonSchema, 'properties.spec.properties.args'),
								title: 'Arguments'
							},
							containerPort: {
								...lodash.get(jsonSchema, 'properties.spec.properties.containerPort'),
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
						command: object.spec?.command ?? undefined,
						args: object.spec?.args ?? undefined,
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
								...lodash.get(jsonSchema, 'properties.spec.properties.resourcesRequestsCpu'),
								title: 'CPU Request'
							},
							resourcesRequestsMemory: {
								...lodash.get(jsonSchema, 'properties.spec.properties.resourcesRequestsMemory'),
								title: 'Memory Request'
							},
							resourcesLimitsCpu: {
								...lodash.get(jsonSchema, 'properties.spec.properties.resourcesLimitsCpu'),
								title: 'CPU Limit'
							},
							resourcesLimitsMemory: {
								...lodash.get(jsonSchema, 'properties.spec.properties.resourcesLimitsMemory'),
								title: 'Memory Limit'
							},
							resourcesGpu: {
								...lodash.get(jsonSchema, 'properties.spec.properties.resourcesGpu'),
								title: 'GPU'
							},
							resourcesGpumem: {
								...lodash.get(jsonSchema, 'properties.spec.properties.resourcesGpumem'),
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
									await resourceClient.apply({
										cluster,
										namespace,
										group,
										version,
										resource,
										name,
										manifest,
										fieldManager: 'otterscale-web-ui',
										force: true
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
