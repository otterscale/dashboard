<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { DownloadIcon, FileIcon } from '@lucide/svelte';
	import { ResourceService, type SchemaRequest } from '@otterscale/api/resource/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import { type Schema, SubmitButton, type UiSchemaRoot } from '@sjsf/form';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import { getContext, onMount } from 'svelte';
	import Monaco from 'svelte-monaco';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import EditorWidget from '$lib/components/dynamic-form/widgets/editor.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { ArtifactType } from '$lib/server/harbor';

	import { encodeURIComponentWithSlashEscape, parseHarborHost } from '../utils.svelte';

	let {
		cluster,
		namespace,
		chartArtifact: latestChartArtifact,
		helmRepository,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		chartArtifact: ArtifactType;
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository;
		onOpenChangeComplete: () => void;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

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
			interval: '15m',
			chart: {
				spec: {}
			},
			values: {}
		}
	});
	let value = $derived(stringify(values));

	let artifacts: ArtifactType[] = $state([]);
	async function fetchArtifacts() {
		try {
			const projectPath = encodeURIComponentWithSlashEscape(project);
			const repositoryPath = encodeURIComponentWithSlashEscape(repository);
			const artifactsUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts?with_label=true`;

			const response = await fetch('/bff/harbor/proxy', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					cluster,
					namespace,
					harborHost,
					secretName,
					isInternal,
					apiPath: artifactsUrl
				})
			});
			if (!response.ok) {
				console.error('Failed to fetch repository artifacts:', response.statusText);
				return;
			}
			artifacts = await response.json();
		} catch (error) {
			console.error('Error fetching repository artifacts:', error);
		}
	}

	const [project, ...latestChartNameParts] = $derived(
		latestChartArtifact.repository_name.split('/')
	);
	const repository = $derived(latestChartNameParts.join('/'));
	const harborHost = $derived(parseHarborHost(helmRepository));
	const secretName = $derived(helmRepository?.spec?.secretRef?.name ?? '');
	const isInternal = $derived(
		helmRepository?.metadata?.labels?.['tenant.otterscale.io/internal'] === 'true'
	);

	let selectedChartArtifact: ArtifactType = $derived(latestChartArtifact);
	function getVersions() {
		return artifacts.map(
			(artifact) => lodash.get(artifact.extra_attrs, 'version') as unknown as string
		);
	}
	function getSelectedChartArtifact(version: string) {
		return (
			artifacts.find((artifact) => lodash.get(artifact.extra_attrs, 'version') === version) ??
			latestChartArtifact
		);
	}
	$effect(() => {
		const versionValue = lodash.get(values, 'spec.chart.spec.version') as unknown as string;
		if (versionValue) {
			selectedChartArtifact = getSelectedChartArtifact(versionValue);
		}
	});

	async function getReferenceAddition(reference: string, addition: string) {
		const projectPath = encodeURIComponentWithSlashEscape(project);
		const repositoryPath = encodeURIComponentWithSlashEscape(repository);
		const referencePath = encodeURIComponentWithSlashEscape(reference);
		const additionPath = encodeURIComponentWithSlashEscape(addition);

		const additionUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts/${referencePath}/additions/${additionPath}`;

		const response = await fetch('/bff/harbor/proxy', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				cluster,
				namespace,
				harborHost,
				secretName,
				isInternal,
				apiPath: additionUrl
			})
		});
		if (!response.ok) {
			console.error('Failed to fetch Harbor addition:', response.statusText);
			throw new Error('Failed to fetch Harbor addition');
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			return response.json();
		}
		return response.text();
	}

	async function getChartInformation(digest: string) {
		const [valuesData, readmeData] = await Promise.all([
			getReferenceAddition(digest, 'values.yaml'),
			getReferenceAddition(digest, 'readme.md')
		]);

		return { values: valuesData, readme: readmeData };
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
		await Promise.all([fetchSchema(), fetchArtifacts()]);
	});
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
					initialValue={{ namespace: namespace }}
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
						chart: lodash.get(latestChartArtifact.extra_attrs, 'name'),
						version: lodash.get(latestChartArtifact.extra_attrs, 'version'),
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

			<Tabs.Content value={steps[2]} class="min-h-[23vh]">
				{@const schema = {
					...(lodash.get(jsonSchema, 'properties.spec.properties.values') as Schema),
					type: 'string',
					title: 'Values'
				} as Schema}
				{#await getChartInformation(selectedChartArtifact.digest)}
					<Form {schema} initialValue={null} values={null}>
						{#snippet actions()}
							<div class="flex w-full items-center justify-between gap-3">
								<Button disabled>Previous</Button>
								<Button disabled>Next</Button>
							</div>
						{/snippet}
					</Form>
				{:then information}
					<Form
						{schema}
						uiSchema={{
							'ui:options': {
								translations: {
									submit: 'Next'
								},
								TailoredEditorDocument: String(information.readme) ? information.readme : undefined
							},
							'ui:components': {
								textWidget: EditorWidget
							}
						} as UiSchemaRoot}
						initialValue={information.values}
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
