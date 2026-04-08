<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { DownloadIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import type { Row } from '@tanstack/table-core';
	import { load } from 'js-yaml';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { buttonVariants } from '$lib/components/ui/button';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

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

	const helmRepository = row.original.helmRepository as SourceToolkitFluxcdIoV1HelmRepository;

	let modules: ModuleType[] = $derived(
		lodash.get(row.original.chart, 'versions', {}) as ModuleType[]
	);
	let latestChart: ModuleType = $derived(modules[0] || ({} as ModuleType));

	let open = $state(false);
	let isSubmitting = $state(false);

	async function handleInstall() {
		if (isSubmitting) return;
		isSubmitting = true;

		const name = chart.name;

		toast.promise(
			async () => {
				const response = await runtimeClient.showChart({
					repoUrl: helmRepository.spec?.url ?? '',
					chartName: latestChart.name ?? '',
					version: latestChart.version ?? ''
				});
				const decoder = new TextDecoder();
				const chartValues = decoder.decode(response.values);

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
								chart: latestChart.name,
								version: latestChart.version,
								sourceRef: {
									apiVersion: helmRepository?.apiVersion,
									kind: helmRepository?.kind,
									name: helmRepository?.metadata?.name,
									namespace: helmRepository?.metadata?.namespace
								}
							}
						},
						values: load(chartValues) ?? {}
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
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={() => {
		onOpenChangeComplete?.();
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
	<Dialog.Content>
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">Install {chart.name}</Item.Title>
					<Item.Description>
						This will install with default values into the cluster {cluster}. Are you sure you want
						to proceed?
					</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>
		<Button onclick={handleInstall} disabled={isSubmitting}>
			{#if isSubmitting}
				<Spinner />
			{/if}
			Install
		</Button>
	</Dialog.Content>
</Dialog.Root>
