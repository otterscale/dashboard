<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { DownloadIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import type { Table } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';
	import { JSON_SCHEMA, load } from 'js-yaml';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import { type ModuleType } from './types';

	let {
		table,
		cluster,
		validate
	}: {
		table: Table<Record<string, JsonValue>>;
		cluster: string;
		validate?: ValidateFunction;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Only rows that are NOT yet installed
	const installableRows = $derived(
		table.getFilteredSelectedRowModel().rows.filter((row) => row.original['Installed'] !== true)
	);

	let open = $state(false);
	let isSubmitting = $state(false);
	async function handleInstall(
		module: ModuleType,
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<string> {
		if (!validate) {
			throw new Error('HelmRelease schema calidator is not available.');
		}

		const dependencies = lodash
			.get(module, ['annotations', 'module.otterscale.io/depends-on'], '')
			.split(',')
			.filter(Boolean);
		const dependenciesOfSelectedModules = dependencies.map((name) => ({
			name,
			namespace
		}));

		const manifest = {
			apiVersion: `${group}/${version}`,
			kind,
			metadata: {
				name: module.name,
				namespace
			},
			spec: {
				releaseName: module.name,
				targetNamespace: lodash.get(module, ['annotations', 'module.otterscale.io/namespace']),
				install: { createNamespace: true },
				interval: '15m',
				timeout: '1h',
				...(dependenciesOfSelectedModules.length > 0 && {
					dependsOn: dependenciesOfSelectedModules
				}),
				chart: {
					spec: {
						chart: module.name,
						version: module.version,
						sourceRef: {
							apiVersion: helmRepository?.apiVersion,
							kind: helmRepository?.kind,
							name: helmRepository?.metadata?.name,
							namespace: helmRepository?.metadata?.namespace
						}
					}
				},
				values: {}
			}
		};

		let parsed: unknown;
		try {
			parsed = load(stringify(manifest, { schema: 'yaml-1.1' }), { schema: JSON_SCHEMA });
		} catch (error) {
			console.error(`Failed to parse HelmRelease manifest for ${name}:`, error);
			throw new Error(`Invalid YAML for ${name}.`);
		}

		const isValid = validate(parsed);
		if (!isValid) {
			console.error(`Validation errors for ${name}:`, validate.errors);
			throw new Error(`Validation failed for ${name}.`);
		}

		await resourceClient.create({
			cluster,
			namespace,
			group,
			version,
			resource,
			manifest: new TextEncoder().encode(stringify(manifest))
		});

		return module.name;
	}

	async function handleBulkInstall() {
		if (isSubmitting) return;
		isSubmitting = true;

		const results = await Promise.allSettled(
			installableRows.map((row) => {
				const module = row.original.chart as unknown as ModuleType;
				const helmRepository = row.original.helmRepository as SourceToolkitFluxcdIoV1HelmRepository;
				return handleInstall(module, helmRepository);
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
			<Dialog.Trigger disabled={installableRows.length === 0 || !validate}>
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
			{#each installableRows as row (row.id)}
				{@const module = row.original.chart as unknown as ModuleType}
				<Item.Root class="rounded-md border p-0">
					<Item.Content class="text-left">
						<Item.Title class="text-sm font-medium">
							{module.name}
						</Item.Title>
						<Item.Description class="text-xs">
							{module.version}
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
