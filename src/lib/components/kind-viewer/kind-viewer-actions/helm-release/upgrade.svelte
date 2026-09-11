<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import ArrowUpCircleIcon from '@lucide/svelte/icons/arrow-up-circle';
	import Columns2Icon from '@lucide/svelte/icons/columns-2';
	import FileIcon from '@lucide/svelte/icons/file';
	import FoldVerticalIcon from '@lucide/svelte/icons/fold-vertical';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import type {
		HelmToolkitFluxcdIoV2HelmRelease,
		SourceToolkitFluxcdIoV1HelmRepository
	} from '@otterscale/types';
	import type { FormState, FormValue, Schema, UiSchemaRoot } from '@sjsf/form';
	import { getValueSnapshot, SubmitButton } from '@sjsf/form';
	import { type ValidateFunction } from 'ajv';
	import { JSON_SCHEMA, load } from 'js-yaml';
	import lodash from 'lodash';
	import { mode as themeMode } from 'mode-watcher';
	import semver from 'semver';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { parse, stringify } from 'yaml';

	import type { ArtifactChartType, ChartType } from '$lib/components/chart-viewer/types';
	import {
		encodeHarborURIComponent,
		parseHarborHost,
		parseHarborProjectName
	} from '$lib/components/chart-viewer/utils.svelte';
	import { MonacoDiff } from '$lib/components/custom/monaco-diff';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Toggle } from '$lib/components/ui/toggle';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		applyDeltaToYamlText,
		computeValuesDelta,
		normalizeYamlText
	} from '$lib/utils/helm-values';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		validate,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		validate: ValidateFunction;
		object: HelmToolkitFluxcdIoV2HelmRelease;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const runtimeClient = createClient(RuntimeService, transport);

	const name = $derived(object?.metadata?.name ?? '');
	const chartName = $derived(object?.spec?.chart?.spec?.chart ?? '');
	const currentVersion = $derived(object?.spec?.chart?.spec?.version ?? '');
	const sourceRef = $derived(object?.spec?.chart?.spec?.sourceRef);

	let helmRepository: SourceToolkitFluxcdIoV1HelmRepository | undefined;
	let fromHarbor = false;
	let harborDigestByVersion: Record<string, string> = {};

	let open = $state(false);
	let isSubmitting = $state(false);
	let currentStep = $state('1');
	let targetVersion = $state('');
	let mergedText = $state('');
	let sideBySide = $state(true);
	let hideUnchanged = $state(false);
	let versionsPromise = $state<Promise<string[]> | undefined>(undefined);
	let documentsPromise = $state<Promise<{ defaultsText: string }> | undefined>(undefined);

	async function fetchVersions(): Promise<string[]> {
		const response = await resourceClient.get({
			cluster,
			namespace: sourceRef?.namespace ?? namespace,
			name: sourceRef?.name ?? '',
			group: 'source.toolkit.fluxcd.io',
			version: 'v1',
			resource: 'helmrepositories'
		});
		helmRepository = response.object as unknown as SourceToolkitFluxcdIoV1HelmRepository;

		fromHarbor =
			lodash.get(helmRepository, ['metadata', 'labels', 'tenant.otterscale.io/from-harbor']) ===
			'true';

		let fetchedVersions: string[] = [];
		if (fromHarbor) {
			const harborHost = parseHarborHost(helmRepository);
			const projectPath = encodeHarborURIComponent(parseHarborProjectName(helmRepository));
			const repositoryPath = encodeHarborURIComponent(chartName);
			const artifactsUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts?with_label=true`;

			const artifactsResponse = await fetch('/bff/helm/repository/harbor', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					harborHost,
					apiPath: artifactsUrl
				})
			});
			if (!artifactsResponse.ok) {
				throw new Error(`Failed to list versions from Harbor: ${artifactsResponse.statusText}`);
			}
			const artifacts: ArtifactChartType[] = await artifactsResponse.json();
			const taggedArtifacts = artifacts.filter((artifact) => artifact.tags?.length);
			// Helm OCI convention: the tag name is the chart version. Fall back to it
			// when Harbor did not parse chart metadata into extra_attrs.
			const versionOf = (artifact: ArtifactChartType) =>
				(lodash.get(artifact.extra_attrs, 'version') as unknown as string) ||
				artifact.tags[0]?.name;
			harborDigestByVersion = Object.fromEntries(
				taggedArtifacts
					.filter((artifact) => Boolean(versionOf(artifact)))
					.map((artifact) => [versionOf(artifact), artifact.digest])
			);
			fetchedVersions = taggedArtifacts.map(versionOf).filter(Boolean);
		} else {
			const indexResponse = await fetch('/bff/helm/repository/index', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					repositoryUrl: helmRepository.spec?.url ?? ''
				})
			});
			if (!indexResponse.ok) {
				throw new Error(`Failed to fetch repository index: ${indexResponse.statusText}`);
			}
			const entries: Record<string, ChartType[]> = (await indexResponse.json()) ?? {};
			fetchedVersions = (entries[chartName] ?? []).map((chart) => chart.version).filter(Boolean);
		}

		if (fetchedVersions.length === 0) {
			throw new Error(`No versions found for chart ${chartName}.`);
		}
		// Harbor lists artifacts by push time, not by version; a re-pushed old chart
		// would otherwise show up first and become the default selection. Helm
		// requires SemVer 2 chart versions, but a raw OCI tag may not be one —
		// those sort last instead of making rcompare throw.
		return fetchedVersions.sort((a, b) => {
			if (semver.valid(a) && semver.valid(b)) return semver.rcompare(a, b);
			return semver.valid(a) ? -1 : semver.valid(b) ? 1 : 0;
		});
	}

	// Harbor registries may be plain HTTP (spec.insecure); showChart always dials
	// OCI over HTTPS, so fetch values.yaml through the Harbor additions API instead.
	async function fetchHarborValuesText(digest: string): Promise<string> {
		if (!helmRepository) {
			throw new Error('HelmRepository is not loaded.');
		}
		const harborHost = parseHarborHost(helmRepository);
		const projectPath = encodeHarborURIComponent(parseHarborProjectName(helmRepository));
		const repositoryPath = encodeHarborURIComponent(chartName);
		const referencePath = encodeHarborURIComponent(digest);
		const additionPath = encodeHarborURIComponent('values.yaml');
		const additionUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts/${referencePath}/additions/${additionPath}`;

		const response = await fetch('/bff/helm/repository/harbor', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				harborHost,
				apiPath: additionUrl
			})
		});
		if (!response.ok) {
			throw new Error(`Failed to fetch chart values from Harbor: ${response.statusText}`);
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const data = await response.json();
			return typeof data === 'string' ? data : stringify(data);
		}
		return response.text();
	}

	async function getUpgradeDocuments(): Promise<{ defaultsText: string }> {
		let defaultsText: string;
		if (fromHarbor) {
			const digest = harborDigestByVersion[targetVersion];
			if (!digest) {
				throw new Error(`No artifact digest found for version ${targetVersion}.`);
			}
			defaultsText = await fetchHarborValuesText(digest);
		} else {
			const response = await runtimeClient.showChart({
				repoUrl: helmRepository?.spec?.url ?? '',
				chartName,
				version: targetVersion
			});
			defaultsText = new TextDecoder().decode(response.values);
		}
		// Both diff panes have to come out of the same YAML printer, otherwise
		// round-trip formatting alone reads as an override.
		const normalizedDefaults = normalizeYamlText(defaultsText);
		const delta = (lodash.get(object, ['spec', 'values']) ?? {}) as Record<string, unknown>;
		mergedText = applyDeltaToYamlText(normalizedDefaults, delta);
		return { defaultsText: normalizedDefaults };
	}

	function selectVersion(form: FormState<FormValue>, fallback: string) {
		const formValue = getValueSnapshot(form);
		const selected = (formValue ? lodash.get(formValue, 'version') : fallback) as string;
		if (!selected) return;

		// Keep the user's in-editor edits when they step back and forward
		// without changing the target version.
		if (selected !== targetVersion || !documentsPromise) {
			targetVersion = selected;
			documentsPromise = getUpgradeDocuments();
		}
		currentStep = '2';
	}

	function handleUpgrade(defaultsText: string) {
		if (isSubmitting || !validate) return;
		isSubmitting = true;

		let parsedMerged: unknown;
		try {
			parsedMerged = parse(mergedText) ?? {};
		} catch (error) {
			console.error('Failed to parse values YAML:', error);
			toast.error('Invalid values YAML. Please check the syntax.');
			isSubmitting = false;
			return;
		}
		const valuesDelta = computeValuesDelta(parse(defaultsText), parsedMerged);

		toast.promise(
			async () => {
				const response = await resourceClient.get({
					cluster,
					namespace,
					name,
					group,
					version,
					resource
				});

				const helmRelease: HelmToolkitFluxcdIoV2HelmRelease = lodash.cloneDeep(
					response.object ?? {}
				);
				lodash.set(helmRelease, ['spec', 'chart', 'spec', 'version'], targetVersion);
				lodash.set(helmRelease, ['spec', 'values'], valuesDelta);
				const manifest = stringify(helmRelease, { schema: 'yaml-1.1' });

				let isValid: boolean | undefined = undefined;
				try {
					isValid = validate(load(manifest, { schema: JSON_SCHEMA }));
				} catch (error) {
					console.error(`Failed to parse HelmRelease manifest for ${name}:`, error);
					throw new Error(`Invalid YAML for ${name}.`);
				}
				if (!isValid) {
					console.error(`Validation errors for ${name}:`, validate.errors);
					throw new Error(`Validation failed for ${name}.`);
				}

				await resourceClient.update({
					cluster,
					namespace,
					group,
					version,
					resource,
					name,
					manifest: new TextEncoder().encode(manifest),
					fieldManager: 'otterscale-web-ui'
				});
			},
			{
				loading: `Upgrading ${kind} ${name} to ${targetVersion}…`,
				success: () => `Successfully upgraded ${kind} ${name} to ${targetVersion}`,
				error: (error) => {
					console.error(`Failed to upgrade ${kind} ${name}:`, error);
					return `Failed to upgrade ${kind} ${name}: ${(error as ConnectError).message}`;
				},
				finally() {
					isSubmitting = false;
					open = false;
				}
			}
		);
	}

	function initiate() {
		currentStep = '1';
		targetVersion = '';
		mergedText = '';
		versionsPromise = undefined;
		documentsPromise = undefined;
		fromHarbor = false;
		harborDigestByVersion = {};
		isSubmitting = false;
	}

	const contentClass = $derived(
		currentStep === '2'
			? 'flex max-h-[95vh] min-h-[95vh] max-w-[95vw] min-w-[95vw] flex-col gap-4 p-6'
			: 'max-h-[95vh] overflow-auto'
	);
