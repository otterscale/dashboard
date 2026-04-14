<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { FileIcon, Settings2Icon } from '@lucide/svelte';
	import { ResourceService, type SchemaRequest } from '@otterscale/api/resource/v1';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import { type Schema, SubmitButton, type UiSchemaRoot } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext, onMount } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import {
		encodeHarborURIComponent,
		parseHarborHost
	} from '$lib/components/artifact-viewer/utils.svelte';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import EditorWidget from '$lib/components/dynamic-form/widgets/editor.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	import type { ModuleAttribute } from '../../table-layout';
	import { type ModuleType } from '../../types';

	let {
		row,
		cluster,
		fromHarbor,
		onOpenChangeComplete
	}: {
		row: Row<Record<ModuleAttribute, JsonValue>>;
		cluster: string;
		fromHarbor: boolean;
		onOpenChangeComplete: () => void;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';

	const chart: ModuleType = row.original.chart as unknown as ModuleType;
	const helmRepository = row.original.helmRepository as SourceToolkitFluxcdIoV1HelmRepository;

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const runtimeClient = createClient(RuntimeService, transport);

	let jsonSchema: Schema | undefined = $state(undefined);

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
			releaseName: chart.name,
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

	async function fetchModuleVersions(project: string, chartName: string): Promise<ModuleType[]> {
		let moduleVersions: ModuleType[] = [];

		try {
			if (fromHarbor) {
				const harborHost = parseHarborHost(helmRepository);
				const projectPath = encodeHarborURIComponent(project);
				const repositoryPath = encodeHarborURIComponent(chartName);
				const artifactsUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts?with_label=true`;

				const response = await fetch('/bff/helm/repository/harbor', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						harborHost,
						apiPath: artifactsUrl
					})
				});

				if (!response.ok) {
					console.error('Failed to fetch repository artifacts:', response.statusText);
				}

				const harborModules = await response.json();
				moduleVersions = harborModules.map((module: any) => ({
					apiVersion: module.extra_attrs.apiVersion,
					appVersion: module.extra_attrs.appVersion,
					annotations: module.extra_attrs.annotations,
					name: module.extra_attrs.name,
					description: module.extra_attrs.description,
					version: module.extra_attrs.version,
					digest: module.digest,
					icon: module.icon,
					keywords: module.labels ?? [],
					type: module.type
				}));
			} else {
				moduleVersions = chart.versions as ModuleType[];
			}
		} catch (error) {
			console.error('Error fetching repository artifacts:', error);
		}

		return moduleVersions;
	}

	async function getValuesWithDocument(module: ModuleType | undefined) {
		if (module === undefined) {
			return { values: '', readme: '' };
		}

		if (fromHarbor) {
			const harborHost = parseHarborHost(helmRepository);

			const projectPath = encodeHarborURIComponent('otterscale');
			const repositoryPath = encodeHarborURIComponent(module.name);
			const referencePath = encodeHarborURIComponent(module.digest);
			const valuesPath = encodeHarborURIComponent('values.yaml');
			const readmePath = encodeHarborURIComponent('readme.md');

			const valuesUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts/${referencePath}/additions/${valuesPath}`;
			const valuesResponse = await fetch('/bff/helm/repository/harbor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					harborHost,
					apiPath: valuesUrl
				})
			});
			if (!valuesResponse.ok) {
				throw new Error('Failed to fetch Harbor values.yaml');
			}

			const readmeUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts/${referencePath}/additions/${readmePath}`;
			const readmeResponse = await fetch('/bff/helm/repository/harbor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					harborHost,
					apiPath: readmeUrl
				})
			});
			if (!readmeResponse.ok) {
				throw new Error('Failed to fetch Harbor readme.md');
			}

			const contentType = valuesResponse.headers.get('content-type') ?? '';
			if (contentType.includes('application/json')) {
				return valuesResponse.json();
			}

			return { values: await valuesResponse.text(), readme: await readmeResponse.text() };
		} else {
			const response = await runtimeClient.showChart({
				repoUrl: helmRepository.spec?.url ?? '',
				chartName: module.name,
				version: module.version
			});
			const decoder = new TextDecoder();
			return { values: decoder.decode(response.values), readme: decoder.decode(response.readme) };
		}
	}

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

	// Flags
	let open = $state(false);
	let isSubmitting = $state(false);

	onMount(async () => {
		await fetchSchema();
	});

	let selectedModuleVersion: undefined | ModuleType = $state(undefined);
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
					<Settings2Icon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Set Up</Item.Title>
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
					initialValue={{ name: chart.name, namespace: 'otterscale-system' }}
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
				{#await fetchModuleVersions('otterscale', chart.name) then moduleVersions}
					{@const [moduleVersion] = moduleVersions}
					<Form
						schema={{
							...(lodash.omit(
								lodash.get(
									jsonSchema,
									'properties.spec.properties.chart.properties.spec'
								) as Schema,
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
									enum: moduleVersions.map((module) => module.version)
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
							chart: moduleVersion.name,
							version: moduleVersion.version,
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

								selectedModuleVersion = moduleVersions.find(
									(module) =>
										module.version === lodash.get(values, ['spec', 'chart', 'spec', 'version'])
								) as ModuleType;
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
				{/await}
			</Tabs.Content>

			<Tabs.Content value={steps[2]} class="min-h-[23vh]">
				{@const schema = {
					...(lodash.get(jsonSchema, 'properties.spec.properties.values') as Schema),
					type: 'string',
					title: 'Values'
				} as Schema}
				{#await getValuesWithDocument(selectedModuleVersion)}
					<Empty.Root>
						<Empty.Header>
							<Empty.Media variant="icon">
								<Spinner />
							</Empty.Media>
							<Empty.Title>Loading...</Empty.Title>
							<Empty.Description>Values and Document are loading, please wait...</Empty.Description>
						</Empty.Header>
					</Empty.Root>
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

			<Tabs.Content value={steps[3]} class="min-h-[77vh]">
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
									loading: `Installing ${kind} ${name}...`,
									success: () => {
										return `Successfully installed ${kind} ${name}`;
									},
									error: (error) => {
										console.error(`Failed to install ${kind} ${name}:`, error);
										return `Failed to install ${kind} ${name}: ${(error as ConnectError).message}`;
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
