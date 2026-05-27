<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import FormIcon from '@lucide/svelte/icons/form';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { ServingKserveIoV1Alpha2LLMInferenceService } from '@otterscale/types';
	import type { FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
	import Ajv from 'ajv';
	import { JSON_SCHEMA, load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import { fetchAllGpuNodes, type NodeInfo } from '$lib/components/gpu-allocation';
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
		schema: Schema;
		object: ServingKserveIoV1Alpha2LLMInferenceService;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let values = $state(getInitialValues());

	function getInitialValues() {
		return lodash.cloneDeep(object) as ServingKserveIoV1Alpha2LLMInferenceService & {
			metadata?: Record<string, unknown>;
		};
	}

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

	let value = $derived.by(() => {
		const filtered = lodash.cloneDeep(values);
		if (filtered.metadata) {
			for (const field of systemFields) {
				delete filtered.metadata[field];
			}
		}
		return stringify(filtered);
	});

	type GPUDevice = { type: string; node: string };

	function getAllGPUDevices(nodes: NodeInfo[]): GPUDevice[] {
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

	function getGPUSelectionSchema(resourceTopology: Record<string, string[]>): Schema {
		const types = Object.keys(resourceTopology);
		return {
			type: 'object',
			properties: {
				type: { type: 'string', title: 'Type', enum: types }
			},
			required: ['type'],
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

	function applyKVCacheEnvironments(templatePath: string[]) {
		lodash.set(
			values,
			[...templatePath, 'containers'],
			[
				{
					name: 'main',
					env: [
						{ name: 'LMCACHE_CONFIG_FILE', value: '/etc/lmcache/lmcache_config.yaml' },
						{ name: 'LMCACHE_USE_EXPERIMENTAL', value: 'True' }
					]
				}
			]
		);
	}

	function removeKVCacheEnvironments(templatePath: string[]) {
		const containers = lodash.get(values, [...templatePath, 'containers']) as
			| Array<{ name?: string; env?: Array<{ name?: string; value?: string }> }>
			| undefined;
		if (!Array.isArray(containers)) return;

		const kvCacheEnvNames = new Set(['LMCACHE_CONFIG_FILE', 'LMCACHE_USE_EXPERIMENTAL']);

		const cleaned = containers.map((container) => {
			if (!Array.isArray(container.env)) return container;
			const env = container.env.filter((entry) => !kvCacheEnvNames.has(entry.name ?? ''));
			if (env.length === 0) {
				return lodash.omit(container, 'env');
			}
			return { ...container, env };
		});

		lodash.set(values, [...templatePath, 'containers'], cleaned);
	}

	function hasKVCacheEnvironments(templatePath: string[]): boolean {
		const containers = lodash.get(object, [...templatePath, 'containers']) as
			| Array<{ name?: string; env?: Array<{ name?: string }> }>
			| undefined;
		const main = containers?.find((container) => container.name === 'main');
		const envNames = new Set(main?.env?.map((entry) => entry.name) ?? []);
		return envNames.has('LMCACHE_CONFIG_FILE') && envNames.has('LMCACHE_USE_EXPERIMENTAL');
	}

	function isKVCacheEnabled(): boolean {
		if (lodash.has(object, 'spec.prefill')) {
			return (
				hasKVCacheEnvironments(['spec', 'template']) &&
				hasKVCacheEnvironments(['spec', 'prefill', 'template'])
			);
		}
		return hasKVCacheEnvironments(['spec', 'template']);
	}

	// Steps Manager (3 steps: GPU selector + KV Cache + YAML review)
	const steps = Array.from({ length: 3 }, (_, index) => String(index + 1));
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
			<!-- Step 1: GPU Selector -->
			<Tabs.Content value={steps[0]}>
				{#await fetchAllGpuNodes(resourceClient, cluster)}
					Loading
				{:then allGPUNodes}
					{@const allGPUDevices = getAllGPUDevices(allGPUNodes)}
					{@const resourceTopology = getResourceTopology(allGPUDevices)}
					{@const gpuSelectionSchema = getGPUSelectionSchema(resourceTopology)}
					{@const isSingleNode =
						lodash.has(object, 'spec.template') && !lodash.has(object, 'spec.prefill')}
					{@const isPrefillDecode =
						lodash.has(object, 'spec.template') && lodash.has(object, 'spec.prefill')}
					{#if isSingleNode}
						<Form
							schema={{ title: 'GPU Selector', ...gpuSelectionSchema } as Schema}
							uiSchema={{
								'ui:options': {
									translations: {
										submit: 'Next'
									}
								}
							} as UiSchemaRoot}
							initialValue={{
								type: lodash.get(object, ['spec', 'annotations', 'nvidia.com/use-gputype']),
								node: lodash.get(object, [
									'spec',
									'template',
									'nodeSelector',
									'kubernetes.io/hostname'
								])
							} as FormValue}
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
										disabled={currentIndex === 0}
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
								title: 'GPU Selector',
								type: 'object',
								properties: {
									decode: { title: 'Decode', ...gpuSelectionSchema },
									prefill: { title: 'Prefill', ...gpuSelectionSchema }
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
								decode: {
									type: lodash.get(object, ['spec', 'annotations', 'nvidia.com/use-gputype']),
									node: lodash.get(object, [
										'spec',
										'template',
										'nodeSelector',
										'kubernetes.io/hostname'
									])
								},
								prefill: {
									type: lodash.get(object, [
										'spec',
										'prefill',
										'annotations',
										'nvidia.com/use-gputype'
									]),
									node: lodash.get(object, [
										'spec',
										'prefill',
										'template',
										'nodeSelector',
										'kubernetes.io/hostname'
									])
								}
							} as FormValue}
							handleSubmit={{
								posthook: (form) => {
									const value = getValueSnapshot(form);

									const decodeType = lodash.get(value, 'decode.type') as string | undefined;
									if (decodeType) {
										lodash.set(
											values,
											['spec', 'annotations', 'nvidia.com/use-gputype'],
											decodeType
										);
									}

									const decodeNode = lodash.get(value, 'decode.node') as string | undefined;
									if (decodeNode) {
										lodash.set(
											values,
											['spec', 'template', 'nodeSelector', 'kubernetes.io/hostname'],
											decodeNode
										);
									}

									const prefillType = lodash.get(value, 'prefill.type') as string | undefined;
									if (prefillType) {
										lodash.set(
											values,
											['spec', 'prefill', 'annotations', 'nvidia.com/use-gputype'],
											prefillType
										);
									}

									const prefillNode = lodash.get(value, 'prefill.node') as string | undefined;
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
									<Button onclick={() => handlePrevious()} disabled={currentIndex === 0}>
										Previous
									</Button>
									<SubmitButton />
								</div>
							{/snippet}
						</Form>
					{/if}
				{/await}
			</Tabs.Content>

			<!-- Step 2: KV Cache -->
			<Tabs.Content value={steps[1]}>
				<Form
					schema={{
						title: 'KV Cache',
						type: 'object',
						properties: {
							enabled: { type: 'boolean', title: 'Enable KV Cache' }
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						}
					} as UiSchemaRoot}
					initialValue={{ enabled: isKVCacheEnabled() } as FormValue}
					handleSubmit={{
						posthook: (form) => {
							const value = getValueSnapshot(form);
							const enabled = lodash.get(value, 'enabled') as boolean | undefined;
							if (enabled) {
								applyKVCacheEnvironments(['spec', 'template']);
								if (lodash.has(object, 'spec.prefill')) {
									applyKVCacheEnvironments(['spec', 'prefill', 'template']);
								}
							} else {
								removeKVCacheEnvironments(['spec', 'template']);
								if (lodash.has(object, 'spec.prefill')) {
									removeKVCacheEnvironments(['spec', 'prefill', 'template']);
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
			</Tabs.Content>

			<!-- Step 3: YAML Review + Submit -->
			<Tabs.Content value={steps[2]} class="min-h-[77vh]">
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

							const isValid = validate(load(value, { schema: JSON_SCHEMA }));

							if (!isValid) {
								console.error(`Validation errors: ${JSON.stringify(validate.errors)}`);
								toast.error('Validation failed. Please check the YAML.');
								isSubmitting = false;
								return;
							}

							const name = lodash.get(load(value, { schema: JSON_SCHEMA }), 'metadata.name');

							toast.promise(
								async () => {
									const manifest = new TextEncoder().encode(value);

									await resourceClient.apply({
										cluster,
										namespace,
										name,
										group,
										version,
										resource,
										manifest,
										fieldManager: 'otterscale-web-ui',
										force: true
									});
								},
								{
									loading: `Updating ${kind} ${name}...`,
									success: () => {
										return `Successfully updated ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to update ${kind} ${name}:`, error);
										return `Failed to update ${kind} ${name}: ${(error as ConnectError).message}`;
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