</script>

{#snippet loadFailure(title: string, description: string)}
	<Empty.Root class="rounded-lg bg-muted">
		<Empty.Header>
			<Empty.Media variant="icon">
				<FileIcon size={32} class="opacity-60" aria-hidden="true" />
			</Empty.Media>
			<Empty.Title>{title}</Empty.Title>
			<Empty.Description>{description}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/snippet}

<!-- createForm captures schema, initialValue and disabled once at mount
     (form.svelte), so the pending and resolved states each need their own
     instance — same markup, so render both from here. -->
{#snippet versionForm(options: string[], isLoading: boolean)}
	<Form
		schema={{
			type: 'object',
			required: ['version'],
			properties: {
				version: {
					title: 'Version',
					type: 'string',
					enum: options
				}
			}
		} as Schema}
		uiSchema={{
			'ui:options': {
				layouts: {
					'object-properties': {
						class: 'gap-3'
					}
				},
				translations: {
					submit: 'Next'
				}
			},
			version: {
				'ui:options': {
					help: 'Select a Version'
				},
				'ui:components': {
					stringField: 'enumField'
				}
			}
		} as UiSchemaRoot}
		initialValue={{ version: targetVersion || options[0] } as FormValue}
		disabled={isLoading}
		handleSubmit={{ posthook: (form) => selectVersion(form, options[0]) }}
		class="**:data-[slot=dynamic-form-mode-controller]:hidden"
	>
		{#snippet actions()}
			<div class="*:w-full">
				{#if isLoading}
					<Button disabled>Next</Button>
				{:else}
					<SubmitButton />
				{/if}
			</div>
		{/snippet}
	</Form>
{/snippet}

<Dialog.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (isOpen) {
			versionsPromise = fetchVersions();
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
					<ArrowUpCircleIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Upgrade</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>

	<Dialog.Content class={contentClass} onInteractOutside={(e) => e.preventDefault()}>
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Upgrade — {name}</Item.Title>
				<Item.Description>
					Chart <strong>{chartName}</strong> · current version <strong>{currentVersion}</strong>
				</Item.Description>
			</Item.Content>
		</Item.Root>

		{#if currentStep === '1'}
			{#if versionsPromise}
				{#await versionsPromise}
					{@render versionForm(['Loading…'], true)}
				{:then versions}
					{@render versionForm(versions, false)}
				{:catch error}
					{@render loadFailure('Failed to load chart versions', error.message)}
				{/await}
			{/if}
		{:else if documentsPromise}
			{#await documentsPromise}
				<div class="min-h-0 flex-1 rounded-md border bg-muted">
					<Empty.Root class="h-full">
						<Empty.Header>
							<Empty.Media variant="icon">
								<Spinner />
							</Empty.Media>
							<Empty.Title>Loading chart values</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				</div>
			{:then documents}
				<div class="flex min-h-0 flex-1 flex-col">
					<div
						class="flex h-10 shrink-0 items-center justify-between rounded-t-md border border-b-0 bg-background/50 px-3 text-xs"
					>
						<span class="text-muted-foreground">
							Chart defaults ({targetVersion}) — highlighted lines are your overrides
						</span>
						<div class="flex items-center gap-1">
							<span class="text-muted-foreground">Your values — editable</span>
							<Tooltip.Root ignoreNonKeyboardFocus>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Toggle
											{...props}
											class="size-8 p-0"
											bind:pressed={hideUnchanged}
											aria-label="Show changed regions only"
										>
											<FoldVerticalIcon />
										</Toggle>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content>Show changed regions only</Tooltip.Content>
							</Tooltip.Root>
							<Tooltip.Root ignoreNonKeyboardFocus>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Toggle
											{...props}
											class="size-8 p-0"
											bind:pressed={sideBySide}
											aria-label="Toggle side-by-side diff"
										>
											<Columns2Icon />
										</Toggle>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content>Side-by-side diff</Tooltip.Content>
							</Tooltip.Root>
						</div>
					</div>
					<!-- Monaco needs a definite height; percentage heights do not resolve
					     through the flex chain, so pin it with an absolute layer. -->
					<div class="relative min-h-0 flex-1 overflow-hidden rounded-b-md border">
						<div class="absolute inset-0">
							<MonacoDiff
								original={documents.defaultsText}
								bind:modified={mergedText}
								renderSideBySide={sideBySide}
								{hideUnchanged}
								theme={themeMode.current === 'dark' ? 'vs-dark' : 'vs'}
								options={{ padding: { top: 16, bottom: 8 } }}
							/>
						</div>
					</div>
				</div>
				<div class="flex w-full shrink-0 items-center justify-between gap-3">
					<Button
						onclick={() => {
							currentStep = '1';
						}}
					>
						Previous
					</Button>
					<Button disabled={isSubmitting} onclick={() => handleUpgrade(documents.defaultsText)}>
						{#if isSubmitting}
							Upgrading…
						{:else}
							Upgrade
						{/if}
					</Button>
				</div>
			{:catch error}
				{@render loadFailure('Failed to load chart values', error.message)}
				<div class="flex w-full items-center justify-start">
					<Button
						onclick={() => {
							currentStep = '1';
						}}
					>
						Previous
					</Button>
				</div>
			{/await}
		{/if}
	</Dialog.Content>
</Dialog.Root>
