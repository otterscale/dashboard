<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { ExternalLink, FormIcon } from '@lucide/svelte';
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

	// Determine existing source type
	const existingSource = lodash.get(object, 'spec.source', {});
	const existingSourceType =
		Object.keys(existingSource).find(
			(k) => existingSource[k] && typeof existingSource[k] === 'object'
		) ?? 'blank';

	// Extract storage config
	const existingStorageSize =
		lodash.get(object, 'spec.pvc.resources.requests.storage') ??
		lodash.get(object, 'spec.storage.resources.requests.storage') ??
		'10Gi';
	const existingAccessModes =
		lodash.get(object, 'spec.pvc.accessModes') ??
		lodash.get(object, 'spec.storage.accessModes') ??
		[];
	const existingAccessMode = existingAccessModes[0] ?? 'ReadWriteOnce';
	const existingStorageClassName =
		lodash.get(object, 'spec.pvc.storageClassName') ??
		lodash.get(object, 'spec.storage.storageClassName') ??
		'';
	const existingVolumeMode =
		lodash.get(object, 'spec.pvc.volumeMode') ??
		lodash.get(object, 'spec.storage.volumeMode') ??
		'Filesystem';

	// Container for Data
	let values: any = $state({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		sourceType: existingSourceType,
		// Storage config
		storageSize: existingStorageSize,
		spec: {
			source: {
				http: existingSource.http ?? {},
				registry: existingSource.registry ?? {},
				pvc: existingSource.pvc ?? {},
				s3: existingSource.s3 ?? {},
				gcs: existingSource.gcs ?? {}
			},
			pvc: {
				accessModes: existingAccessMode,
				storageClassName: existingStorageClassName,
				volumeMode: existingVolumeMode
			}
		}
	});

	// Build source object based on selected source type
	function buildSource(): Record<string, any> {
		const st = values.sourceType as string;
		switch (st) {
			case 'blank':
				return { blank: {} };
			case 'upload':
				return { upload: {} };
			case 'http':
				return { http: values.spec.source.http };
			case 'registry':
				return { registry: values.spec.source.registry };
			case 'pvc':
				return { pvc: values.spec.source.pvc };
			case 's3':
				return { s3: values.spec.source.s3 };
			case 'gcs':
				return { gcs: values.spec.source.gcs };
			default:
				return { blank: {} };
		}
	}

	// Derived submission values
	const submissionValues = $derived.by(() => ({
		apiVersion: group ? `${group}/${version}` : version,
		kind,
		metadata: {
			name: lodash.get(object, 'metadata.name'),
			namespace: existingNamespace
		},
		spec: {
			source: buildSource(),
			pvc: {
				resources: { requests: { storage: values.storageSize } },
				accessModes: [values.spec.pvc.accessModes],
				storageClassName: values.spec.pvc.storageClassName,
				volumeMode: values.spec.pvc.volumeMode
			}
		}
	}));
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

	// Fetch StorageClasses
	async function fetchStorageClassesAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		try {
			const response = await resourceClient.list({
				cluster,
				group: 'storage.k8s.io',
				version: 'v1',
				resource: 'storageclasses'
			});
			const names = response.items
				.map((item: any) => (item.object as any)?.metadata?.name as string)
				.filter((name: string) => name && name.toLowerCase().includes(search.toLowerCase()));
			return names.map((name: string) => ({ label: name, value: name }));
		} catch (error) {
			console.error('Error fetching storage classes:', error);
			return [];
		}
	}

	// Fetch PVCs (for pvc source type)
	async function fetchPVCsAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		try {
			const ns = (values.spec.source.pvc.namespace as string) || existingNamespace;
			const response = await resourceClient.list({
				cluster,
				namespace: ns,
				group: '',
				version: 'v1',
				resource: 'persistentvolumeclaims'
			});
			const names = response.items
				.map((item: any) => (item.object as any)?.metadata?.name as string)
				.filter((name: string) => name && name.toLowerCase().includes(search.toLowerCase()));
			return names.map((name: string) => ({ label: name, value: name }));
		} catch (error) {
			console.error('Error fetching PVCs:', error);
			return [];
		}
	}

	// Fetch Namespaces (for pvc source namespace)
	async function fetchNamespacesAsEnumerations(
		search: string
	): Promise<{ label: string; value: string }[]> {
		try {
			const response = await resourceClient.list({
				cluster,
				group: '',
				version: 'v1',
				resource: 'namespaces'
			});
			const names = response.items
				.map((item: any) => (item.object as any)?.metadata?.name as string)
				.filter((name: string) => name && name.toLowerCase().includes(search.toLowerCase()));
			return names.map((name: string) => ({ label: name, value: name }));
		} catch (error) {
			console.error('Error fetching namespaces:', error);
			return [];
		}
	}

	// Flag for Dialog
	let open = $state(false);
	let isSubmitting = $state(false);

	// Reactive source type for conditional rendering
	const sourceType = $derived(values.sourceType as string);
