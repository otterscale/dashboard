<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import ArrowUpCircleIcon from '@lucide/svelte/icons/arrow-up-circle';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { HelmToolkitFluxcdIoV2HelmRelease } from '@otterscale/types';
	import type { Row } from '@tanstack/table-core';
	import lodash from 'lodash';
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
		onOpenChangeComplete
	}: {
		row: Row<Record<ModuleAttribute, JsonValue>>;
		cluster: string;
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

	// All available versions for this module
	const allVersions = $derived((module.versions ?? []).map((v) => v.version).filter(Boolean));
	// Latest version is the first entry in versions[]
	const latestVersion = $derived(allVersions[0] ?? module.version);

	let selectedVersion = $state('');
	$effect(() => {
		if (latestVersion && !selectedVersion) {
			selectedVersion = latestVersion;
		}
	});

	let open = $state(false);
	let isSubmitting = $state(false);

	async function handleUpgrade() {
		if (isSubmitting || !selectedVersion) return;
		isSubmitting = true;

		const name = module.name;

		toast.promise(
			async () => {
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

				// Build patched manifest: preserve all fields, only update chart version
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
				lodash.set(cloned, 'spec.chart.spec.version', selectedVersion);

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

		<Button onclick={handleUpgrade} disabled={isSubmitting || !selectedVersion}>
			{#if isSubmitting}
				<Spinner />
			{/if}
			Upgrade
		</Button>
	</Dialog.Content>
</Dialog.Root>
