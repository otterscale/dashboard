<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import ArrowUpCircleIcon from '@lucide/svelte/icons/arrow-up-circle';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { HelmToolkitFluxcdIoV2HelmRelease } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { Table } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';
	import { JSON_SCHEMA, load } from 'js-yaml';
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
		schema,
		validate
	}: {
		table: Table<Record<string, JsonValue>>;
		cluster: string;
		schema?: Schema;
		validate?: ValidateFunction;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const resource = 'helmreleases';
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const rows = $derived(
		table.getFilteredSelectedRowModel().rows.filter((row) => row.original['Installed'] === true)
	);

	let open = $state(false);
	let isSubmitting = $state(false);

	function buildManifestFromSchema(
		existing: HelmToolkitFluxcdIoV2HelmRelease,
		jsonSchema: Schema,
		targetVersion: string
	): string {
		const schemaProperties =
			(jsonSchema as { properties?: Record<string, unknown> }).properties ?? {};
		const source = existing as unknown as Record<string, unknown>;
		const manifest: Record<string, unknown> = {};

		for (const key of Object.keys(schemaProperties)) {
			const value = source[key];
			if (value !== undefined) {
				manifest[key] = value;
			}
		}

		const metadata = (manifest.metadata ?? {}) as Record<string, unknown>;
		const existingMetadata = (source.metadata ?? {}) as Record<string, unknown>;
		if (existingMetadata.resourceVersion) {
			metadata.resourceVersion = existingMetadata.resourceVersion;
		}
		manifest.metadata = metadata;

		const spec = (manifest.spec ?? {}) as Record<string, unknown>;
		const chart = (spec.chart ?? {}) as Record<string, unknown>;
		const chartSpec = (chart.spec ?? {}) as Record<string, unknown>;

		manifest.spec = {
			...spec,
			chart: {
				...chart,
				spec: {
					...chartSpec,
					version: targetVersion
				}
			}
		};

		return stringify(manifest, { schema: 'yaml-1.1' });
	}

	async function handleUpgrade(module: ModuleType): Promise<string> {
		if (!schema || !validate) {
			throw new Error('HelmRelease schema is not available.');
		}

		const name = module.name;

		const getResponse = await resourceClient.get({
			cluster,
			namespace,
			name,
			group,
			version,
			resource
		});

		const existing = getResponse.object as HelmToolkitFluxcdIoV2HelmRelease;
		const yamlValue = buildManifestFromSchema(existing, schema, module.version);

		let parsed: unknown;
		try {
			parsed = load(yamlValue, { schema: JSON_SCHEMA });
		} catch (error) {
			console.error(`Failed to parse HelmRelease manifest for ${name}:`, error);
			throw new Error(`Invalid YAML for ${name}.`);
		}

		const isValid = validate(parsed);
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
			manifest: new TextEncoder().encode(yamlValue),
			fieldManager: 'otterscale-web-ui'
		});

		return name;
	}

	async function handleBulkUpgrade() {
		if (isSubmitting || !schema || !validate) return;
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
			<Dialog.Trigger disabled={rows.length === 0 || !schema || !validate}>
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
			<Button
				onclick={handleBulkUpgrade}
				disabled={isSubmitting || !schema || !validate}
				class="w-full"
			>
				{#if isSubmitting}
					<Spinner />
				{/if}
				Upgrade
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
