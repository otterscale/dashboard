<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import ArrowUpCircleIcon from '@lucide/svelte/icons/arrow-up-circle';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { HelmToolkitFluxcdIoV2HelmRelease } from '@otterscale/types';
	import type { Table } from '@tanstack/table-core';
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
		cluster
	}: {
		table: Table<Record<string, JsonValue>>;
		cluster: string;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const resource = 'helmreleases';
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Only rows that are already installed
	const rows = $derived(
		table.getFilteredSelectedRowModel().rows.filter((row) => row.original['Installed'] === true)
	);

	let open = $state(false);
	let isSubmitting = $state(false);

	async function handleUpgrade(module: ModuleType): Promise<string> {
		const name = module.name;

		// Fetch current HelmRelease to preserve existing spec
		const getResponse = await resourceClient.get({
			cluster,
			namespace,
			name,
			group,
			version,
			resource
		});

		const existing = getResponse.object as HelmToolkitFluxcdIoV2HelmRelease;

		const systemFields = [
			'creationTimestamp',
			'deletionGracePeriodSeconds',
			'deletionTimestamp',
			'generation',
			'managedFields',
			'ownerReferences',
			'resourceVersion',
			'selfLink',
			'uid'
		];
		const cloned = lodash.cloneDeep(existing) as Record<string, unknown>;
		const metadata = cloned.metadata as Record<string, unknown> | undefined;
		if (metadata) {
			for (const field of systemFields) {
				delete metadata[field];
			}
		}
		// Update to the latest chart version
		lodash.set(cloned, 'spec.chart.spec.version', module.version);

		const manifest = new TextEncoder().encode(stringify(cloned, { schema: 'yaml-1.1' }));

		await resourceClient.apply({
			cluster,
			namespace,
			name,
			group,
			version,
			resource,
			manifest,
			fieldManager: 'otterscale-web-ui',
			force: true
		});

		return name;
	}

	async function handleBulkUpgrade() {
		if (isSubmitting) return;
		isSubmitting = true;

		const results = await Promise.allSettled(
			rows.map((row) => {
				const module = row.original.chart as unknown as ModuleType;
				return handleUpgrade(module);
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
			<Dialog.Trigger disabled={rows.length === 0}>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>
						<ArrowUpCircleIcon size={16} />
					</Button>
				{/snippet}
			</Dialog.Trigger>
		</Tooltip.Trigger>
		<Tooltip.Content>Bulk Upgrade ({rows.length} selected)</Tooltip.Content>
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
			{#each rows as row (row.id)}
				{@const module = row.original.chart as unknown as ModuleType}
				{@const installedVer = row.original['installedVersion'] as string}
				<Item.Root class="rounded-md border p-0">
					<Item.Content class="text-left">
						<Item.Title class="text-sm font-medium">
							{module.name}
						</Item.Title>
						<Item.Description class="text-xs">
							v{installedVer || '?'} → v{module.version}
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
