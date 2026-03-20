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

	// Determine existing source type
	const existingSource = lodash.get(object, 'spec.source', {});
	const existingSourceType =
		Object.keys(existingSource).find(
			(k) => existingSource[k] && typeof existingSource[k] === 'object'
		) ?? 'blank';

	// Extract source details based on type
	const existingSourceDetails = existingSource[existingSourceType] ?? {};
	const existingSourceUrl = existingSourceDetails.url ?? '';
	const existingSourceSecretRef = existingSourceDetails.secretRef ?? '';
	const existingSourceCertConfigMap = existingSourceDetails.certConfigMap ?? '';
	const existingRegistryPullMethod = existingSourceDetails.pullMethod ?? '';
	const existingSourcePvcName = existingSourceDetails.name ?? '';
	const existingSourcePvcNamespace = existingSourceDetails.namespace ?? existingNamespace;

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
		sourceUrl: existingSourceUrl,
		sourceSecretRef: existingSourceSecretRef,
		sourceCertConfigMap: existingSourceCertConfigMap,
		sourcePvcName: existingSourcePvcName,
		sourcePvcNamespace: existingSourcePvcNamespace,
		registryPullMethod: existingRegistryPullMethod,
		storageSize: existingStorageSize,
		accessMode: existingAccessMode,
		storageClassName: existingStorageClassName,
		volumeMode: existingVolumeMode
	});

	// Build source object based on selected source type
	function buildSource(): Record<string, any> {
		const st = values.sourceType as string;
		switch (st) {
			case 'blank':
				return { blank: {} };
			case 'upload':
				return { upload: {} };
			case 'http': {
				const src: any = { url: values.sourceUrl };
				if (values.sourceSecretRef) src.secretRef = values.sourceSecretRef;
				if (values.sourceCertConfigMap) src.certConfigMap = values.sourceCertConfigMap;
				return { http: src };
			}
			case 'registry': {
				const src: any = { url: values.sourceUrl };
				if (values.sourceSecretRef) src.secretRef = values.sourceSecretRef;
				if (values.registryPullMethod) src.pullMethod = values.registryPullMethod;
				return { registry: src };
			}
			case 'pvc':
				return {
					pvc: {
						name: values.sourcePvcName,
						namespace: values.sourcePvcNamespace || existingNamespace
					}
				};
			case 's3': {
				const src: any = { url: values.sourceUrl };
				if (values.sourceSecretRef) src.secretRef = values.sourceSecretRef;
				return { s3: src };
			}
			case 'gcs': {
				const src: any = { url: values.sourceUrl };
				if (values.sourceSecretRef) src.secretRef = values.sourceSecretRef;
				return { gcs: src };
			}
			default:
				return { blank: {} };
		}
	}

	// Derived submission values
	const submissionValues = $derived.by(() => {
		const pvc: any = {
			accessModes: values.accessMode ? [values.accessMode] : ['ReadWriteOnce'],
			resources: {
				requests: {
					storage: values.storageSize || '10Gi'
				}
			}
		};
		if (values.storageClassName) {
			pvc.storageClassName = values.storageClassName;
		}
		if (values.volumeMode) {
			pvc.volumeMode = values.volumeMode;
		}

		return {
			apiVersion: group ? `${group}/${version}` : version,
			kind,
			metadata: {
				name: lodash.get(object, 'metadata.name'),
				namespace: existingNamespace
			},
			spec: {
				source: buildSource(),
				pvc
			}
		};
	});
	let value = $derived(stringify(submissionValues));

	// Steps Manager
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
			const ns = (values.sourcePvcNamespace as string) || existingNamespace;
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
							type: 'object',
							title: 'HTTP Source',
							required: ['url'],
							properties: {
								url: { type: 'string', title: 'URL' },
								secretRef: { type: 'string', title: 'Secret Reference' },
								certConfigMap: { type: 'string', title: 'Certificate ConfigMap' }
							}
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							},
							url: {
								'ui:options': {
									help: 'Browse available images at https://cloud-images.ubuntu.com/',
									shadcn4Text: {
										placeholder:
											'https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img'
									}
								}
							}
						} as UiSchemaRoot}
						initialValue={{
							url: existingSourceUrl,
							secretRef: existingSourceSecretRef,
							certConfigMap: existingSourceCertConfigMap
						} as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={
							() => ({
								url: values.sourceUrl,
								secretRef: values.sourceSecretRef,
								certConfigMap: values.sourceCertConfigMap
							}),
							(v: any) => {
								values.sourceUrl = v.url;
								values.sourceSecretRef = v.secretRef;
								values.sourceCertConfigMap = v.certConfigMap;
							}
						}
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
							type: 'object',
							title: 'Registry Source',
							required: ['url'],
							properties: {
								url: { type: 'string', title: 'Image URL' },
								secretRef: { type: 'string', title: 'Secret Reference' },
								pullMethod: {
									type: 'string',
									title: 'Pull Method',
									enum: ['node', 'pod']
								}
							}
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
						initialValue={{
							url: existingSourceUrl,
							secretRef: existingSourceSecretRef,
							pullMethod: existingRegistryPullMethod
						} as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={
							() => ({
								url: values.sourceUrl,
								secretRef: values.sourceSecretRef,
								pullMethod: values.registryPullMethod
							}),
							(v: any) => {
								values.sourceUrl = v.url;
								values.sourceSecretRef = v.secretRef;
								values.registryPullMethod = v.pullMethod;
							}
						}
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
							type: 'object',
							title: 'PVC Source',
							required: ['name'],
							properties: {
								namespace: { type: 'string', title: 'Source Namespace' },
								name: { type: 'string', title: 'PVC Name' }
							}
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
						initialValue={{
							namespace: existingSourcePvcNamespace,
							name: existingSourcePvcName
						} as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={
							() => ({
								namespace: values.sourcePvcNamespace,
								name: values.sourcePvcName
							}),
							(v: any) => {
								values.sourcePvcNamespace = v.namespace;
								values.sourcePvcName = v.name;
							}
						}
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
				{:else if sourceType === 's3' || sourceType === 'gcs'}
					<Form
						schema={{
							type: 'object',
							title: `${(sourceType ?? '').toUpperCase()} Source`,
							required: ['url'],
							properties: {
								url: { type: 'string', title: 'URL' },
								secretRef: { type: 'string', title: 'Secret Reference' }
							}
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={{
							url: existingSourceUrl,
							secretRef: existingSourceSecretRef
						} as FormValue}
						handleSubmit={{
							posthook: () => {
								handleNext();
							}
						}}
						bind:values={
							() => ({
								url: values.sourceUrl,
								secretRef: values.sourceSecretRef
							}),
							(v: any) => {
								values.sourceUrl = v.url;
								values.sourceSecretRef = v.secretRef;
							}
						}
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
			<!-- Step 3: Storage Configuration -->
			<Tabs.Content value={steps[2]}>
				<div class="flex flex-col gap-4">
					<Form
						schema={{
							type: 'string',
							title: 'Size (e.g. 10Gi)'
						} as Schema}
						uiSchema={{} as UiSchemaRoot}
						initialValue={(existingStorageSize ?? '10Gi') as FormValue}
						bind:values={values['storageSize']}
					/>
					<Form
						schema={{
							type: 'string',
							title: 'Access Mode',
							enum: ['ReadWriteOnce', 'ReadWriteMany', 'ReadOnlyMany']
						} as Schema}
						uiSchema={{
							'ui:components': {
								stringField: 'enumField'
							}
						} as UiSchemaRoot}
						initialValue={(existingAccessMode ?? 'ReadWriteOnce') as FormValue}
						bind:values={values['accessMode']}
					/>
					<Form
						schema={{
							type: 'string',
							title: 'Storage Class'
						} as Schema}
						uiSchema={{
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
						} as UiSchemaRoot}
						initialValue={(existingStorageClassName ?? null) as FormValue}
						bind:values={values['storageClassName']}
					/>
					<Form
						schema={{
							type: 'string',
							title: 'Volume Mode',
							enum: ['Filesystem', 'Block']
						} as Schema}
						uiSchema={{
							'ui:components': {
								stringField: 'enumField'
							}
						} as UiSchemaRoot}
						initialValue={(existingVolumeMode ?? 'Filesystem') as FormValue}
						bind:values={values['volumeMode']}
					/>
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
			</Tabs.Content>
			<!-- Step 4: Review & Edit -->
			<Tabs.Content value={steps[3]}>
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
