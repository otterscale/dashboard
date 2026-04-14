<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { DownloadIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import type { Row, Table } from '@tanstack/table-core';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import {
		encodeHarborURIComponent,
		parseHarborHost
	} from '$lib/components/artifact-viewer/utils.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	import type { ModuleAttribute } from './table-layout';
	import { type ModuleType } from './types';

	let {
		table,
		cluster,
		fromHarbor
	}: {
		table: Table<Record<string, JsonValue>>;
		cluster: string;
		fromHarbor: boolean;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const runtimeClient = createClient(RuntimeService, transport);

	const decoder = new TextDecoder();

	const rows = $derived(table.getFilteredSelectedRowModel().rows);

	let open = $state(false);
	let isSubmitting = $state(false);

	type ResultType = { status: 'installed'; name: string } | { status: 'skipped'; name: string };

	async function fetchValuesFromHarbor(
		chart: ModuleType,
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<string> {
		const harborHost = parseHarborHost(helmRepository);

		const projectPath = encodeHarborURIComponent('otterscale');
		const repositoryPath = encodeHarborURIComponent(chart.name);
		const referencePath = encodeHarborURIComponent(chart.digest);
		const additionPath = encodeHarborURIComponent('values.yaml');

		const additionUrl = `/api/v2.0/projects/${projectPath}/repositories/${repositoryPath}/artifacts/${referencePath}/additions/${additionPath}`;

		const response = await fetch('/bff/helm/repository/harbor', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				harborHost,
				apiPath: additionUrl
			})
		});

		if (!response.ok) {
			throw new Error('Failed to fetch Harbor values.yaml');
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			return JSON.stringify(await response.json());
		}

		return response.text();
	}

	async function fetchValuesFromIndex(
		chart: ModuleType,
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	) {
		const chartVersions = lodash.get(chart, 'versions', []) as ModuleType[];
		const [chartVersion] = chartVersions;

		const response = await runtimeClient.showChart({
			repoUrl: helmRepository.spec?.url ?? '',
			chartName: chartVersion.name ?? '',
			version: chartVersion.version ?? ''
		});

		return decoder.decode(response.values);
	}

	function getDependencies(chart: ModuleType): string[] {
		const dependsOn = chart.annotations?.['module.otterscale.io/depends-on'] ?? '';
		return dependsOn.split(',').filter(Boolean);
	}

	/**
	 * Layered Topological Sort (Kahn's Algorithm variant)
	 *
	 * Groups selected modules into installation layers, where all modules
	 * within the same layer can be installed in parallel. Each layer only
	 * contains modules whose dependencies are satisfied by previously placed
	 * layers or already-installed modules.
	 *
	 * Unresolvable modules (circular deps or missing deps) are collected into
	 * a final "dead-end" layer for the caller to handle as failures.
	 */
	function buildInstallLayers(
		selectedRows: Row<Record<ModuleAttribute, JsonValue>>[],
		installedSet: Set<string>
	): Row<Record<ModuleAttribute, JsonValue>>[][] {
		// Build a lookup map from module name → row for quick access during sorting
		const rowByModuleName = new SvelteMap<string, Row<Record<ModuleAttribute, JsonValue>>>();
		for (const row of selectedRows) {
			const chart = row.original.chart as unknown as ModuleType;
			rowByModuleName.set(chart.name, row);
		}

		// "Placed" tracks all modules whose dependencies are already satisfied —
		// seeded with already-installed modules so they count as resolved from the start
		const placedModuleNames = new SvelteSet<string>(installedSet);

		// "Remaining" is the working set of modules not yet assigned to a layer
		const remainingModuleNames = new SvelteSet(rowByModuleName.keys());

		const installLayers: Row<Record<ModuleAttribute, JsonValue>>[][] = [];

		while (remainingModuleNames.size > 0) {
			// Collect all modules whose dependencies are fully satisfied this round
			const currentLayer: Row<Record<ModuleAttribute, JsonValue>>[] = [];

			for (const moduleName of remainingModuleNames) {
				const row = rowByModuleName.get(moduleName)!;
				const chart = row.original.chart as unknown as ModuleType;
				const dependencies = getDependencies(chart);

				if (dependencies.every((dependency) => placedModuleNames.has(dependency))) {
					currentLayer.push(row);
				}
			}

			if (currentLayer.length === 0) {
				// No progress was made — remaining modules have unresolvable dependencies
				// (circular dependency or dependency not present in the selected set).
				// Collect them into a final dead-end layer so the caller can mark them as failures.
				const deadEndLayer = [...remainingModuleNames].map(
					(moduleName) => rowByModuleName.get(moduleName)!
				);
				installLayers.push(deadEndLayer);
				break;
			}

			// Promote this layer's modules into "placed" so the next round can depend on them
			for (const row of currentLayer) {
				const chart = row.original.chart as unknown as ModuleType;
				remainingModuleNames.delete(chart.name);
				placedModuleNames.add(chart.name);
			}

			installLayers.push(currentLayer);
		}

		return installLayers;
	}

	async function handleInstall(
		row: Row<Record<ModuleAttribute, JsonValue>>,
		installedSet: Set<string>
	): Promise<ResultType> {
		const chart = row.original.chart as unknown as ModuleType;
		const dependencies = getDependencies(chart);
		const dependenciesReady = dependencies.every((dependency) => installedSet.has(dependency));

		if (!dependenciesReady) {
			return { status: 'skipped', name: chart.name };
		}

		const helmRepository = row.original.helmRepository as SourceToolkitFluxcdIoV1HelmRepository;

		const helmValues = fromHarbor
			? await fetchValuesFromHarbor(chart, helmRepository)
			: await fetchValuesFromIndex(chart, helmRepository);

		const manifest = {
			apiVersion: `${group}/${version}`,
			kind,
			metadata: {
				name: chart.name,
				namespace: 'otterscale-system'
			},
			spec: {
				releaseName: chart.name,
				targetNamespace: lodash.get(chart, ['annotations', 'module.otterscale.io/namespace']),
				install: { createNamespace: true },
				interval: '15m',
				chart: {
					spec: {
						chart: chart.name,
						version: chart.version,
						sourceRef: {
							apiVersion: helmRepository?.apiVersion,
							kind: helmRepository?.kind,
							name: helmRepository?.metadata?.name,
							namespace: helmRepository?.metadata?.namespace
						}
					}
				},
				values: load(helmValues) ?? {}
			}
		};

		await resourceClient.create({
			cluster,
			namespace: 'otterscale-system',
			group,
			version,
			resource,
			manifest: new TextEncoder().encode(stringify(manifest))
		});

		return { status: 'installed', name: chart.name };
	}

	async function handleBulkInstall() {
		if (isSubmitting) return;
		isSubmitting = true;

		// Fetch currently installed HelmReleases from the cluster in real time
		const listResponse = await resourceClient.list({
			cluster,
			namespace: 'otterscale-system',
			group,
			version,
			resource
		});

		const installedSet = new SvelteSet<string>(
			listResponse.items
				.map((item) => (item.object?.['metadata'] as Record<string, unknown>)?.['name'] as string)
				.filter(Boolean)
		);

		const layers = buildInstallLayers(rows, installedSet);

		let successes = 0;
		let fails = 0;
		let skipped = 0;

		for (const layer of layers) {
			const results = await Promise.allSettled(
				layer.map((row) => handleInstall(row, installedSet))
			);

			for (const result of results) {
				if (result.status === 'fulfilled') {
					if (result.value.status === 'skipped') {
						skipped += 1;
						toast.info(`Skipped ${result.value.name}`);
					} else {
						successes += 1;
						installedSet.add(result.value.name);
						toast.success(`Successfully installed ${result.value.name}`);
					}
				} else {
					fails += 1;
					const message =
						result.reason instanceof ConnectError ? result.reason.message : String(result.reason);
					toast.error(`Failed to install: ${message}`);
				}
			}
		}

		if (fails === 0) {
			toast.success(`${successes} installed, ${skipped} skipped`);
		} else {
			toast.warning(`${successes} installed, ${fails} failed, ${skipped} skipped`);
		}

		table.resetRowSelection();
		isSubmitting = false;
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" {...props}>
				<DownloadIcon size={16} />
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-h-[80vh] overflow-auto">
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">Bulk Install</Item.Title>
					<Item.Description>
						Install module(s) with default values into cluster {cluster}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>
		<div class="space-y-2">
			{#each rows as row (row.id)}
				{@const chart = row.original.chart as unknown as ModuleType}
				<Item.Root class="rounded-md border p-0">
					<Item.Content class="text-left">
						<Item.Title class="text-sm font-medium">
							{chart.name}
						</Item.Title>
						<Item.Description class="text-xs">
							v{chart.version}
						</Item.Description>
					</Item.Content>
				</Item.Root>
			{/each}
		</div>
		<Dialog.Footer>
			<Button onclick={handleBulkInstall} disabled={isSubmitting} class="w-full">
				{#if isSubmitting}
					<Spinner />
				{/if}
				Install
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
