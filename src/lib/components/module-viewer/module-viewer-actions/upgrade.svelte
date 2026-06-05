<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import ArrowUpCircleIcon from '@lucide/svelte/icons/arrow-up-circle';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { HelmToolkitFluxcdIoV2HelmRelease } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';
	import { JSON_SCHEMA, load } from 'js-yaml';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import { buttonVariants } from '$lib/components/ui/button';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	import type { ModuleAttribute } from '../table-layout';
	import { type ModuleType } from '../types';

	let {
		row,
		cluster,
		schema,
		validate,
		onOpenChangeComplete
	}: {
		row: Row<Record<ModuleAttribute, JsonValue>>;
		cluster: string;
		schema?: Schema;
		validate?: ValidateFunction;
		onOpenChangeComplete: () => void;
	} = $props();

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const module = $derived(row.original['chart'] as unknown as ModuleType);

	const allVersions = $derived((module.versions ?? []).map((v) => v.version).filter(Boolean));
	const latestVersion = $derived(allVersions[0] ?? module.version);

	let selectedVersion = $state('');
	$effect(() => {
		if (latestVersion && !selectedVersion) {
			selectedVersion = latestVersion;
		}
	});

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

	async function handleUpgrade() {
		if (isSubmitting || !selectedVersion || !schema || !validate) return;
		isSubmitting = true;

		const name = module.name;

		toast.promise(
			async () => {
				const getResponse = await resourceClient.get({
					cluster,
					namespace,
					name,
					group,
					version,
					resource
				});

				const existing = getResponse.object as HelmToolkitFluxcdIoV2HelmRelease;
				const yamlValue = buildManifestFromSchema(existing, schema, selectedVersion);

				let parsed: unknown;
				try {
					parsed = load(yamlValue, { schema: JSON_SCHEMA });
				} catch (error) {
					console.error('Failed to parse HelmRelease manifest:', error);
					throw new Error('Invalid YAML. Please try again.');
				}

				const isValid = validate(parsed);
				if (!isValid) {
					console.error('Validation errors:', validate.errors);
					throw new Error('Validation failed. The manifest does not match the HelmRelease schema.');
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
			},
			{
				loading: `Upgrading ${kind} ${name} to ${selectedVersion}…`,
				success: () => `Successfully upgraded ${kind} ${name} to ${selectedVersion}`,
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
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={() => {
		onOpenChangeComplete?.();
		if (!open) {
			selectedVersion = latestVersion;
		}
	}}
>
	<Dialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
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

	<Dialog.Content>
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">Upgrade</Item.Title>
					<Item.Description>
						Select a target version for <strong>{module.name}</strong> in cluster
						<strong>{cluster}</strong>.
					</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>

		<Item.Root class="rounded-md border p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-sm font-medium">{module.name}</Item.Title>
				<Item.Description class="text-xs">
					Current: v{(row.original['installedVersion'] as string) ?? module.version}
				</Item.Description>
			</Item.Content>
		</Item.Root>

		<div class="flex flex-col gap-1">
			<label class="text-sm font-medium" for="upgrade-version-select">Target Version</label>
			<Select.Root type="single" bind:value={selectedVersion}>
				<Select.Trigger id="upgrade-version-select" class="w-full">
					{selectedVersion || 'Select a version…'}
				</Select.Trigger>
				<Select.Content>
					{#each allVersions as ver (ver)}
						<Select.Item value={ver}>
							{ver}
							{#if ver === latestVersion}
								<span class="ml-1 text-xs text-muted-foreground">(latest)</span>
							{/if}
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<Button onclick={handleUpgrade} disabled={isSubmitting || !selectedVersion || !validate}>
			{#if isSubmitting}
				<Spinner />
			{/if}
			Upgrade
		</Button>
	</Dialog.Content>
</Dialog.Root>