</script>

{#snippet externalLink()}
	<Button
		href="https://cloud-images.ubuntu.com/"
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
		<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[50vh]">
			<!-- Step 1: Source Type -->
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						type: 'string',
						title: 'Source Type',
						enum: ['blank', 'http', 'registry', 'pvc', 's3', 'gcs', 'upload']
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
					initialValue={(existingSourceType ?? 'blank') as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['sourceType']}
				>
					{#snippet actions()}
						<div class="flex w-full items-center justify-end gap-3">
							<SubmitButton />
						</div>
					{/snippet}
				</Form>
			</Tabs.Content>
			<!-- Step 2: Source Details -->
			<Tabs.Content value={steps[1]}>
				{#if sourceType === 'blank' || sourceType === 'upload'}
					<div class="flex min-h-[50vh] flex-col gap-3">
						<div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
							{#if sourceType === 'blank'}
								Empty volume — no source configuration needed.
							{:else}
								Upload source selected — data will be uploaded after creation.
							{/if}
						</div>
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
				{:else if sourceType === 'http'}
					<Form
						schema={{
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.source.properties.http'),
								'properties'
							),
							properties: {
								...lodash.pick(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.source.properties.http.properties'
									),
									['url', 'secretRef', 'certConfigMap']
								)
							},
							title: 'HTTP'
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							},
							url: {
								'ui:options': {
									action: externalLink,
									shadcn4Text: {
										placeholder:
											'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img'
									}
								}
							}
						} as UiSchemaRoot}
						initialValue={(existingSource.http ?? null) as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['spec']['source']['http']}
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
				{:else if sourceType === 'registry'}
					<Form
						schema={{
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.source.properties.registry'),
								'properties'
							),
							properties: {
								...lodash.pick(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.source.properties.registry.properties'
									),
									['url', 'secretRef', 'pullMethod']
								)
							},
							title: 'Registry'
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							},
							pullMethod: {
								'ui:components': {
									stringField: 'enumField'
								}
							}
						} as UiSchemaRoot}
						initialValue={(existingSource.registry ?? null) as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['spec']['source']['registry']}
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
				{:else if sourceType === 'pvc'}
					<Form
						schema={{
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.source.properties.pvc'),
								'properties'
							),
							properties: {
								...lodash.pick(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.source.properties.pvc.properties'
									),
									['name', 'namespace']
								)
							},
							title: 'PVC'
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							},
							namespace: {
								'ui:components': {
									stringField: 'enumField',
									selectWidget: ComboboxWidget
								},
								'ui:options': {
									TailoredComboboxEnumerations: fetchNamespacesAsEnumerations,
									TailoredComboboxVisibility: 10,
									TailoredComboboxInput: { placeholder: 'Select Namespace' },
									TailoredComboboxEmptyText: 'No namespaces found.'
								}
							},
							name: {
								'ui:components': {
									stringField: 'enumField',
									selectWidget: ComboboxWidget
								},
								'ui:options': {
									TailoredComboboxEnumerations: fetchPVCsAsEnumerations,
									TailoredComboboxVisibility: 10,
									TailoredComboboxInput: { placeholder: 'Select PVC' },
									TailoredComboboxEmptyText: 'No PVCs found.'
								}
							}
						} as UiSchemaRoot}
						initialValue={(existingSource.pvc ?? { namespace: existingNamespace }) as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['spec']['source']['pvc']}
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
				{:else if sourceType === 's3'}
					<Form
						schema={{
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.source.properties.s3'),
								'properties'
							),
							properties: {
								...lodash.pick(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.source.properties.s3.properties'
									),
									['url', 'secretRef']
								)
							},
							title: 'S3'
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={(existingSource.s3 ?? null) as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['spec']['source']['s3']}
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
				{:else if sourceType === 'gcs'}
					<Form
						schema={{
							...lodash.omit(
								lodash.get(jsonSchema, 'properties.spec.properties.source.properties.gcs'),
								'properties'
							),
							properties: {
								...lodash.pick(
									lodash.get(
										jsonSchema,
										'properties.spec.properties.source.properties.gcs.properties'
									),
									['url', 'secretRef']
								)
							},
							title: 'GCS'
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={(existingSource.gcs ?? null) as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={values['spec']['source']['gcs']}
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
			<!-- Step 3: Storage Size -->
			<Tabs.Content value={steps[2]}>
				<Form
					schema={{
						...lodash.omit(
							lodash.get(
								jsonSchema,
								'properties.spec.properties.pvc.properties.resources.properties.requests'
							),
							'anyOf'
						),
						type: 'string',
						title: 'Storage'
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={existingStorageSize as FormValue}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					bind:values={values['storageSize']}
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
			<!-- Step 4: Storage Configuration -->
			<Tabs.Content value={steps[3]}>
				<Form
					schema={{
						...lodash.omit(lodash.get(jsonSchema, 'properties.spec.properties.pvc'), 'properties'),
						title: 'Storage',
						properties: {
							accessModes: {
								...lodash.omit(
									lodash.get(jsonSchema, 'properties.spec.properties.pvc.properties.accessModes'),
									['items', 'type']
								),
								enum: ['ReadWriteOnce', 'ReadWriteMany', 'ReadOnlyMany'],
								title: 'Access Modes'
							},
							storageClassName: {
								...lodash.get(
									jsonSchema,
									'properties.spec.properties.pvc.properties.storageClassName'
								)
							},
							volumeMode: {
								...lodash.get(jsonSchema, 'properties.spec.properties.pvc.properties.volumeMode'),
								enum: ['Filesystem', 'Block'],
								title: 'Volume Mode'
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						accessModes: {
							'ui:components': {
								stringField: 'enumField'
							}
						},
						storageClassName: {
							'ui:components': {
								stringField: 'enumField',
								selectWidget: ComboboxWidget
							},
							'ui:options': {
								TailoredComboboxEnumerations: fetchStorageClassesAsEnumerations,
								TailoredComboboxVisibility: 10,
								TailoredComboboxInput: {
									placeholder: 'Select Storage Class (optional)'
								},
								TailoredComboboxEmptyText: 'No Storage Classes found.'
							}
						},
						volumeMode: {
							'ui:components': {
								stringField: 'enumField'
							}
						}
					} as UiSchemaRoot}
					handleSubmit={{
						posthook: () => {
							handleNext();
						}
					}}
					initialValue={{
						accessModes: existingAccessMode,
						storageClassName: existingStorageClassName,
						volumeMode: existingVolumeMode
					} as FormValue}
					bind:values={values['spec']['pvc']}
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
	</Dialog.Content>
</Dialog.Root>
