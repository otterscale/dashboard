<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { DownloadIcon, FileIcon } from '@lucide/svelte';
	import { ResourceService, type SchemaRequest } from '@otterscale/api/resource/v1';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import type { CoreV1Node, SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import {
		type FormState,
		type FormValue,
		getValueSnapshot,
		type Schema,
		SubmitButton,
		type UiSchemaRoot
	} from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext, onMount } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import CheckboxesWidget from '$lib/components/dynamic-form/widgets/checkboxes.svelte';
	import EditorWidget from '$lib/components/dynamic-form/widgets/editor.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	import type { ModuleAttribute } from '../table-layout';
	import { type ModuleType } from '../types';

	let {
		row,
		cluster,
		onOpenChangeComplete
	}: {
		row: Row<Record<ModuleAttribute, JsonValue>>;
		cluster: string;
		onOpenChangeComplete: () => void;
	} = $props();

	const chart: ModuleType = row.original.chart as unknown as ModuleType;

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const runtimeClient = createClient(RuntimeService, transport);

	let jsonSchema: Schema | undefined = $state(undefined);

	let nodeFeatureDiscoveries: Record<string, Record<string, Record<string, string>>> = $state({});
	let nodes: any = $state({});

	async function fetchNodes() {
		try {
			const response = await resourceClient.list({
				cluster,
				group: '',
				version: 'v1',
				resource: 'nodes'
			});

			const nodes: CoreV1Node[] = response.items.map((item) => item.object as CoreV1Node);
			nodes.forEach((node) =>
				Object.entries(node.metadata?.labels ?? {}).forEach(([key, value]) => {
					const nodeName = node.metadata?.name ?? '';

					if (key?.startsWith('otterscale.io/disk.')) {
						const [diskName, ...featureParts] = key
							.substring('otterscale.io/disk.'.length)
							.split('-');

						const featureName = featureParts.join('-');

						lodash.set(nodeFeatureDiscoveries, [nodeName, diskName, featureName], value);
					}
				})
			);
		} catch (error) {
			console.error('Failed to fetch nodes:', error);
			toast.error('Failed to fetch nodes');
		}
	}

	async function fetchSchema() {
		try {
			const schemaResponse = await resourceClient.schema({
				cluster,
				group,
				version,
				kind
			} as SchemaRequest);

			jsonSchema = schemaResponse.schema;
		} catch (error) {
			console.error('Failed to fetch schema:', error);
			toast.error('Failed to fetch HelmRelease schema');
		}
	}

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false
	});
	const validate = $derived(jsonSchemaValidator.compile(jsonSchema ?? {}));

	// Container for Data.
	let values = $state({
		apiVersion: `${group}/${version}`,
		kind,
		metadata: {},
		spec: {
			targetNamespace: lodash.get(chart, ['annotations', 'module.otterscale.io/namespace']),
			install: { createNamespace: true },
			interval: '15m',
			chart: {
				spec: {}
			},
			values: {}
		}
	});
	let value = $derived(stringify(values));

	const helmRepository = row.original.helmRepository as SourceToolkitFluxcdIoV1HelmRepository;

	let modules: ModuleType[] = $derived(
		lodash.get(row.original.chart, 'versions', {}) as ModuleType[]
	);

	let selectedChart: ModuleType = $derived(modules[0] || ({} as ModuleType));
	function getVersions() {
		return modules.map((chart) => chart.version);
	}
	function getSelectedChart(version: string) {
		return modules.find((chart) => chart.version === version) ?? modules[0];
	}
	$effect(() => {
		const version = lodash.get(values, 'spec.chart.spec.version') as unknown as string;
		if (version) {
			selectedChart = getSelectedChart(version);
		}
	});

	async function getDocuments(nodes: any) {
		const response = await runtimeClient.showChart({
			repoUrl: helmRepository.spec?.url ?? '',
			chartName: selectedChart.name ?? '',
			version: selectedChart.version ?? ''
		});
		const decoder = new TextDecoder();

		const helmReleaseValues = load(decoder.decode(response.values)) as object;
		if (nodes.length > 0) {
			lodash.set(
				helmReleaseValues,
				['rook-ceph-cluster', 'cephClusterSpec', 'storage', 'useAllNodes'],
				false
			);
			lodash.set(
				helmReleaseValues,
				['rook-ceph-cluster', 'cephClusterSpec', 'storage', 'nodes'],
				nodes
			);
		}
		return {
			values: stringify(helmReleaseValues),
			readme: decoder.decode(response.readme)
		};
	}

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

	// Flags
	let open = $state(false);
	let isSubmitting = $state(false);

	onMount(async () => {
		await Promise.all([fetchSchema(), fetchNodes()]);
	});

	const chartName = $derived(selectedChart.name);
	const defaultVersion = $derived(selectedChart.version);
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
	<Dialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<DownloadIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Install</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[95vh] min-w-[33vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">
					{lodash.get(lodash.get(jsonSchema, 'x-kubernetes-group-version-kind', [])[0], 'kind')}
				</Item.Title>
				<Item.Description>{lodash.get(jsonSchema, 'description')}</Item.Description>
			</Item.Content>
		</Item.Root>
		<Tabs.Root value={currentStep}>
			<Tabs.Content value={steps[0]}>
				<Form
					schema={{
						...(lodash.omit(
							lodash.get(jsonSchema, 'properties.metadata') as Schema,
							'properties'
						) as any),
						title: 'Metadata',
						properties: {
							name: {
								...(lodash.get(jsonSchema, 'properties.metadata.properties.name') as Schema),
								title: 'Name'
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
					initialValue={{
						name: chart.name,
						namespace: 'otterscale-system'
					}}
					bind:values={values['metadata']}
					handleSubmit={{
						posthook: () => {
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
				<Form
					schema={{
						...(lodash.omit(
							lodash.get(jsonSchema, 'properties.spec.properties.chart.properties.spec') as Schema,
							'properties'
						) as Schema),
						title: 'Chart',
						properties: {
							chart: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.chart.properties.spec.properties.chart'
								) as Schema)
							},
							version: {
								...(lodash.get(
									jsonSchema,
									'properties.spec.properties.chart.properties.spec.properties.version'
								) as Schema),
								title: 'Version',
								enum: getVersions()
							}
						}
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							}
						},
						version: {
							'ui:components': {
								stringField: 'enumField'
							}
						}
					} as UiSchemaRoot}
					initialValue={{
						chart: chartName,
						version: defaultVersion,
						sourceRef: {
							apiVersion: helmRepository?.apiVersion,
							kind: helmRepository?.kind,
							name: helmRepository?.metadata?.name,
							namespace: helmRepository?.metadata?.namespace
						}
					} as any}
					bind:values={values['spec']['chart']['spec']}
					handleSubmit={{
						posthook: () => {
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

			<Tabs.Content value={steps[2]}>
				<Form
					schema={{
						type: 'object',
						properties: Object.fromEntries(
							Object.entries(nodeFeatureDiscoveries).map(([node, disks]) => [
								[node],
								{
									type: 'array',
									minIems: 1,
									items: {
										type: 'object',
										enum: Object.entries(disks).map(([disk, features]) => ({
											label: disk,
											description: `${features?.['size-gb']}GB, ${features?.['model']} ${features?.['type'].toUpperCase()}`,
											value: `/dev/${disk}`,
											disabled: (features?.['fw'] ?? '').startsWith('EIFZ')
										}))
									}
								}
							])
						)
					} as Schema}
					uiSchema={{
						'ui:options': {
							translations: {
								submit: 'Next'
							},
							itemTitle: () => ''
						},
						...Object.fromEntries(
							Object.keys(nodeFeatureDiscoveries).map((node) => [
								[node],
								{
									'ui:components': {
										arrayField: 'multiEnumField',
										checkboxesWidget: CheckboxesWidget
									}
								}
							])
						)
					} as UiSchemaRoot}
					initialValue={{}}
					values={{}}
					handleSubmit={{
						posthook: (form: FormState<FormValue>) => {
							handleNext();

							const formValue = getValueSnapshot(form) as Record<string, any[]>;
							nodes = Object.entries(formValue).map(([node, disks]) => ({
								name: node,
								devices: disks.map((disk) => ({ name: disk.value }))
							}));
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

			<Tabs.Content value={steps[3]} class="min-h-[23vh]">
				{@const schema = {
					...(lodash.get(jsonSchema, 'properties.spec.properties.values') as Schema),
					type: 'string',
					title: 'Values'
				} as Schema}
				{#await getDocuments(nodes)}
					<Form {schema} initialValue={null} values={null}>
						{#snippet actions()}
							<div class="flex w-full items-center justify-between gap-3">
								<Button disabled>Previous</Button>
								<Button disabled>Next</Button>
							</div>
						{/snippet}
					</Form>
				{:then documents}
					<Form
						{schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								},
								TailoredEditorDocument: String(documents.readme) ? documents.readme : undefined
							},
							'ui:components': {
								textWidget: EditorWidget
							}
						} as UiSchemaRoot}
						initialValue={documents.values}
						bind:values={values['spec']['values']}
						handleSubmit={{
							posthook: () => {
								handleNext();
								try {
									const structuredValues = load(lodash.get(values, 'spec.values') as string);

									lodash.set(values, 'spec.values', structuredValues);
								} catch (error) {
									console.error('Failed to load values:', error);
									toast.error('Failed to load values');
									lodash.set(values, 'spec.values', {});
								}
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
				{:catch error}
					<Empty.Root class="rounded-lg bg-muted">
						<Empty.Header>
							<Empty.Media variant="icon">
								<FileIcon size={32} class="opacity-60" aria-hidden="true" />
							</Empty.Media>
							<Empty.Title>Failed to load chart information</Empty.Title>
							<Empty.Description>
								{error.message}
							</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/await}
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
							showFoldingControls: 'always',
							scrollBeyondLastLine: false
						}}
						bind:value
						theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs-light'}
					/>
					<Button
						class="mt-auto w-full"
						onclick={() => {
							if (isSubmitting) return;
							isSubmitting = true;

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
										namespace: 'otterscale-system',
										group,
										version,
										resource,
										manifest
									});
								},
								{
									loading: `Creating ${kind} ${name}...`,
									success: () => {
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
						Install
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
