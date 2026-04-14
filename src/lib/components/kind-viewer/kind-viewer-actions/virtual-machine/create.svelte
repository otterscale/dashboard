<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { ExternalLink, Plus } from '@lucide/svelte';
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
		spec: {
			instancetype: {
				kind: {},
				name: {}
			}
		},
		// UI-only fields (not in API schema)
		diskSourceType: {},
		containerDiskConfig: {
			containerDiskImage: null,
			additionalDisks: []
		},
		diskConfig: {
			bootDisk: null,
			additionalDisks: []
		},
		cloudInit: {},
		// PVC info inherited from selected boot DV
		bootDvPvcInfo: {
			accessModes: ['ReadWriteOnce'],
			volumeMode: 'Filesystem',
			storage: ''
		}
	});

	// Fetch PVC spec from selected boot DataVolume to inherit into dataVolumeTemplates
	async function fetchBootDvPvcInfo(dvName: string | null): Promise<void> {
		if (!dvName || typeof dvName !== 'string') return;
		try {
			const response = await resourceClient.get({
				cluster,
				namespace,
				group: 'cdi.kubevirt.io',
				version: 'v1beta1',
				resource: 'datavolumes',
				name: dvName
			});
			const dv = response.object as any;
			const pvcSpec = lodash.get(dv, 'spec.pvc');
			if (pvcSpec) {
				values.bootDvPvcInfo = {
					accessModes: pvcSpec.accessModes ?? ['ReadWriteOnce'],
					volumeMode: pvcSpec.volumeMode ?? 'Filesystem',
					storage: lodash.get(pvcSpec, 'resources.requests.storage', '')
				};
			}
		} catch (error) {
			console.error('Error fetching DataVolume PVC info, using defaults:', error);
		}
	}

	// Build disks and volumes
	function buildDisksAndVolumes(): { disks: any[]; volumes: any[]; isContainerDisk: boolean } {
		const vmName = typeof values.metadata.name === 'string' ? values.metadata.name : '';
		const isContainerDisk = values.diskSourceType === 'containerDisk';

		const disks: any[] = [{ name: 'os-disk', disk: { bus: 'virtio' }, bootOrder: 1 }];
		const volumes: any[] = [];

		if (isContainerDisk) {
			const image =
				typeof values.containerDiskConfig?.containerDiskImage === 'string'
					? values.containerDiskConfig.containerDiskImage
					: '';
			volumes.push({ name: 'os-disk', containerDisk: { image } });
		} else {
			volumes.push({ name: 'os-disk', dataVolume: { name: vmName } });
		}

		const diskSource = isContainerDisk ? values.containerDiskConfig : values.diskConfig;
		const additionalDvNames: string[] = Array.isArray(diskSource?.additionalDisks)
			? diskSource.additionalDisks
			: [];
		additionalDvNames.forEach((dvName: any, index: number) => {
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

		return { disks, volumes, isContainerDisk };
	}

	// Build dataVolumeTemplates to clone the selected boot DV
	function buildDataVolumeTemplates(): any[] {
		const vmName = typeof values.metadata.name === 'string' ? values.metadata.name : '';
		const bootDvName =
			typeof values.diskConfig?.bootDisk === 'string' ? values.diskConfig.bootDisk : '';
		const { accessModes, volumeMode, storage } = values.bootDvPvcInfo;

		return [
			{
				metadata: { name: vmName },
				spec: {
					source: {
						pvc: {
							namespace,
							name: bootDvName
						}
					},
					pvc: {
						accessModes,
						volumeMode,
						resources: {
							requests: {
								storage
							}
						}
					}
				}
			}
		];
	}

	// Derived submission values (proper VirtualMachine structure)
	const submissionValues = $derived.by(() => {
		const { disks, volumes, isContainerDisk } = buildDisksAndVolumes();

		// Build devices object with disks and interfaces
		const devices: any = {
			disks,
			interfaces: [{ name: 'nic1', bridge: {} }]
		};

		// Add GPUs if selected
		if (gpuPassthroughConfig.selectedResource && typeof gpuPassthroughConfig.selectedResource === 'string' && gpuPassthroughConfig.selectedResource !== '') {
			const gpuDevices: any[] = [
				{
					deviceName: gpuPassthroughConfig.selectedResource,
					name: 'gpu1'
				}
			];

			// Find corresponding AUDIO device
			const match = gpuPassthroughConfig.selectedResource.match(/nvidia\.com\/([A-Z0-9]+)_/);
			if (match) {
				const prefix = match[1];
				const audioDevice = `nvidia.com/${prefix}_HIGH_DEFINITION_AUDIO_CONTROLLER`;

				// Check if AUDIO device is available
				if (allAvailableGpuResources.includes(audioDevice)) {
					gpuDevices.push({
						deviceName: audioDevice,
						name: 'gpu1-audio'
					});
				}
			}

			devices.gpus = gpuDevices;
		}

		return {
			apiVersion: group ? `${group}/${version}` : version,
			kind,
			metadata: {
				name: values.metadata.name,
				namespace,
				annotations: {
					'kubevirt.io/allow-pod-bridge-network-live-migration': 'true'
				}
			},
			spec: {
				runStrategy: 'Halted',
				instancetype: values.spec.instancetype,
				...(isContainerDisk ? {} : { dataVolumeTemplates: buildDataVolumeTemplates() }),
				template: {
					metadata: {
						labels: {
							'kubevirt.io/vm': values.metadata.name
						}
					},
					spec: {
						domain: {
							devices
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
	const steps = Array.from({ length: 8 }, (_, index) => String(index + 1));
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
				listRequest.namespace = namespace;
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

	// Fetch filtered DataVolumes by excluding specific source types
	const EXCLUDED_BOOT_DV_SOURCES = ['blank', 'pvc'];
	const EXCLUDED_ADDITIONAL_DV_SOURCES = ['http', 'pvc'];

	async function fetchBootDataVolumesAsEnumerations(
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
			return response.items
				.filter((item: any) => {
					const source = (item.object as any)?.spec?.source;
					return source && !EXCLUDED_BOOT_DV_SOURCES.some((key) => source[key] != null);
				})
				.map((item: any) => (item.object as any)?.metadata?.name as string)
				.filter((name: string) => name && name.toLowerCase().includes(search.toLowerCase()))
				.map((name: string) => ({ label: name, value: name }));
		} catch (error) {
			console.error('Error fetching boot data volumes:', error);
			return [];
		}
	}

	// Fetch additional DataVolumes (exclude http and pvc/clone sources)
	async function fetchAdditionalDataVolumesAsEnumerations(
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
			return response.items
				.filter((item: any) => {
					const source = (item.object as any)?.spec?.source;
					return source && !EXCLUDED_ADDITIONAL_DV_SOURCES.some((key) => source[key] != null);
				})
				.map((item: any) => (item.object as any)?.metadata?.name as string)
				.filter((name: string) => name && name.toLowerCase().includes(search.toLowerCase()))
				.map((name: string) => ({ label: name, value: name }));
		} catch (error) {
			console.error('Error fetching additional data volumes:', error);
			return [];
		}
	}

	// Fetch nodes with GPU passthrough support
	async function fetchNodesWithGpuPassthrough(): Promise<any[]> {
		try {
			const response = await resourceClient.list({
				cluster,
				group: '',
				version: 'v1',
				resource: 'nodes'
			});

			const requiredLabels = {
				'nvidia.com/gpu.workload.config': 'vm-passthrough',
				'nvidia.com/gpu.present': 'true'
			};

			return response.items.filter((item: any) => {
				const nodeLabels = (item.object as any)?.metadata?.labels ?? {};
				return Object.entries(requiredLabels).every(
					([key, value]) => nodeLabels[key] === value
				);
			});
		} catch (error) {
			console.error('Error fetching nodes with GPU passthrough:', error);
			return [];
		}
	}

	// Fetch all GPU resources (including AUDIO devices)
	async function fetchAllGpuResources(): Promise<string[]> {
		try {
			const nodes = await fetchNodesWithGpuPassthrough();
			const gpuResources = new Set<string>();

			for (const nodeItem of nodes) {
				const allocatable = (nodeItem.object as any)?.status?.allocatable ?? {};
				Object.keys(allocatable).forEach((resourceKey) => {
					if (
						resourceKey.startsWith('nvidia.com/') &&
						!resourceKey.endsWith('vgpu') &&
						!resourceKey.includes('/vgpu')
					) {
						gpuResources.add(resourceKey);
					}
				});
			}

			return Array.from(gpuResources);
		} catch (error) {
			console.error('Error fetching all GPU resources:', error);
			return [];
		}
	}

	// Fetch GPU resources for dropdown (excluding AUDIO devices)
	async function fetchGpuResourcesAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		try {
			const allResources = allAvailableGpuResources.length > 0
				? allAvailableGpuResources
				: await fetchAllGpuResources();

			const gpuOptions = allResources
				.filter((resource) => !resource.toUpperCase().includes('AUDIO'))
				.filter((resource) => resource.toLowerCase().includes(search.toLowerCase()))
				.map((resource) => ({ label: resource, value: resource }));

			// Add empty option at the beginning
			return [{ label: 'None (No GPU)', value: '' }, ...gpuOptions];
		} catch (error) {
			console.error('Error fetching GPU resources:', error);
			return [{ label: 'None (No GPU)', value: '' }];
		}
	}

	// Cache for all available GPU resources
	let allAvailableGpuResources: string[] = $state([]);

	// Container for GPU passthrough selection
	let gpuPassthroughConfig: any = $state({
		selectedResource: ''
	});

	// Load available GPU resources when dialog opens
	$effect(() => {
		if (open) {
			fetchAllGpuResources().then((resources) => {
				allAvailableGpuResources = resources;
			});
		}
	});

	// Flag for Dialog
	let isSubmitting = $state(false);
</script>

{#snippet externalLink()}
	<Button
		href="https://quay.io/organization/containerdisks"
		target="_blank"
		rel="noopener noreferrer"
		variant="ghost"
	>
		<ExternalLink size={16} />
	</Button>
{/snippet}

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
					initialValue={'VirtualMachineInstancetype' as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['instancetype']['kind']}
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
					initialValue={null as FormValue}
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
			<!-- Step 4: Disk Source Type -->
			<Tabs.Content value={steps[3]}>
				<Form
					schema={{
						type: 'string',
						title: 'Disk Source Type',
						enum: ['dataVolume', 'containerDisk'],
						enumNames: ['DataVolume (Clone)', 'Container Disk (Image)']
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
					initialValue={'dataVolume' as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['diskSourceType']}
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
			<!-- Step 5: Disks -->
			<Tabs.Content value={steps[4]}>
				{#if values.diskSourceType === 'containerDisk'}
					<Form
						schema={{
							type: 'object',
							title: 'Container Disk',
							properties: {
								containerDiskImage: {
									type: 'string',
									title: 'Container Disk Image'
								},
								additionalDisks: {
									type: 'array',
									title: 'Additional Data Disks',
									items: {
										type: 'string',
										title: 'Data Disk'
									}
								}
							},
							required: ['containerDiskImage']
						} as Schema}
						uiSchema={{
							containerDiskImage: {
								'ui:options': {
									action: externalLink,
									shadcn4Text: {
										placeholder: 'e.g. quay.io/kubevirt/fedora-cloud-container-disk-demo:latest'
									}
								}
							},
							additionalDisks: {
								'ui:options': {
									addable: true,
									removable: true,
									orderable: false
								},
								items: {
									'ui:components': {
										stringField: 'enumField',
										selectWidget: ComboboxWidget
									},
									'ui:options': {
										TailoredComboboxEnumerations: fetchAdditionalDataVolumesAsEnumerations,
										TailoredComboboxVisibility: 10,
										TailoredComboboxInput: {
											placeholder: 'Select DataVolume'
										},
										TailoredComboboxEmptyText: 'No DataVolumes found.'
									}
								}
							},
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={{ containerDiskImage: null, additionalDisks: [] } as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['containerDiskConfig']}
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
					<Form
						schema={{
							type: 'object',
							title: 'Disks',
							properties: {
								bootDisk: {
									type: 'string',
									title: 'Boot Disk (DataVolume to Clone)'
								},
								additionalDisks: {
									type: 'array',
									title: 'Additional Data Disks',
									items: {
										type: 'string',
										title: 'Data Disk'
									}
								}
							},
							required: ['bootDisk']
						} as Schema}
						uiSchema={{
							bootDisk: {
								'ui:components': {
									stringField: 'enumField',
									selectWidget: ComboboxWidget
								},
								'ui:options': {
									TailoredComboboxEnumerations: fetchBootDataVolumesAsEnumerations,
									TailoredComboboxVisibility: 10,
									TailoredComboboxInput: {
										placeholder: 'Select Boot DataVolume'
									},
									TailoredComboboxEmptyText: 'No DataVolumes found.',
									TailoredComboboxPopoverClass: 'w-[380px]'
								}
							},
							additionalDisks: {
								'ui:options': {
									addable: true,
									removable: true,
									orderable: false
								},
								items: {
									'ui:components': {
										stringField: 'enumField',
										selectWidget: ComboboxWidget
									},
									'ui:options': {
										TailoredComboboxEnumerations: fetchAdditionalDataVolumesAsEnumerations,
										TailoredComboboxVisibility: 10,
										TailoredComboboxInput: {
											placeholder: 'Select DataVolume'
										},
										TailoredComboboxEmptyText: 'No DataVolumes found.'
									}
								}
							},
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={{ bootDisk: null, additionalDisks: [] } as FormValue}
						handleSubmit={{
							posthook: async () => {
								await fetchBootDvPvcInfo(values.diskConfig?.bootDisk ?? null);
								handleNext();
							}
						}}
						bind:values={values['diskConfig']}
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
				{/if}
			</Tabs.Content>
			<!-- Step 6: GPU Passthrough -->
			<Tabs.Content value={steps[5]}>
				<Form
					schema={{
						type: 'object',
						title: 'GPU Passthrough Configuration',
						properties: {
							selectedResource: {
								type: 'string',
								title: 'GPU Resource Type'
							}
						},
						required: []
					} as Schema}
					uiSchema={{
						selectedResource: {
							'ui:components': {
								stringField: 'enumField',
								selectWidget: ComboboxWidget
							},
							'ui:options': {
								TailoredComboboxEnumerations: fetchGpuResourcesAsEnumerations,
								TailoredComboboxVisibility: 10,
								TailoredComboboxInput: {
									placeholder: 'Select GPU Resource'
								},
								TailoredComboboxEmptyText: 'No GPU resources found.',
								TailoredComboboxPopoverClass: 'w-[380px]'
							}
						},
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={{ selectedResource: '' } as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={gpuPassthroughConfig}
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
			<!-- Step 7: Cloud-Init -->
			<Tabs.Content value={steps[6]}>
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
			<!-- Step 8: Review & Create -->
			<Tabs.Content value={steps[7]} class="min-h-[77vh]">
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
