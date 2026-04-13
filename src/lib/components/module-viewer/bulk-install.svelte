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

	import Badge from '../ui/badge/badge.svelte';
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

	async function handleInstall(row: Row<Record<ModuleAttribute, JsonValue>>): Promise<ResultType> {
		if (!row.original.installable) {
			return { status: 'skipped', name: row.original['Chart Name'] as string };
		}

		const chart = row.original.chart as unknown as ModuleType;
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

		const results = await Promise.allSettled(rows.map((row) => handleInstall(row)));

		let successes = 0;
		let fails = 0;
		let skipped = 0;

		results.forEach((result) => {
			if (result.status === 'fulfilled') {
				if (result.value.status === 'skipped') {
					skipped = skipped + 1;
					toast.info(`Skipped ${result.value.name}`);
				} else {
					successes = successes + 1;
					toast.success(`Successfully installed ${result.value.name}`);
				}
			} else {
				fails = fails + 1;
				const message =
					result.reason instanceof ConnectError ? result.reason.message : String(result.reason);
				toast.error(`Failed to install: ${message}`);
			}
		});

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
	{@const installableModules = rows.filter((row) => row.original.installable).length}
	<Dialog.Trigger disabled={installableModules === 0}>
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
						Install {installableModules} module(s) with default values into cluster {cluster}
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
					{#if row.original['installable']}
						<Item.Actions>
							<Badge variant="outline">Installable</Badge>
						</Item.Actions>
					{/if}
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
