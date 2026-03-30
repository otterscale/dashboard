<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { FormIcon } from '@lucide/svelte';
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
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		schema: jsonSchema,
		object,
		cluster,
		group,
		version,
		kind,
		resource,
		onOpenChangeComplete
	}: {
		schema: any;
		object: any;
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Extract existing values from object
	const existingNamespace = lodash.get(object, 'metadata.namespace', '');
	const existingInstanceTypeKind = lodash.get(
		object,
		'spec.instancetype.kind',
		'VirtualMachineInstancetype'
	);
	const existingInstanceTypeName = lodash.get(object, 'spec.instancetype.name', '');
	const existingVolumes: any[] = lodash.get(object, 'spec.template.spec.volumes', []);
	const existingDisks: any[] = lodash.get(object, 'spec.template.spec.domain.devices.disks', []);

	// Detect boot disk: find the os-disk (first volume) — could be containerDisk or dataVolume
	const existingBootVolume =
		existingVolumes.find((v: any) => v.name === 'os-disk') ?? existingVolumes[0];
	const existingBootDisk = existingDisks.find((d: any) => d.name === 'os-disk') ?? existingDisks[0];
	// Extract additional disks (all dataVolume entries except the boot one)
	const existingAdditionalDisks = existingVolumes
		.filter((v: any) => v.dataVolume && v.name !== (existingBootVolume?.name ?? 'os-disk'))
		.map((v: any) => v.dataVolume.name);
	const existingCloudInit =
		existingVolumes.find((v: any) => v.cloudInitNoCloud)?.cloudInitNoCloud?.userData ?? '';

	// Container for Data
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		spec: {
			runStrategy: lodash.get(object, 'spec.runStrategy', 'Halted'),
			instancetype: {
				kind: {},
				name: {}
			}
		},
		// UI-only fields (not in API schema) — boot disk is immutable, only additionalDisks editable
		additionalDisks: [] as string[],
		cloudInit: {}
	});

	// Build disks and volumes — boot disk is preserved from existing object
	function buildDisksAndVolumes(): { disks: any[]; volumes: any[] } {
		// Start with the immutable boot disk/volume from the existing object
		const disks: any[] = [
			existingBootDisk
				? { ...existingBootDisk }
				: { name: 'os-disk', disk: { bus: 'virtio' }, bootOrder: 1 }
		];
		const volumes: any[] = [existingBootVolume ? { ...existingBootVolume } : { name: 'os-disk' }];

		const additionalDiskNames: string[] = Array.isArray(values.additionalDisks)
			? values.additionalDisks
			: [];

		additionalDiskNames.forEach((dvName: any, index: number) => {
			if (typeof dvName === 'string' && dvName.trim()) {
				const diskName = `data-disk-${index + 1}`;
				disks.push({ name: diskName, disk: { bus: 'virtio' } });
				volumes.push({ name: diskName, dataVolume: { name: dvName } });
			}
		});

		const cloudInitData = typeof values.cloudInit === 'string' ? values.cloudInit : '';
		if (cloudInitData.trim()) {
			disks.push({ name: 'cloud-init-disk', disk: { bus: 'virtio' } });
			volumes.push({
				name: 'cloud-init-disk',
				cloudInitNoCloud: { userData: cloudInitData }
			});
		}

		return { disks, volumes };
	}

	// Derived submission values (proper VirtualMachine structure)
	const submissionValues = $derived.by(() => {
		const { disks, volumes } = buildDisksAndVolumes();

		return {
			apiVersion: group ? `${group}/${version}` : version,
			kind,
			metadata: {
				name: lodash.get(object, 'metadata.name'),
				namespace: existingNamespace,
				annotations: {
					'kubevirt.io/allow-pod-bridge-network-live-migration': 'true'
				}
			},
			spec: {
				runStrategy: values.spec.runStrategy,
				instancetype: values.spec.instancetype,
				template: {
					metadata: {
						labels: {
							'kubevirt.io/vm': lodash.get(object, 'metadata.name')
						}
					},
					spec: {
						domain: {
							devices: {
								disks,
								interfaces: [{ name: 'nic1', bridge: {} }]
							}
						},
						networks: [{ name: 'nic1', pod: {} }],
						volumes
					}
				}
			}
		};
	});
	let value = $derived(stringify(submissionValues));

	// Steps Manager
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

	function formatMemory(quantity: string): string {
		if (!quantity) return quantity;
		const giMatch = quantity.match(/^(\d+(?:\.\d+)?)Gi$/);
		if (giMatch) return `${giMatch[1]} GB`;
		const miMatch = quantity.match(/^(\d+(?:\.\d+)?)Mi$/);
		if (miMatch) {
			const mb = parseFloat(miMatch[1]);
			return mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`;
		}
		const tiMatch = quantity.match(/^(\d+(?:\.\d+)?)Ti$/);
		if (tiMatch) return `${tiMatch[1]} TB`;
		return quantity;
	}

	// Fetch Instance Types
	async function fetchInstanceTypesAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		try {
			const itKind = values.spec.instancetype.kind as string;
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
				listRequest.namespace = existingNamespace;
			}
			const response = await resourceClient.list(listRequest);
			return response.items
				.map((item: any) => {
					const obj = item.object as any;
					const name = obj?.metadata?.name as string;
					if (!name || !name.toLowerCase().includes(search.toLowerCase())) return null;
					const cpuCores = obj?.spec?.cpu?.guest;
					const memoryRaw = obj?.spec?.memory?.guest;
					const specs: string[] = [];
					if (cpuCores) specs.push(`CPU: ${cpuCores} Core`);
					if (memoryRaw) specs.push(`RAM: ${formatMemory(memoryRaw)}`);
					const label = specs.length ? `${name} (${specs.join(' , ')})` : name;
					return { label, value: name };
				})
				.filter((item): item is { label: string; value: string } => item !== null);
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
				namespace: existingNamespace,
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
	let open = $state(false);
	let isSubmitting = $state(false);
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();
		if (!isOpen) {
			reset();
		}
	}}
>
	<AlertDialog.Trigger>
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
			<!-- Step 1: Instance Type Kind -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...lodash.get(jsonSchema, 'properties.spec.properties.instancetype.properties.kind', {
							type: 'string'
						}),
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
					initialValue={(existingInstanceTypeKind ?? 'VirtualMachineInstancetype') as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['instancetype']['kind']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-end gap-3">
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<!-- Step 2: Instance Type -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						...lodash.get(jsonSchema, 'properties.spec.properties.instancetype.properties.name', {
							type: 'string'
						}),
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
							TailoredComboboxEmptyText: 'No Instance Types found.',
							TailoredComboboxPopoverClass: 'w-[380px]'
						}
					} as UiSchemaRoot}
					initialValue={(existingInstanceTypeName ?? null) as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['instancetype']['name']}
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
			<!-- Step 3: Additional Disks -->
			<Tabs.Content value={steps[2]}>
				<Form
					schema={{
						type: 'array',
						title: 'Additional Data Disks',
						items: {
							type: 'string',
							title: 'Data Disk'
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							addable: true,
							removable: true,
							orderable: false,
							translations: {
								submit: 'Next'
							}
						},
						items: {
							'ui:components': {
								stringField: 'enumField',
								selectWidget: ComboboxWidget
							},
							'ui:options': {
								TailoredComboboxEnumerations: fetchDataVolumesAsEnumerations,
								TailoredComboboxVisibility: 10,
								TailoredComboboxInput: {
									placeholder: 'Select DataVolume'
								},
								TailoredComboboxEmptyText: 'No DataVolumes found.'
							}
						}
					} as UiSchemaRoot}
					initialValue={existingAdditionalDisks as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['additionalDisks']}
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
			<!-- Step 4: Cloud-Init -->
			<Tabs.Content value={steps[3]}>
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
					initialValue={(existingCloudInit ||
						'#cloud-config\npassword: password\nchpasswd:\n  expire: false') as FormValue}
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
			<!-- Step 5: Review & Edit -->
			<Tabs.Content value={steps[4]}>
				<div class="flex h-full flex-col gap-3">
					<!-- <Code.Root lang="yaml" class="w-full" hideLines code={stringify(submissionValues, null, 2)} /> -->
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

									await resourceClient.apply({
										cluster,
										name,
										namespace: existingNamespace,
										group,
										version,
										resource,
										manifest,
										fieldManager: 'otterscale-web-ui',
										force: true
									});
								},
								{
									loading: `Editing ${kind} ${name}...`,
									success: () => {
										return `Successfully edited ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to edit ${kind} ${name}:`, error);
										return `Failed to edit ${kind} ${name}: ${(error as ConnectError).message}`;
									},
									finally() {
										isSubmitting = false;
										open = false;
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
	</AlertDialog.Content>
</AlertDialog.Root>
