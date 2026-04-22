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
	let specValues: any = $state({});
	let serviceValues: any = $state({});
	let storageValues: any = $state({});
	let resourceFormValues: any = $state({});

	$effect(() => {
		values.spec = { ...specValues, ...serviceValues, ...storageValues, ...resourceFormValues };
	});

	let value = $derived.by(() => {
		const filtered = lodash.cloneDeep(values);
		if (filtered.metadata) {
			for (const field of systemFields) {
				delete filtered.metadata[field];
			}
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
			<!-- Step 1: Container (name, image, command, args, containerPort, replicas) -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						title: 'Container',
						type: 'object',
						required: ['name', 'image'],
						properties: {
							name: {
								type: 'string',
								title: 'Name',
								description: 'Name of the workload'
							},
							image: {
								type: 'string',
								title: 'Image',
								description: 'Container image to use'
							},
							command: {
								type: 'array',
								title: 'Command',
								items: { type: 'string' }
							},
							args: {
								type: 'array',
								title: 'Arguments',
								items: { type: 'string' }
							},
							containerPort: {
								type: 'integer',
								title: 'Container Port',
								default: 80
							},
							replicas: {
								type: 'integer',
								title: 'Replicas',
								default: 1,
								minimum: 1
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
								type: 'string',
								title: 'Service Type',
								description: 'Kubernetes service type',
								default: 'ClusterIP',
								enum: ['ExternalName', 'ClusterIP', 'NodePort', 'LoadBalancer']
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
												type: 'integer',
												title: 'Service Node Port',
												description: 'Node port (30000-32767, leave empty for auto-assign)',
												minimum: 30000,
												maximum: 32767
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
						...(object.spec?.serviceNodePort != null
							? { serviceNodePort: object.spec.serviceNodePort }
							: {})
					} as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
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
				<Form
					schema={{
						title: 'Storage',
						type: 'object',
						properties: {
							accessMode: {
								type: 'string',
								title: 'Access Mode',
								description: 'Access mode for the persistent volume',
								enum: ['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany']
							},
							storageSize: {
								type: 'string',
								title: 'Storage Size',
								description: 'Size of the persistent volume (e.g. 1Gi)',
								default: '1Gi'
							},
							mountPath: {
								type: 'string',
								title: 'Mount Path',
								description: 'Path to mount the volume inside the container'
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
			</Tabs.Content>

			<!-- Step 4: Resources -->
			<Tabs.Content value={steps[3]}>
				<Form
					schema={{
						title: 'Resources',
						type: 'object',
						properties: {
							resourcesRequestsCpu: {
								type: 'string',
								title: 'CPU Request',
								default: '100m'
							},
							resourcesRequestsMemory: {
								type: 'string',
								title: 'Memory Request',
								default: '128Mi'
							},
							resourcesLimitsCpu: {
								type: 'string',
								title: 'CPU Limit',
								default: '500m'
							},
							resourcesLimitsMemory: {
								type: 'string',
								title: 'Memory Limit',
								default: '512Mi'
							},
							resourcesGpu: {
								type: 'string',
								title: 'GPU',
								default: '0'
							},
							resourcesGpumem: {
								type: 'string',
								title: 'GPU Memory',
								default: '0'
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
