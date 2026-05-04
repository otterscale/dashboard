<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { DownloadIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import type { Table } from '@tanstack/table-core';
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
	import * as Tooltip from '$lib/components/ui/tooltip';

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
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const runtimeClient = createClient(RuntimeService, transport);

	const decoder = new TextDecoder();

	const rows = $derived(table.getFilteredSelectedRowModel().rows);

	let open = $state(false);
	let isSubmitting = $state(false);

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

	async function handleInstall(
		chart: ModuleType,
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository,
		selectedNames: Set<string>
	): Promise<string> {
		const helmValues = fromHarbor
			? await fetchValuesFromHarbor(chart, helmRepository)
			: await fetchValuesFromIndex(chart, helmRepository);

		const dependsOn = getDependencies(chart)
			.filter((name) => selectedNames.has(name))
			.map((name) => ({ name, namespace }));

		const manifest = {
			apiVersion: `${group}/${version}`,
			kind,
			metadata: {
				name: chart.name,
				namespace
			},
			spec: {
				releaseName: chart.name,
				targetNamespace: lodash.get(chart, ['annotations', 'module.otterscale.io/namespace']),
				install: { createNamespace: true },
				interval: '15m',
				...(dependsOn.length > 0 && { dependsOn }), // expand if non-empty
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
			namespace,
			group,
			version,
			resource,
			manifest: new TextEncoder().encode(stringify(manifest))
		});

		return chart.name;
	}

	async function handleBulkInstall() {
		if (isSubmitting) return;
		isSubmitting = true;

		const selectedNames = new Set(
			rows.map((row) => (row.original.chart as unknown as ModuleType).name)
		);

		const results = await Promise.allSettled(
			rows.map((row) => {
				const chart = row.original.chart as unknown as ModuleType;
				const helmRepository = row.original.helmRepository as SourceToolkitFluxcdIoV1HelmRepository;
				return handleInstall(chart, helmRepository, selectedNames);
			})
		);

		let successes = 0;
		let fails = 0;

		for (const result of results) {
			if (result.status === 'fulfilled') {
				successes += 1;
				toast.success(`Successfully created ${result.value}`);
			} else {
				fails += 1;
				const message =
					result.reason instanceof ConnectError ? result.reason.message : String(result.reason);
				toast.error(`Failed to create: ${message}`);
			}
		}

		if (fails === 0) {
			toast.success(
				`${successes} HelmRelease(s) created — FluxCD will reconcile in dependency order`
			);
		} else {
			toast.warning(`${successes} created, ${fails} failed`);
		}

		table.resetRowSelection();
		isSubmitting = false;
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Dialog.Trigger disabled={rows.length === 0}>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>
						<DownloadIcon size={16} />
					</Button>
				{/snippet}
			</Dialog.Trigger>
		</Tooltip.Trigger>
		<Tooltip.Content>Bulk Install</Tooltip.Content>
	</Tooltip.Root>
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
