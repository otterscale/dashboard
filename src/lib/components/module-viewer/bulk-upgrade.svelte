<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import ArrowUpCircleIcon from '@lucide/svelte/icons/arrow-up-circle';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { HelmToolkitFluxcdIoV2HelmRelease } from '@otterscale/types';
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
	const resource = 'helmreleases';
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const updatableRows = $derived(
		table
			.getFilteredSelectedRowModel()
			.rows.filter(
				(row) =>
					row.original['Installed'] === true &&
					row.original['Installed Version'] !== row.original['Latest Version']
			)
	);

	let open = $state(false);
	let isSubmitting = $state(false);

	async function handleUpgrade(module: ModuleType, latestVersion: string): Promise<string> {
		if (!validate) {
			throw new Error('HelmRelease validator is not available.');
		}

		// Get module name
		const name = module.name;

		// Get resource
		const response = await resourceClient.get({
			cluster,
			namespace,
			name,
			group,
			version,
			resource
		});

		// Revise version
		const helmRelease: HelmToolkitFluxcdIoV2HelmRelease = lodash.cloneDeep(response.object ?? {});
		lodash.set(helmRelease, ['spec', 'chart', 'spec', 'version'], latestVersion);

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

		return name;
	}

	async function handleBulkUpgrade() {
		if (isSubmitting || !validate) return;
		isSubmitting = true;

		const results = await Promise.allSettled(
			updatableRows.map((row) => {
				return handleUpgrade(
					row.original.chart as unknown as ModuleType,
					row.original['Latest Version'] as string
				);
			})
		);

		let successes = 0;
		let fails = 0;

		for (const result of results) {
			if (result.status === 'fulfilled') {
				successes += 1;
				toast.success(`Successfully upgraded ${result.value}`);
			} else {
				fails += 1;
				const message =
					result.reason instanceof ConnectError ? result.reason.message : String(result.reason);
				toast.error(`Failed to upgrade: ${message}`);
			}
		}

		if (fails === 0) {
			toast.success(`${successes} HelmRelease(s) upgraded — FluxCD will reconcile`);
		} else {
			toast.warning(`${successes} upgraded, ${fails} failed`);
		}

		table.resetRowSelection();
		isSubmitting = false;
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Tooltip.Root>
		<Tooltip.Trigger>
			<Dialog.Trigger disabled={updatableRows.length === 0 || !validate}>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>
						<ArrowUpCircleIcon size={16} />
					</Button>
				{/snippet}
			</Dialog.Trigger>
		</Tooltip.Trigger>
		<Tooltip.Content>Bulk Upgrade</Tooltip.Content>
	</Tooltip.Root>
	<Dialog.Content class="max-h-[80vh] overflow-auto">
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">Bulk Upgrade</Item.Title>
					<Item.Description>
						Upgrade selected installed module(s) to latest version in cluster {cluster}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>
		<div class="space-y-2">
			{#each updatableRows as row (row.id)}
				{@const module = row.original.chart as unknown as ModuleType}
				{@const installedVersion = row.original['Installed Version'] as string}
				<Item.Root class="p-0">
					<Item.Content class="text-left">
						<Item.Title class="text-sm font-medium">
							{module.name}
						</Item.Title>
						<Item.Description class="text-xs">
							v{installedVersion} to v{module.version}
						</Item.Description>
					</Item.Content>
				</Item.Root>
			{/each}
		</div>
		<Dialog.Footer>
			<Button onclick={handleBulkUpgrade} disabled={isSubmitting} class="w-full">
				{#if isSubmitting}
					<Spinner />
				{/if}
				Upgrade
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
