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
	import ComboboxWidget from '$lib/components/dynamic-form/widgets/combobox.svelte';
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
		instanceTypeKind: {},
		instanceTypeName: {},
		dataVolumeName: {},
		cloudInit: {},
		running: true
	});

	// Derived submission values (proper VirtualMachine structure)
	const submissionValues = $derived.by(() => {
		const disks: any[] = [{ name: 'rootdisk', disk: { bus: 'virtio' } }];
		const volumes: any[] = [{ name: 'rootdisk', dataVolume: { name: values.dataVolumeName } }];

		const cloudInitData = typeof values.cloudInit === 'string' ? values.cloudInit : '';
		if (cloudInitData.trim()) {
			disks.push({ name: 'cloudinitdisk', disk: { bus: 'virtio' } });
			volumes.push({
				name: 'cloudinitdisk',
				cloudInitNoCloud: { userData: cloudInitData }
			});
		}

		return {
			apiVersion: group ? `${group}/${version}` : version,
			kind,
			metadata: {
				name: values.metadata.name,
				namespace
			},
			spec: {
				running: values.running,
				instancetype: {
					kind: values.instanceTypeKind,
					name: values.instanceTypeName
				},
				template: {
					metadata: {
						labels: {
							'kubevirt.io/vm': values.metadata.name
						}
					},
					spec: {
						domain: {
							devices: {
								disks,
								interfaces: [{ name: 'default', masquerade: {} }]
							}
						},
						networks: [{ name: 'default', pod: {} }],
						volumes
					}
				}
			}
		};
	});
	let value = $derived(stringify(submissionValues));

	// Steps Manager
	const steps = Array.from({ length: 6 }, (_, index) => String(index + 1));
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

	// Fetch Instance Types
	async function fetchInstanceTypesAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		try {
			const itKind = values.instanceTypeKind as string;
			if (typeof itKind !== 'string' || !itKind) return [];
			const isClusterScoped = itKind === 'VirtualMachineClusterInstancetype';
			const listRequest: any = {
				cluster,
				group: 'instancetype.kubevirt.io',
				version: 'v1beta1',
				resource: isClusterScoped
					? 'virtualmachineclusterinstancetypes'
					: 'virtualmachineinstancetypes'
			};
			if (!isClusterScoped) {
				listRequest.namespace = namespace;
			}
			const response = await resourceClient.list(listRequest);
			const names = response.items
				.map((item: any) => (item.object as any)?.metadata?.name as string)
				.filter((name: string) => name && name.toLowerCase().includes(search.toLowerCase()));
			return names.map((name: string) => ({ label: name, value: name }));
		} catch (error) {
			console.error('Error fetching instance types:', error);
			return [];
		}
	}

	// Fetch DataVolumes
	async function fetchDataVolumesAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'cdi.kubevirt.io',
				version: 'v1beta1',
				resource: 'datavolumes'
			});
			const names = response.items
				.map((item: any) => (item.object as any)?.metadata?.name as string)
				.filter((name: string) => name && name.toLowerCase().includes(search.toLowerCase()));
			return names.map((name: string) => ({ label: name, value: name }));
		} catch (error) {
			console.error('Error fetching data volumes:', error);
			return [];
		}
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
			<!-- Step 2: Instance Type Kind -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						type: 'string',
						title: 'Instance Type Kind',
						enum: ['VirtualMachineInstancetype', 'VirtualMachineClusterInstancetype']
					} as Schema}
					uiSchema={{
						'ui:components': {
							stringField: 'enumField'
						},
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={'VirtualMachineInstancetype' as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['instanceTypeKind']}
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
			<!-- Step 3: Instance Type -->
			<Tabs.Content value={steps[2]}>
				<Form
					schema={{
						type: 'string',
						title: 'Instance Type'
					} as Schema}
					uiSchema={{
						'ui:components': {
							stringField: 'enumField',
							selectWidget: ComboboxWidget
						},
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							TailoredComboboxEnumerations: fetchInstanceTypesAsEnumerations,
							TailoredComboboxVisibility: 10,
							TailoredComboboxInput: {
								placeholder: 'Select Instance Type'
							},
							TailoredComboboxEmptyText: 'No Instance Types found.'
						}
					} as UiSchemaRoot}
					initialValue={null as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['instanceTypeName']}
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
			<!-- Step 4: DataVolume -->
			<Tabs.Content value={steps[3]}>
				<Form
					schema={{
						type: 'string',
						title: 'DataVolume'
					} as Schema}
					uiSchema={{
						'ui:components': {
							stringField: 'enumField',
							selectWidget: ComboboxWidget
						},
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							TailoredComboboxEnumerations: fetchDataVolumesAsEnumerations,
							TailoredComboboxVisibility: 10,
							TailoredComboboxInput: {
								placeholder: 'Select DataVolume'
							},
							TailoredComboboxEmptyText: 'No DataVolumes found.'
						}
					} as UiSchemaRoot}
					initialValue={null as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['dataVolumeName']}
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
			<!-- Step 5: Cloud-Init -->
			<Tabs.Content value={steps[4]}>
				<Form
					schema={{
						type: 'string',
						title: 'Cloud-Init (userData)'
					} as Schema}
					uiSchema={{
						'ui:components': {
							textWidget: 'textareaWidget'
						},
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={'#cloud-config\npassword: password\nchpasswd:\n  expire: false' as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['cloudInit']}
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
			<!-- Step 6: Review & Create -->
			<Tabs.Content value={steps[5]} class="min-h-[77vh]">
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
