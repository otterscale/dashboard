<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import FileIcon from '@lucide/svelte/icons/file';
	import FormIcon from '@lucide/svelte/icons/form';
	import { ResourceService } from '@otterscale/api/resource/v1';
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

	import {
		encodeURIComponentWithSlashEscape,
		parseHarborHost,
		parseProjectName
	} from '$lib/components/artifact-viewer/utils.svelte';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import EditorWidget from '$lib/components/dynamic-form/widgets/editor.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
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
		object: any;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';

	let helmRepository = $state<SourceToolkitFluxcdIoV1HelmRepository | undefined>(undefined);
	async function fetchHelmRepository() {
		const sourceRef = lodash.get(object, 'spec.chart.spec.sourceRef');
		if (!sourceRef || sourceRef.kind !== 'HelmRepository') {
			console.warn('fetchHelmRepository: sourceRef missing or not HelmRepository', sourceRef);
			return;
		}
		console.log(sourceRef);

		try {
			const response = await resourceClient.get({
				cluster,
				namespace: sourceRef.namespace || namespace,
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				kind: 'HelmRepository',
				name: sourceRef.name
			} as any);
			helmRepository = response?.object as SourceToolkitFluxcdIoV1HelmRepository;
			console.log('fetchHelmRepository: success', helmRepository);
		} catch (error) {
			console.error('Failed to fetch HelmRepository:', error);
		}
	}

	// Validation
	const jsonSchemaValidator = new Ajv({
		allErrors: true,
		strict: false
	});
	const validate = jsonSchemaValidator.compile(jsonSchema);

	// Container for Data.
	let values = $state(
		lodash.merge(
			{
				apiVersion: 'helm.toolkit.fluxcd.io/v2',
				kind: 'HelmRelease',
				spec: {
					interval: '15m',
					chart: {
						spec: {}
					},
					values: {}
				}
			},
			lodash.cloneDeep(object)
		)
	);
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

	const project = $derived(helmRepository ? parseProjectName(helmRepository) : '');
	const repository = $derived(lodash.get(object, 'spec.chart.spec.chart') || '');
	const harborHost = $derived(helmRepository ? parseHarborHost(helmRepository) : '');
	const secretName = $derived(helmRepository ? (helmRepository.spec?.secretRef?.name ?? '') : '');
	const isInternal = $derived(
		helmRepository
			? helmRepository.metadata?.labels?.['tenant.otterscale.io/internal'] === 'true'
			: false
	);

	async function getReferenceAddition(reference: string, addition: string) {
		const projectPath = encodeURIComponentWithSlashEscape(project);
		const repositoryPath = encodeURIComponentWithSlashEscape(repository);
		const referencePath = encodeURIComponentWithSlashEscape(reference);
		const additionPath = encodeURIComponentWithSlashEscape(addition);

		const additionUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts/${referencePath}/additions/${additionPath}`;

		console.log(
			'getReferenceAddition: sending request for',
			addition,
			'with reference',
			reference,
			'harborHost',
			harborHost
		);
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

	// Flags
	let open = $state(false);
	let isSubmitting = $state(false);

	onMount(async () => {
		await fetchHelmRepository();
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
					<FormIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Update</Item.Title>
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
								title: 'Version'
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
						chart: lodash.get(object, 'spec.chart.spec.chart'),
						version: lodash.get(object, 'spec.chart.spec.version'),
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
			<Tabs.Content value={steps[1]}>
				{@const schema = {
					...(lodash.get(jsonSchema, 'properties.spec.properties.values') as Schema),
					type: 'string',
					title: 'Values'
				} as Schema}
				{#if harborHost && (lodash.get(object, 'status.lastAttemptedConfigDigest') || lodash.get(object, 'status.lastAttemptedRevision'))}
					{#await getChartInformation(lodash.get(object, 'status.lastAttemptedConfigDigest') || (lodash.get(object, 'status.lastAttemptedRevision') as string)
								.split('@')
								.pop() || '')}
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
									TailoredEditorDocument: String(information.readme)
										? information.readme
										: undefined
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
				{:else}
					<div class="flex h-full items-center justify-center">
						<div class="flex flex-col items-center gap-2">
							<p class="text-sm text-muted-foreground">Waiting for chart information...</p>
							{#if !harborHost}
								<p class="text-xs text-muted-foreground opacity-70">
									Waiting for HelmRepository...
								</p>
							{/if}
						</div>
					</div>
				{/if}
			</Tabs.Content>
			<Tabs.Content value={steps[2]} class="min-h-[77vh]">
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

									await resourceClient.apply({
										cluster,
										namespace,
										group,
										version,
										resource,
										name,
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
