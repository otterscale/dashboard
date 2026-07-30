<script lang="ts">
	import { Code, ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { BanIcon, UploadIcon } from '@lucide/svelte';
	import Rocket from '@lucide/svelte/icons/rocket';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { FormState, FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import * as CodeBlock from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import { formatWithBinarySuffix, quantityToScalar } from '$lib/components/dynamic-table/utils';
	import {
		fetchAllGpuNodes as fetchComputeResourceNodes,
		type NodeInfo
	} from '$lib/components/gpu-allocation';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	let {
		cluster,
		namespace,
		schema: jsonSchema,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		schema: Schema;
		object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
		onOpenChangeComplete: () => void;
	} = $props();

	type Patch = { path: Array<string | number>; value: unknown };

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const kserveGroup = 'serving.kserve.io';
	const kserveVersion = 'v1alpha2';
	const serviceKind = 'LLMInferenceService';
	const serviceResource = 'llminferenceservices';
	const configurationKind = 'LLMInferenceServiceConfig';
	const configurationResource = 'llminferenceserviceconfigs';

	const steps = Array.from({ length: 5 }, (_, index) => String(index + 1));
	const [firstStep] = steps;

	async function check(modelName: string): Promise<boolean | null> {
		const harborHost = env.PUBLIC_HARBOR_URL;
		if (!harborHost || !modelName) return null;

		try {
			const reference = modelName.toLowerCase();
			const artifactsUrl = `/api/v2.0/projects/models/repositories/modelcar-catalog/artifacts/${encodeURIComponent(reference)}?with_label=true`;

			const response = await fetch('/bff/helm/repository/harbor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ harborHost, apiPath: artifactsUrl }),
				signal: AbortSignal.timeout(3000)
			});

			if (response.status === 404) return false;

			if (!response.ok) {
				console.error('Failed to fetch model artifact:', response.statusText);
				return null;
			}

			const model = await response.json();
			return lodash.has(model, 'digest');
		} catch (error) {
			console.error('Error checking model artifact:', error);
			return null;
		}
	}

	async function checkModelExistence(uri: string) {
		const token = ++checkToken;
		if (!uri.startsWith('hf://')) {
			isModelExist = null;
			return;
		}
		isModelExist = undefined;
		const result = await check(parseModelName(uri));
		if (token === checkToken) isModelExist = result;
	}

	function parseModelName(modelUrl: string) {
		if (!modelUrl.startsWith('hf://')) return modelUrl;

		const repositoryIdentifier = modelUrl.slice('hf://'.length).replace(/@.*/, '');
		const name = repositoryIdentifier.split('/').pop() ?? '';

		return name;
	}

	function tryModelCarReference(modelUrl: string): string {
		if (!modelUrl || !modelUrl.startsWith('hf://')) return modelUrl;

		const harborUrl = env.PUBLIC_HARBOR_URL ?? '';

		const registry = harborUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

		const modelName = parseModelName(modelUrl);

		return `oci://${registry}/models/modelcar-catalog:${modelName.toLowerCase()}`;
	}

	function getModelSchema(modelUri: string): Schema {
		const modelBaseSchema = lodash.omit(
			lodash.get(jsonSchema, 'properties.spec.properties.model') as Schema,
			['properties', 'required', 'additionalProperties']
		) as Schema;
		const uriSchema = {
			title: 'URI',
			...lodash.omit(
				lodash.get(jsonSchema, 'properties.spec.properties.model.properties.uri') as Schema,
				['description']
			),
			readOnly: true
		};

		if (!modelUri.startsWith('hf://')) {
			return {
				title: 'Model',
				...modelBaseSchema,
				properties: {
					uri: {
						...uriSchema,
						default: modelUri,
						description: 'The model source defined by the platform configuration.'
					}
				}
			} as Schema;
		}

		return {
			title: 'Model',
			...modelBaseSchema,
			properties: {
				internal: {
					type: 'boolean',
					title: 'Use internal registry',
					default: true,
					description:
						'When enabled, an hf:// source is rewritten to its OCI ModelCar reference in the platform registry. When disabled, the source URI is used as-is.'
				}
			},
			allOf: [
				{
					if: { properties: { internal: { const: true } }, required: ['internal'] },
					then: {
						properties: {
							internalUri: {
								...uriSchema,
								default: tryModelCarReference(modelUri),
								description: 'The OCI ModelCar reference in the platform registry.'
							}
						},
						required: ['internalUri']
					}
				},
				{
					if: { properties: { internal: { const: false } }, required: ['internal'] },
					then: {
						properties: {
							uri: {
								...uriSchema,
								default: modelUri,
								description: 'The model source defined by the platform configuration.'
							}
						},
						required: ['uri']
					}
				}
			]
		} as Schema;
	}

	function getUploadCommands(uri: string): string {
		const modelName = parseModelName(uri).toLowerCase();
		const registry = (env.PUBLIC_HARBOR_URL ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');

		return [
			`docker pull quay.io/phison-hci/modelcar-catalog:${modelName}`,
			`docker tag quay.io/phison-hci/modelcar-catalog:${modelName} ${registry}/models/modelcar-catalog:${modelName}`,
			`docker push ${registry}/models/modelcar-catalog:${modelName}`
		].join('\n');
	}

	type GPUDevice = { type: string; node: string };

	function getComputeResources(nodes: NodeInfo[]): GPUDevice[] {
		return nodes.flatMap((node) =>
			node.devices.map((device) => ({
				type: device.type,
				node: node.name
			}))
		);
	}

	function getResourceTopology(devices: GPUDevice[]): Record<string, string[]> {
		const container: Record<string, Set<string>> = {};
		for (const { type, node } of devices) {
			if (!container[type]) {
				container[type] = new Set();
			}
			container[type].add(node);
		}

		const resourceTopology: Record<string, string[]> = {};
		for (const [type, nodes] of Object.entries(container)) {
			resourceTopology[type] = [...nodes];
		}
		return resourceTopology;
	}

	function getWorkloadPlacementSchema(resourceTopology: Record<string, string[]>): Schema {
		const types = Object.keys(resourceTopology);
		if (types.length === 0) {
			return {
				type: 'object',
				properties: {
					type: { type: 'string', title: 'Type' }
				}
			};
		}
		return {
			type: 'object',
			properties: {
				type: { type: 'string', title: 'Type', enum: types }
			},
			dependencies: {
				type: {
					oneOf: Object.entries(resourceTopology).map(([type, nodes]) => ({
						properties: {
							type: { enum: [type] },
							node: { type: 'string', title: 'Node', enum: nodes }
						}
					}))
				}
			}
		};
	}

	function getWorkloadPlacementUISchema() {
		return {
			type: {
				'ui:components': {
					stringField: 'enumField',
					selectWidget: 'comboboxWidget'
				}
			},
			node: {
				'ui:components': {
					stringField: 'enumField',
					selectWidget: 'comboboxWidget'
				}
			}
		};
	}

	const kvCacheOffloadingPath = ['spec', 'kvCacheOffloading'];
	const quantityPattern = '^[0-9]+(\\.[0-9]+)?(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?$';

	function getKvCacheOffloadingSchema(): Schema {
		return {
			title: 'KV Cache Offloading',
			type: 'object',
			properties: {
				enabled: {
					type: 'boolean',
					title: 'Enable KV cache offloading',
					default: false,
					description:
						'When enabled, KV cache blocks evicted from GPU memory are offloaded to a CPU buffer and optional secondary storage tiers.'
				}
			},
			allOf: [
				{
					if: { properties: { enabled: { const: true } }, required: ['enabled'] },
					then: {
						properties: {
							cpu: {
								type: 'string',
								title: 'CPU Buffer Size',
								default: '10Gi',
								pattern: quantityPattern,
								description: 'Size of the CPU memory buffer, e.g. 10Gi.'
							},
							secondary: {
								type: 'array',
								title: 'Secondary Tiers',
								description:
									'Additional file-system offload tiers backed by PVCs, tried in order after the CPU buffer.',
								items: {
									type: 'object',
									properties: {
										storageClassName: {
											type: 'string',
											title: 'Storage Class',
											default: 'aidaptiv-cache'
										},
										storage: {
											type: 'string',
											title: 'Storage Size',
											default: '100Gi',
											pattern: quantityPattern
										}
									},
									required: ['storageClassName', 'storage']
								},
								default: [{ storageClassName: 'aidaptiv-cache', storage: '100Gi' }]
							}
						},
						required: ['cpu']
					}
				}
			]
		} as Schema;
	}

	function pruneEmptyAncestors(target: object, path: Array<string | number>): void {
		for (let depth = path.length - 1; depth > 1; depth--) {
			const ancestorPath = path.slice(0, depth);
			if (lodash.isEmpty(lodash.get(target, ancestorPath))) {
				lodash.unset(target, ancestorPath);
			} else {
				break;
			}
		}
	}

	const mainContainersPath = ['spec', 'template', 'containers'];
	const templateVolumesPath = ['spec', 'template', 'volumes'];

	function ensureEntryByName(target: object, path: Array<string | number>, name: string): number {
		const index = lodash.findIndex(lodash.get(target, path), { name });
		if (index >= 0) return index;
		const appendIndex = lodash.size(lodash.get(target, path));
		lodash.set(target, [...path, appendIndex], { name });
		return appendIndex;
	}

	function toIntegerScalar(scalar: number | bigint): bigint {
		return typeof scalar === 'bigint' ? scalar : BigInt(Math.round(scalar));
	}

	function formatBytesQuantity(bytes: bigint): string {
		const { value, unit } = formatWithBinarySuffix(bytes);
		return `${value}${unit}`;
	}

	// Snapshot of the container/volume subtrees before the KV cache offloading
	// bump, so re-submitting the step stays idempotent and disabling reverts.
	let kvCacheOffloadingPristine: { containers: unknown; volumes: unknown } | null = null;

	function snapshotKvCacheOffloadingTargets() {
		if (kvCacheOffloadingPristine) return;
		kvCacheOffloadingPristine = lodash.cloneDeep({
			containers: lodash.get(values, mainContainersPath),
			volumes: lodash.get(values, templateVolumesPath)
		});
	}

	function restoreKvCacheOffloadingTargets() {
		if (!kvCacheOffloadingPristine) return;
		const snapshots: Array<[Array<string | number>, unknown]> = [
			[mainContainersPath, kvCacheOffloadingPristine.containers],
			[templateVolumesPath, kvCacheOffloadingPristine.volumes]
		];
		for (const [path, snapshot] of snapshots) {
			if (snapshot === undefined) {
				lodash.unset(values, path);
				pruneEmptyAncestors(values, path);
			} else {
				lodash.set(values, path, lodash.cloneDeep(snapshot));
			}
		}
		kvCacheOffloadingPristine = null;
	}

	function applyKvCacheOffloadingResources(cpuQuantity: string) {
		const cpuBufferBytes = toIntegerScalar(quantityToScalar(cpuQuantity));
		const additionalCores = 4;

		const container = {
			list: mainContainersPath,
			valuesIndex: ensureEntryByName(values, mainContainersPath, 'main'),
			objectIndex: lodash.findIndex(lodash.get(object, mainContainersPath), { name: 'main' })
		};
		const volume = {
			list: templateVolumesPath,
			valuesIndex: ensureEntryByName(values, templateVolumesPath, 'dshm'),
			objectIndex: lodash.findIndex(lodash.get(object, templateVolumesPath), { name: 'dshm' })
		};

		const targets = [
			{ ...container, tail: ['resources', 'limits', 'memory'], unit: 'bytes' },
			{ ...container, tail: ['resources', 'requests', 'memory'], unit: 'bytes' },
			{ ...volume, tail: ['emptyDir', 'sizeLimit'], unit: 'bytes' },
			{ ...container, tail: ['resources', 'limits', 'cpu'], unit: 'cores' },
			{ ...container, tail: ['resources', 'requests', 'cpu'], unit: 'cores' }
		];

		for (const target of targets) {
			const valuesPath = [...target.list, target.valuesIndex, ...target.tail];
			const current =
				lodash.get(values, valuesPath) ??
				(target.objectIndex >= 0
					? lodash.get(object, [...target.list, target.objectIndex, ...target.tail])
					: undefined);

			if (target.unit === 'bytes') {
				const currentBytes =
					current === undefined ? BigInt(0) : toIntegerScalar(quantityToScalar(String(current)));
				lodash.set(values, valuesPath, formatBytesQuantity(currentBytes + cpuBufferBytes));
			} else {
				const currentCores = current === undefined ? 0 : Number(quantityToScalar(String(current)));
				lodash.set(values, valuesPath, String(currentCores + additionalCores));
			}
		}
	}

	let values = $state(getInitialValues());
	let currentStep = $state(firstStep);
	let isSubmitting = $state(false);
	let metadataFormReference: FormState<FormValue> | null = $state(null);
	let modelFormReference: FormState<FormValue> | null = $state(null);
	let isModelExist: boolean | null | undefined = $state(undefined);
	let checkToken = 0;
	let open = $state(false);

	let value = $derived(stringify(values));
	const currentIndex = $derived(steps.indexOf(currentStep));

	function getInitialValues() {
		return {
			apiVersion: `${kserveGroup}/${kserveVersion}`,
			kind: serviceKind,
			metadata: {},
			spec: {}
		};
	}
	function initiate() {
		values = getInitialValues();
		kvCacheOffloadingPristine = null;
		currentStep = firstStep;
		isSubmitting = false;
		isModelExist = undefined;
		checkToken++;
		metadataFormReference = null;
		modelFormReference = null;
	}
	function handleNext() {
		currentStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
	}
	function handlePrevious() {
		currentStep = steps[Math.max(currentIndex - 1, 0)];
	}

	const mainContainerImage = $derived(
		((
			lodash.get(object, ['spec', 'template', 'containers'], []) as Array<{
				name?: string;
				image?: string;
			}>
		).find((container) => container.name === 'main')?.image ?? '') as string
	);
	const isMiddleware = $derived(mainContainerImage.includes('/ai-mw/'));
	const middlewareModelServiceName = $derived(
		(lodash.get(object, ['metadata', 'name'], '') as string).replace(/-llmis-config$/, '')
	);
	const middlewareModelConfigurationName = $derived(lodash.get(object, ['metadata', 'name'], ''));
</script>

{#if !page.data.isRestricted}
	{@const modelUri = lodash.get(object, 'spec.model.uri', '') as string}
	{#snippet checking()}
		{@const modelUri = lodash.get(object, 'spec.model.uri', '') as string}
		{@const uploadCommands = getUploadCommands(modelUri)}
		<ButtonGroup.Root>
			<Dialog.Root>
				<Dialog.Trigger>
					<Button size="icon-sm" variant="ghost"><UploadIcon /></Button>
				</Dialog.Trigger>
				<Dialog.Content class="min-w-[50vw]">
					<Dialog.Header>
						<Dialog.Title>Upload Model</Dialog.Title>
						<Dialog.Description>
							If the model <span class="font-mono font-medium">
								{parseModelName(modelUri).toLowerCase()}
							</span>
							is not available in the internal registry, upload it with the following commands.
						</Dialog.Description>
					</Dialog.Header>
					<CodeBlock.Root
						variant="secondary"
						lang="yaml"
						code={uploadCommands}
						class="w-full border-none"
					>
						<CodeBlock.CopyButton />
					</CodeBlock.Root>
				</Dialog.Content>
			</Dialog.Root>
		</ButtonGroup.Root>
	{/snippet}
	<Dialog.Root
		bind:open
		onOpenChange={(isOpen) => {
			if (isOpen) {
				checkModelExistence(modelUri);
			}
		}}
		onOpenChangeComplete={(isOpen) => {
			onOpenChangeComplete?.();

			if (isOpen) return;

			initiate();
		}}
	>
		<Dialog.Trigger>
			{#snippet child({ props })}
				<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
					<Item.Media>
						<Rocket />
					</Item.Media>
					<Item.Content>
						<Item.Title>Deploy</Item.Title>
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
					<Item.Title class="text-xl font-bold">{serviceKind}</Item.Title>
				</Item.Content>
			</Item.Root>
			<Tabs.Root value={currentStep}>
				<Tabs.Content value={steps[0]}>
					<Form
						bind:reference={metadataFormReference}
						schema={{
							...lodash.omit(lodash.get(jsonSchema, 'properties.metadata') as Schema, [
								'properties',
								'required'
							]),
							title: 'Metadata',
							required: [
								...(lodash.get(jsonSchema, 'properties.metadata.required', []) as string[]),
								'name'
							],
							properties: {
								name: {
									...(lodash.get(jsonSchema, 'properties.metadata.properties.name') as Schema),
									title: 'Name',
									...(isMiddleware
										? {
												default: middlewareModelServiceName,
												readOnly: true,
												description:
													'Name is aligned with the template name without suffix "-llmis-config".'
											}
										: {})
								}
							}
						} as Schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={(isMiddleware ? { name: middlewareModelServiceName } : {}) as FormValue}
						handleSubmit={{
							posthook: (form: FormState<FormValue>) => {
								const formValue = getValueSnapshot(form);

								lodash.set(values, 'metadata', {
									name: lodash.get(formValue, ['name'], ''),
									namespace,
									labels: lodash.get(object, ['metadata', 'labels'], {}),
									annotations: lodash.get(object, ['metadata', 'annotations'], {})
								});

								lodash.set(
									values,
									['spec', 'baseRefs'],
									[
										...lodash.get(object, ['spec', 'baseRefs'], []),
										{
											name: isMiddleware
												? middlewareModelConfigurationName
												: lodash.get(formValue, ['name'], '')
										}
									]
								);

								handleNext();
							}
						}}
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

				<Tabs.Content value={steps[1]}>
					{#if isModelExist === undefined}
						<Empty.Root>
							<Empty.Header>
								<Empty.Media variant="icon"><Spinner /></Empty.Media>
								<Empty.Title>Checking model availability</Empty.Title>
							</Empty.Header>
						</Empty.Root>
					{:else}
						<Form
							bind:reference={modelFormReference}
							schema={getModelSchema(modelUri)}
							uiSchema={{
								'ui:options': {
									translations: {
										submit: 'Next'
									}
								},
								internalUri: {
									'ui:options': {
										layouts: {
											'object-property-content': {
												class:
													'[&_p[id$=__help]]:text-amber-600 dark:[&_p[id$=__help]]:text-amber-500'
											}
										},
										action: checking,
										help:
											isModelExist === false
												? 'Model not in internal registry.'
												: isModelExist === null
													? 'Model check failed.'
													: undefined,
										shadcn4Text: {
											placeholder: 'No model source defined in the template.'
										}
									}
								},
								uri: {
									'ui:options': {
										shadcn4Text: {
											placeholder: 'No model source defined in the template.'
										}
									}
								}
							} as UiSchemaRoot}
							initialValue={(modelUri.startsWith('hf://')
								? { internal: true }
								: { uri: modelUri }) as FormValue}
							handleSubmit={{
								posthook: (form) => {
									const formValue = getValueSnapshot(form);
									const useInternal =
										modelUri.startsWith('hf://') &&
										(lodash.get(formValue, 'internal', true) as boolean);

									const modelSource = useInternal ? tryModelCarReference(modelUri) : modelUri;

									const isOci = modelSource.startsWith('oci://');
									const isGptOss = parseModelName(modelUri).toLowerCase().includes('gpt-oss');

									lodash.set(values, ['spec', 'model'], {
										...lodash.omit(lodash.get(object, ['spec', 'model'], {}), ['uri']),
										uri: modelSource
									});

									const ociPatches: Patch[] = [
										{
											path: ['spec', 'template', 'containers'],
											value: [
												{
													name: 'main',
													env: [
														{ name: 'USER', value: 'nonroot' },
														{
															name: 'TORCHINDUCTOR_CACHE_DIR',
															value: '/tmp/torchinductor_cache'
														},
														...(isGptOss
															? [
																	{
																		name: 'TIKTOKEN_ENCODINGS_BASE',
																		value: '/mnt/models/tiktoken_encodings'
																	}
																]
															: [])
													]
												}
											]
										},
										{
											path: ['spec', 'router', 'scheduler', 'template', 'containers'],
											value: [
												{
													name: 'tokenizer',
													env: [
														{ name: 'USER', value: 'nonroot' },
														{ name: 'TORCHINDUCTOR_CACHE_DIR', value: '/tmp/torchinductor_cache' }
													]
												}
											]
										}
									];

									if (isOci) {
										for (const { path, value: patchValue } of ociPatches)
											lodash.set(values, path, patchValue);
									} else {
										for (const { path } of ociPatches) {
											lodash.unset(values, path);
											pruneEmptyAncestors(values, path);
										}
									}

									handleNext();
								}
							}}
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

				<Tabs.Content value={steps[2]}>
					{#await fetchComputeResourceNodes(resourceClient, cluster)}
						<Empty.Root>
							<Empty.Header>
								<Empty.Media variant="icon">
									<Spinner />
								</Empty.Media>
								<Empty.Title>Loading</Empty.Title>
							</Empty.Header>
						</Empty.Root>
					{:then computeResourceNodes}
						{@const computeResources = getComputeResources(computeResourceNodes)}
						{@const resourceTopology = getResourceTopology(computeResources)}
						{@const workloadPlacementSchema = getWorkloadPlacementSchema(resourceTopology)}
						{@const workloadPlacementUISchema = getWorkloadPlacementUISchema()}
						{@const isSingleNode =
							lodash.has(object, 'spec.template') && !lodash.has(object, 'spec.prefill')}
						{@const isPrefillDecode =
							lodash.has(object, 'spec.template') && lodash.has(object, 'spec.prefill')}
						{@const title = 'Workload Placement'}
						{@const description = 'Workload Placement'}
						{#if isSingleNode}
							<Form
								schema={{
									title: title,
									description: description,
									...workloadPlacementSchema
								} as Schema}
								uiSchema={{
									'ui:options': {
										translations: {
											submit: 'Next'
										}
									},
									...workloadPlacementUISchema
								} as UiSchemaRoot}
								initialValue={{} as FormValue}
								handleSubmit={{
									posthook: (form) => {
										const value = getValueSnapshot(form);

										const type = lodash.get(value, 'type') as string | undefined;
										if (type) {
											lodash.set(values, ['spec', 'annotations', 'nvidia.com/use-gputype'], type);
										}

										const node = lodash.get(value, 'node') as string | undefined;
										if (node) {
											lodash.set(
												values,
												['spec', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
												node
											);
										}

										handleNext();
									}
								}}
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
						{:else if isPrefillDecode}
							<Form
								schema={{
									title: title,
									description: description,
									type: 'object',
									properties: {
										decode: { title: 'Decode', ...workloadPlacementSchema },
										prefill: { title: 'Prefill', ...workloadPlacementSchema }
									}
								} as Schema}
								uiSchema={{
									'ui:options': {
										translations: {
											submit: 'Next'
										}
									},
									decode: {
										...workloadPlacementUISchema
									},
									prefill: {
										...workloadPlacementUISchema
									}
								} as UiSchemaRoot}
								initialValue={{} as FormValue}
								handleSubmit={{
									posthook: (form) => {
										const value = getValueSnapshot(form);

										const decodeType = lodash.get(value, ['decode', 'type']) as string | undefined;
										if (decodeType) {
											lodash.set(
												values,
												['spec', 'annotations', 'nvidia.com/use-gputype'],
												decodeType
											);
										}

										const decodeNode = lodash.get(value, ['decode', 'node']) as string | undefined;
										if (decodeNode) {
											lodash.set(
												values,
												['spec', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
												decodeNode
											);
										}

										const prefillType = lodash.get(value, ['prefill', 'type']) as
											| string
											| undefined;
										if (prefillType) {
											lodash.set(
												values,
												['spec', 'prefill', 'annotations', 'nvidia.com/use-gputype'],
												prefillType
											);
										}

										const prefillNode = lodash.get(value, ['prefill', 'node']) as
											| string
											| undefined;
										if (prefillNode) {
											lodash.set(
												values,
												['spec', 'prefill', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
												prefillNode
											);
										}

										handleNext();
									}
								}}
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
					{:catch error}
						<Empty.Root>
							<Empty.Header class="**:text-destructive">
								<Empty.Media variant="icon" class="bg-destructive/30">
									<BanIcon />
								</Empty.Media>
								<Empty.Title>Failed to Load Compute Resources.</Empty.Title>
							</Empty.Header>
							<Empty.Content>{(error as Error).message}</Empty.Content>
						</Empty.Root>
					{/await}
				</Tabs.Content>

				<Tabs.Content value={steps[3]}>
					<Form
						schema={getKvCacheOffloadingSchema()}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								}
							}
						} as UiSchemaRoot}
						initialValue={{ enabled: false } as FormValue}
						handleSubmit={{
							posthook: (form) => {
								const formValue = getValueSnapshot(form);
								const enabled = lodash.get(formValue, 'enabled', false) as boolean;

								restoreKvCacheOffloadingTargets();

								if (enabled) {
									const cpu = lodash.get(formValue, 'cpu', '10Gi') as string;
									const secondary = lodash.get(formValue, 'secondary', []) as Array<{
										storageClassName: string;
										storage: string;
									}>;

									lodash.set(values, kvCacheOffloadingPath, {
										cpu,
										evictionPolicy: 'arc',
										...(secondary.length > 0
											? {
													secondary: secondary.map((tier) => ({
														fileSystem: {
															pvc: {
																spec: {
																	accessModes: ['ReadWriteOnce'],
																	resources: { requests: { storage: tier.storage } },
																	storageClassName: tier.storageClassName
																}
															}
														}
													}))
												}
											: {})
									});

									snapshotKvCacheOffloadingTargets();
									applyKvCacheOffloadingResources(cpu);
								} else {
									lodash.unset(values, kvCacheOffloadingPath);
									pruneEmptyAncestors(values, kvCacheOffloadingPath);
								}

								handleNext();
							}
						}}
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

				<Tabs.Content value={steps[4]} class="min-h-[77vh]">
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

								let manifest;
								try {
									manifest = load(value);
								} catch {
									toast.error('Invalid YAML syntax. Please check the editor.');
									isSubmitting = false;
									return;
								}

								const name = lodash.get(manifest, ['metadata', 'name'], '');

								toast.promise(
									async () => {
										await resourceClient
											.get({
												cluster,
												namespace,
												group: kserveGroup,
												version: kserveVersion,
												resource: configurationResource,
												name: isMiddleware ? middlewareModelConfigurationName : name
											})
											.then((response) => {
												if (!response.object)
													throw new Error('Resource object is missing in the response');

												return resourceClient.update({
													cluster,
													namespace,
													group: kserveGroup,
													version: kserveVersion,
													resource: configurationResource,
													name: isMiddleware ? middlewareModelConfigurationName : name,
													manifest: new TextEncoder().encode(
														stringify({
															...lodash.omit(response.object, ['spec']),
															spec: lodash.get(object, 'spec')
														})
													)
												});
											})
											.catch((error) => {
												if (error instanceof ConnectError && error.code === Code.NotFound) {
													return resourceClient.create({
														cluster,
														namespace,
														group: kserveGroup,
														version: kserveVersion,
														resource: configurationResource,
														manifest: new TextEncoder().encode(
															stringify({
																apiVersion: `${kserveGroup}/${kserveVersion}`,
																kind: configurationKind,
																metadata: {
																	name: isMiddleware ? middlewareModelConfigurationName : name,
																	namespace,
																	labels: lodash.get(object, ['metadata', 'labels'], {}),
																	annotations: lodash.get(object, ['metadata', 'annotations'], {})
																},
																spec: lodash.get(object, 'spec')
															})
														)
													});
												}

												throw error;
											});

										await resourceClient.create({
											cluster,
											namespace,
											group: kserveGroup,
											version: kserveVersion,
											resource: serviceResource,
											manifest: new TextEncoder().encode(value)
										});
									},
									{
										loading: `Deploying ${serviceKind} ${name}...`,
										success: () => {
											return `Successfully deployed ${serviceKind} ${name}`;
										},
										error: (error) => {
											console.error(`Failed to deploy ${serviceKind} ${name}:`, error);
											return `Failed to deploy ${serviceKind} ${name}: ${(error as ConnectError).message}`;
										},
										finally() {
											isSubmitting = false;
											open = false;
										}
									}
								);
							}}
						>
							Deploy
						</Button>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Dialog.Content>
	</Dialog.Root>
{/if}
