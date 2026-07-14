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

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const kserveGroup = 'serving.kserve.io';
	const kserveVersion = 'v1alpha2';
	const serviceKind = 'LLMInferenceService';
	const serviceResource = 'llminferenceservices';
	const configurationKind = 'LLMInferenceServiceConfig';
	const configurationResource = 'llminferenceserviceconfigs';

	const steps = Array.from({ length: 4 }, (_, index) => String(index + 1));
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

	function toModelCarReference(modelUrl: string): string {
		if (!modelUrl || !modelUrl.startsWith('hf://')) return modelUrl;

		const harborUrl = env.PUBLIC_HARBOR_URL ?? '';

		const registry = harborUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

		const modelName = parseModelName(modelUrl);

		return `oci://${registry}/models/modelcar-catalog:${modelName.toLowerCase()}`;
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
					{#key isModelExist}
						<Form
							bind:reference={modelFormReference}
							schema={{
								title: 'Model',
								...(lodash.omit(
									lodash.get(jsonSchema, 'properties.spec.properties.model') as Schema,
									['properties']
								) as Schema),
								properties: {
									uri: {
										title: 'URI',
										...lodash.omit(
											lodash.get(
												jsonSchema,
												'properties.spec.properties.model.properties.uri'
											) as Schema,
											['description']
										),
										description: 'The model source defined by the platform configuration.',
										readOnly: true
									},
									internal: {
										type: 'boolean',
										title: 'Use internal registry',
										description:
											'When enabled, an hf:// source is rewritten to its OCI ModelCar reference in the platform registry. When disabled, the source URI is used as-is.'
									}
								}
							} as Schema}
							uiSchema={{
								'ui:options': {
									translations: {
										submit: 'Next'
									}
								},
								uri: {
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
								}
							} as UiSchemaRoot}
							initialValue={{
								uri: modelUri,
								internal: true
							} as FormValue}
							handleSubmit={{
								posthook: (form) => {
									const formValue = getValueSnapshot(form);
									const useInternal = lodash.get(formValue, 'internal', true) as boolean;

									lodash.set(values, ['spec', 'model'], {
										...lodash.omit(lodash.get(object, ['spec', 'model'], {}), ['uri']),
										uri: useInternal ? toModelCarReference(modelUri) : modelUri
									});

									if (useInternal) {
										const isGptOss = parseModelName(modelUri).toLowerCase().includes('gpt-oss');

										lodash.set(
											values,
											['spec', 'template', 'containers'],
											[
												{
													name: 'main',
													env: [
														{ name: 'USER', value: 'nonroot' },
														{ name: 'TORCHINDUCTOR_CACHE_DIR', value: '/tmp/torchinductor_cache' },
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
										);
										lodash.set(
											values,
											['spec', 'router', 'scheduler', 'template', 'containers'],
											[
												{
													name: 'tokenizer',
													env: [
														{ name: 'USER', value: 'nonroot' },
														{ name: 'TORCHINDUCTOR_CACHE_DIR', value: '/tmp/torchinductor_cache' },
														...(isGptOss
															? [
																	{
																		name: 'TIKTOKEN_ENCODINGS_BASE',
																		value: '/models/tiktoken_encodings'
																	}
																]
															: [])
													]
												}
											]
										);
									} else {
										lodash.set(values, ['spec', 'template', 'containers'], []);
										lodash.set(
											values,
											['spec', 'router', 'scheduler', 'template', 'containers'],
											[]
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
					{/key}
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

				<Tabs.Content value={steps[3]} class="min-h-[77vh]">
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
												name
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
													name,
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
