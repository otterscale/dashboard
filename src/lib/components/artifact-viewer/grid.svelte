<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Icon from '@iconify/svelte';
	import { BookmarkIcon, DownloadIcon, TagsIcon } from '@lucide/svelte';
	import { ResourceService, type SchemaRequest } from '@otterscale/api/resource/v1';
	import {} from '@otterscale/types';
	import { type Schema, SubmitButton, type UiSchemaRoot } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import Ajv from 'ajv';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import EditorWidget from '$lib/components/dynamic-form/widgets/editor.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Button, { buttonVariants } from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { ArtifactType } from '$lib/server/harbor';

	import type { ArtifactAttribute } from './artifact-viewer';
	import { encodeURIComponentWithSlashEscape } from './utils.svelte';

	let {
		row,
		cluster,
		namespace
	}: {
		row: Row<Record<ArtifactAttribute, JsonValue>>;
		cluster: string;
		namespace: string;
	} = $props();

	const latestChartArtifact = $derived(row.original.raw as unknown as ArtifactType);
	const helmRepository = $derived(row.original.helmRepository as any);
	const helmRepositoryName = lodash.get(helmRepository, 'metadata.name', 'unknown');

	const [project, ...latestChartNameParts] = $derived(
		latestChartArtifact.repository_name.split('/')
	);
	const repository = $derived(latestChartNameParts.join('/'));
	const extraAttributes = $derived(latestChartArtifact.extra_attrs ?? {});

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';

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
					helmRepositoryName,
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
				helmRepositoryName,
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

<Card.Root>
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media>
				<Avatar.Root>
					<Avatar.Image src={extraAttributes.icon as string} alt="helm" />
					<Avatar.Fallback>
						<Icon icon="logos:helm" />
					</Avatar.Fallback>
				</Avatar.Root>
			</Item.Media>
			<Item.Content class="text-left">
				<Item.Title>
					{@const title = [latestChartArtifact.repository_name, extraAttributes.name]
						.filter((term) => !!term)
						.join(' ')}
					{title}
				</Item.Title>
				<Item.Description class="max-w-40  truncate">
					{latestChartArtifact.digest}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<Item.Actions>
					<AlertDialog.Root
						bind:open
						onOpenChangeComplete={() => {
							reset();
						}}
					>
						<AlertDialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
							<DownloadIcon />
						</AlertDialog.Trigger>
						<AlertDialog.Content class="max-h-[95vh] min-w-[50vw] overflow-auto">
							<Item.Root class="p-0">
								<Item.Content class="text-left">
									<Item.Title class="text-xl font-bold">Install Helm Chart</Item.Title>
									<Item.Description></Item.Description>
								</Item.Content>
							</Item.Root>
							<Tabs.Root value={currentStep} class="*:data-[slot=tabs-content]:min-h-[33vh]">
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
													...(lodash.get(
														jsonSchema,
														'properties.metadata.properties.name'
													) as Schema),
													title: 'Name'
												},
												namespace: {
													...(lodash.get(
														jsonSchema,
														'properties.metadata.properties.namespace'
													) as Schema),
													title: 'Namespace'
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
													enum: getVersions()
												},
												sourceRef: {
													...(lodash.get(
														jsonSchema,
														'properties.spec.properties.chart.properties.spec.properties.sourceRef'
													) as Schema),
													title: 'Source Reference',
													properties: {
														name: {
															...(lodash.get(
																jsonSchema,
																'properties.spec.properties.chart.properties.spec.properties.sourceRef.properties.name'
															) as Schema),
															title: 'Name'
														},
														namespace: {
															...(lodash.get(
																jsonSchema,
																'properties.spec.properties.chart.properties.spec.properties.sourceRef.properties.namespace'
															) as Schema),
															title: 'Namespace'
														}
													}
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
												apiVersion: lodash.get(helmRepository, 'apiVersion'),
												kind: lodash.get(helmRepository, 'kind'),
												name: lodash.get(helmRepository, 'metadata.name'),
												namespace: lodash.get(helmRepository, 'metadata.namespace')
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
									{#await getChartInformation(selectedChartArtifact.digest) then information}
										<Form
											schema={{
												...(lodash.get(jsonSchema, 'properties.spec.properties.values') as Schema),
												type: 'string',
												title: 'Values'
											} as Schema}
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

													lodash.set(
														values,
														'spec.values',
														load(lodash.get(values, 'spec.values') as string)
													);
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

								<Tabs.Content value={steps[3]}>
									<div class="flex h-full flex-col gap-3">
										<Code.Root
											lang="yaml"
											class="no-shiki-limit w-full"
											hideLines
											code={stringify(values, null, 2)}
										/>
										<Button
											class="mt-auto w-full"
											onclick={() => {
												if (isSubmitting) return;
												isSubmitting = true;

												const isValid = validate(values);
												if (!isValid) {
													isSubmitting = false;
													return;
												}

												const name = lodash.get(values, 'metadata.name');

												toast.promise(
													async () => {
														const manifest = new TextEncoder().encode(JSON.stringify(values));

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
						</AlertDialog.Content>
					</AlertDialog.Root>
				</Item.Actions>
			</Item.Actions>
		</Item.Root>
	</Card.Header>
	<Card.Content>
		<Item.Root class="col-span-2 items-start p-0">
			<Item.Content class="text-left">
				<Item.Description>
					{extraAttributes.description}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</Card.Content>
	<Card.Footer class="flex gap-1 overflow-hidden text-xs text-gray-500">
		{@const labels = latestChartArtifact.labels ?? []}
		{@const tags = latestChartArtifact.tags ?? []}
		{#each labels as label, index (index)}
			<BookmarkIcon size={12} />
			{label.name}
		{/each}
		{#each tags as tag, index (index)}
			<TagsIcon size={12} />
			{tag.name}
		{/each}
	</Card.Footer>
</Card.Root>
