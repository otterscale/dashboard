<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService, type SchemaRequest } from '@otterscale/api/resource/v1';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext, onMount } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		cluster,
		namespace,
		vmName,
		service,
		open = $bindable(false),
		onsuccess
	}: {
		cluster: string;
		namespace: string;
		vmName: string;
		service: any;
		open?: boolean;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Fetch Service JSON Schema
	// eslint-disable-next-line
	let jsonSchema: any = $state({});

	async function fetchSchema() {
		try {
			const schemaResponse = await resourceClient.schema({
				cluster: cluster,
				group: '',
				version: 'v1',
				kind: 'Service'
			} as SchemaRequest);

			jsonSchema = schemaResponse.schema ?? {};
		} catch (error) {
			console.error('Failed to fetch Service schema:', error);
		}
	}

	onMount(() => {
		fetchSchema();
	});

	// Extract existing ports from service object
	const existingPorts = lodash.get(service, 'spec.ports', []).map((p: any) => ({
		name: p.name ?? '',
		protocol: p.protocol ?? 'TCP',
		port: p.port ?? 80,
		targetPort: p.targetPort ?? p.port ?? 80,
		...(p.nodePort ? { nodePort: p.nodePort } : {})
	}));

	// Container for Data
	let values: any = $state({
		apiVersion: 'v1',
		kind: 'Service',
		metadata: {
			name: lodash.get(service, 'metadata.name', vmName),
			namespace,
			labels: {
				...lodash.get(service, 'metadata.labels', {}),
				'otterscale.com/virtual-machine.name': vmName
			}
		},
		spec: {
			type: lodash.get(service, 'spec.type', 'NodePort'),
			selector: lodash.get(service, 'spec.selector', {
				'kubevirt.io/vm': vmName
			}),
			ports: {}
		}
	});
	let value = $derived(stringify(values));

	// Steps Manager
	const steps = Array.from({ length: 2 }, (_, index) => String(index + 1));
	const [firstStep] = steps;
	let currentStep = $state(firstStep);
	const currentIndex = $derived(steps.indexOf(currentStep));
	function handleNext() {
		currentStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
	}
	function reset() {
		currentStep = firstStep;
	}

	// Flag for Dialog
	let isSubmitting = $state(false);
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			reset();
		}
	}}
>
	<AlertDialog.Content class="max-h-[95vh] min-w-[38vw] overflow-auto">
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} />
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Update Service</Item.Title>
				<Item.Description>
					Update the service ports for VM <strong>{vmName}</strong>
				</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep}>
			<!-- Step 1: Ports Configuration -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.ports') as any,
							'items'
						),
						title: 'Ports',
						items: {
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.ports.items') as any,
								['properties', 'required']
							),
							required: ['name', 'protocol', 'port', 'targetPort'],
							properties: {
								name: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.ports.items.properties.name'
									),
									title: 'Name'
								},
								protocol: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.ports.items.properties.protocol'
									),
									title: 'Protocol',
									enum: ['TCP', 'UDP', 'SCTP']
								},
								port: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.ports.items.properties.port'
									),
									title: 'Port'
								},
								targetPort: {
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.ports.items.properties.targetPort'
										),
										'oneOf'
									),
									type: 'integer',
									title: 'Target Port'
								},
								nodePort: {
									...lodash.get(
										jsonSchema,
										'properties.spec.properties.ports.items.properties.nodePort'
									),
									title: 'Node Port (optional)'
								}
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							itemTitle: () => 'Port',
							translations: {
								submit: 'Next',
								'add-array-item': 'Add Port'
							}
						},
						items: {
							'ui:options': {
								layouts: {
									'object-properties': {
										class: 'grid grid-cols-2 gap-3'
									}
								}
							},
							protocol: {
								'ui:components': {
									stringField: 'enumField',
									selectWidget: 'comboboxWidget'
								}
							}
						}
					} as UiSchemaRoot}
					initialValue={existingPorts as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['spec']['ports']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-between gap-3">
							<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>

			<!-- Step 2: Review & Update -->
			<Tabs.Content value={steps[1]} class="min-h-[77vh]">
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

							const name = lodash.get(values, 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(value);

									await resourceClient.apply({
										cluster,
										name,
										namespace,
										group: '',
										version: 'v1',
										resource: 'services',
										manifest,
										fieldManager: 'otterscale-web-ui',
										force: true
									});
								},
								{
									loading: `Updating Service ${name}...`,
									success: () => {
										onsuccess?.();
										return `Successfully updated Service ${name}`;
									},
									error: (error) => {
										console.error(`Failed to update Service ${name}:`, error);
										return `Failed to update Service ${name}: ${lodash.get(error, 'message')}`;
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
