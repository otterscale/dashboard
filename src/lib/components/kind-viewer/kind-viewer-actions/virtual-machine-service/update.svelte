<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1Service } from '@otterscale/types';
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
		vmName,
		service,
		schema: jsonSchema,
		open = $bindable(false),
		onsuccess
	}: {
		cluster: string;
		namespace: string;
		vmName: string;
		service: CoreV1Service;
		schema: Schema;
		open?: boolean;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const steps = Array.from({ length: 2 }, (_, index) => String(index + 1));
	const [firstStep] = steps;

	let values = $state(getInitialValues());
	let currentStep = $state(firstStep);
	let isSubmitting = $state(false);

	let value = $derived(stringify(values));
	const currentIndex = $derived(steps.indexOf(currentStep));

	// Extract existing ports for Form initialValue
	const existingPorts = $derived(
		(service.spec?.ports ?? []).map((p) => ({
			name: p.name ?? '',
			protocol: p.protocol ?? 'TCP',
			port: p.port ?? 80,
			targetPort: p.targetPort ?? p.port ?? 80,
			...(p.nodePort ? { nodePort: p.nodePort } : {})
		}))
	);

	function getInitialValues() {
		return {
			apiVersion: 'v1',
			kind: 'Service',
			metadata: {
				name: service.metadata?.name ?? vmName,
				namespace,
				labels: {
					...(service.metadata?.labels ?? {}),
					'otterscale.com/virtual-machine.name': vmName
				}
			},
			spec: {
				type: service.spec?.type ?? 'NodePort',
				selector: service.spec?.selector ?? {
					'kubevirt.io/vm': vmName
				},
				ports: []
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
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (isOpen) return;

		initiate();
	}}
>
	<Dialog.Content
		class="max-h-[95vh] min-w-[38vw] overflow-auto"
		onInteractOutside={(e) => e.preventDefault()}
	>
		<Item.Root class="p-0">
			<Progress value={currentIndex + 1} max={steps.length} class="mt-1 mr-6" />
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
							lodash.get(jsonSchema, 'properties.spec.properties.ports') as Schema,
							'items'
						),
						title: 'Ports',
						items: {
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.ports.items') as Schema,
								['properties', 'required']
							),
							required: ['name', 'protocol', 'port', 'targetPort'],
							properties: {
								name: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.ports.items.properties.name'
									) as Schema),
									title: 'Name'
								},
								protocol: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.ports.items.properties.protocol'
									) as Schema),
									title: 'Protocol',
									enum: ['TCP', 'UDP', 'SCTP']
								},
								port: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.ports.items.properties.port'
									) as Schema),
									title: 'Port'
								},
								targetPort: {
									...lodash.omit(
										lodash.get(
											jsonSchema,
											'properties.spec.properties.ports.items.properties.targetPort'
										) as Schema,
										'oneOf'
									),
									type: 'integer',
									title: 'Target Port'
								},
								nodePort: {
									...(lodash.get(
										jsonSchema,
										'properties.spec.properties.ports.items.properties.nodePort'
									) as Schema),
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
							<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
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
	</Dialog.Content>
</Dialog.Root>
