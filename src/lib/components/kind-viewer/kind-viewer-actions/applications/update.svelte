<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import FormIcon from '@lucide/svelte/icons/form-input';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { FormState, FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
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
	import { Switch } from '$lib/components/ui/switch/index.ts';
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
		object: ApplicationObject;
		onOpenChangeComplete: () => void;
	} = $props();

	type ApplicationSpec = {
		name?: string;
		image?: string;
		command?: string[];
		args?: string[];
		containerPort?: number;
		replicas?: number;
		serviceType?: string;
		serviceNodePort?: number;
		accessMode?: string;
		storageSize?: string;
		mountPath?: string;
		resourcesRequestsCpu?: string;
		resourcesRequestsMemory?: string;
		resourcesLimitsCpu?: string;
		resourcesLimitsMemory?: string;
		resourcesGpu?: string;
		resourcesGpumem?: string;
	};

	type ApplicationObject = {
		metadata?: { name?: string; namespace?: string; [k: string]: unknown };
		spec?: ApplicationSpec;
		status?: { nodePort?: number; [k: string]: unknown };
	};

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

	let values = $state(getInitialValues());
	let specValues = $state<FormValue>({});
	let serviceValues = $state<FormValue>({});
	let storageValues = $state<FormValue>({});
	let resourceFormValues = $state<FormValue>({});

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
			...(specValues as Record<string, unknown>),
			...(serviceValues as Record<string, unknown>),
			...(storageValues as Record<string, unknown>),
			...(resourceFormValues as Record<string, unknown>)
		};
	});

	let value = $derived.by(() => {
		const filtered = lodash.cloneDeep(values) as typeof values & { status?: unknown };
		for (const field of systemFields) {
			delete filtered.metadata[field];
		}
		delete filtered.status;
		return stringify(filtered);
	});

	// Steps: 1=Container+Replicas, 2=Service, 3=Storage, 4=Resources, 5=YAML Preview
	const steps = Array.from({ length: 5 }, (_, index) => String(index + 1));
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
	let storageEnabled = $state(getStorageEnabled());

	function getStorageEnabled() {
		return (
			object.spec?.accessMode != null ||
			object.spec?.storageSize != null ||
			object.spec?.mountPath != null
		);
	}

	function initiate() {
		values = getInitialValues();
		specValues = {};
		serviceValues = {};
		storageValues = {};
		resourceFormValues = {};
		currentStep = firstStep;
		isSubmitting = false;
		storageEnabled = getStorageEnabled();
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
			<!-- Step 1: Container (name, image, command, args, containerPort, replicas) -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						title: 'Container',
						type: 'object',
						required: (lodash.get(jsonSchema, 'properties.spec.required', []) as string[]).filter(
							(f) => ['name', 'image'].includes(f)
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
							containerPort: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.containerPort') as Schema),
								title: 'Container Port'
							},
							replicas: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.replicas') as Schema),
								title: 'Replicas'
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
						containerPort: object.spec?.containerPort ?? 80,
						replicas: object.spec?.replicas ?? 1
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

			<!-- Step 2: Service -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						title: 'Service',
						type: 'object',
						properties: {
							serviceType: {
								...(lodash.get(jsonSchema, 'properties.spec.properties.serviceType') as Schema),
								title: 'Service Type',
								enum: ['ClusterIP', 'NodePort', 'LoadBalancer']
							}
						},
						dependencies: {
							serviceType: {
								oneOf: [
									{
										properties: {
											serviceType: { enum: ['ExternalName'] }
										}
									},
									{
										properties: {
											serviceType: { enum: ['ClusterIP'] }
										}
									},
									{
										properties: {
											serviceType: { enum: ['NodePort'] },
											serviceNodePort: {
												...(lodash.get(
													jsonSchema,
													'properties.spec.properties.serviceNodePort'
												) as Schema),
												title: 'Service Node Port'
											}
										}
									},
									{
										properties: {
											serviceType: { enum: ['LoadBalancer'] }
										}
									}
								]
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						serviceType: {
							'ui:components': {
								stringField: 'enumField'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						serviceType: object.spec?.serviceType ?? 'ClusterIP',
						serviceNodePort: object.status?.nodePort
					} as FormValue}
					handleSubmit={{
						posthook: (form: FormState<FormValue>) => {
							handleNext();

							const formValue = getValueSnapshot(form);
							if (lodash.get(formValue, 'serviceType') !== 'NodePort') {
								lodash.unset(serviceValues, 'serviceNodePort');
							}
						}
					}}
					bind:values={serviceValues}
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

			<!-- Step 3: Storage -->
			<Tabs.Content value={steps[2]}>
				<div class="flex flex-col gap-4">
					<div class="flex items-center gap-3 py-2">
						<Switch bind:checked={storageEnabled} id="storage-enabled" />
						<label for="storage-enabled" class="cursor-pointer text-sm font-medium">
							Enable Storage
						</label>
					</div>
					{#if storageEnabled}
						<Form
							schema={{
								title: 'Storage',
								type: 'object',
								properties: {
									accessMode: {
										...(lodash.get(jsonSchema, 'properties.spec.properties.accessMode') as Schema),
										title: 'Access Mode',
										enum: ['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany']
									},
									storageSize: {
										...(lodash.get(jsonSchema, 'properties.spec.properties.storageSize') as Schema),
										title: 'Storage Size'
									},
									mountPath: {
										...(lodash.get(jsonSchema, 'properties.spec.properties.mountPath') as Schema),
										title: 'Mount Path'
									}
								}
							} as Schema}
							uiSchema={{
								'ui:options': {
									translations: {
										submit: 'Next'
									}
								},
								accessMode: {
									'ui:components': {
										stringField: 'enumField'
									}
								}
							} as UiSchemaRoot}
							initialValue={{
								accessMode: object.spec?.accessMode ?? null,
								storageSize: object.spec?.storageSize ?? '1Gi',
								mountPath: object.spec?.mountPath ?? null
							} as FormValue}
							handleSubmit={{
								posthook: () => {
									handleNext();
								}
							}}
							bind:values={storageValues}
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
					{:else}
						<div class="flex w-full items-center justify-between gap-3">
							<Button onclick={() => handlePrevious()}>Previous</Button>
							<Button
								onclick={() => {
									storageValues = {};
									handleNext();
								}}
							>
								Next
							</Button>
						</div>
					{/if}
				</div>
			</Tabs.Content>

			<!-- Step 4: Resources -->
			<Tabs.Content value={steps[3]}>
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
					bind:values={resourceFormValues}
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

			<!-- Step 5: YAML Preview & Submit -->
			<Tabs.Content value={steps[4]} class="min-h-[77vh]">
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
