<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { DownloadIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import type { Row } from '@tanstack/table-core';
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

	const group = 'helm.toolkit.fluxcd.io';
	const version = 'v2';
	const kind = 'HelmRelease';
	const resource = 'helmreleases';
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let open = $state(false);
	let isSubmitting = $state(false);

	async function handleInstall() {
		if (isSubmitting) return;
		isSubmitting = true;

		const helmRepository = row.original['helmRepository'] as SourceToolkitFluxcdIoV1HelmRepository;
		const module: ModuleType = row.original['chart'] as unknown as ModuleType;

		const name = module.name;

		toast.promise(
			async () => {
				const dependencies = lodash
					.get(module, ['annotations', 'module.otterscale.io/depends-on'], '')
					.split(',')
					.filter(Boolean);
				const dependenciesOfSelectedModule = dependencies.map((name) => ({
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
						...(dependenciesOfSelectedModule.length > 0 && {
							dependsOn: dependenciesOfSelectedModule
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
						}
					}
				};

				await resourceClient.create({
					cluster,
					namespace,
					group,
					version,
					resource,
					manifest: new TextEncoder().encode(stringify(manifest, { schema: 'yaml-1.1' }))
				});
			},
			{
				loading: `Submitting ${kind} ${name}...`,
				success: () => {
					return `Submitted ${kind} ${name} — FluxCD is reconciling`;
				},
				error: (error) => {
					console.error(`Failed to submit ${kind} ${name}:`, error);
					return `Failed to submit ${kind} ${name}: ${(error as ConnectError).message}`;
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
					<Item.Title class="text-xl font-bold">Install</Item.Title>
					<Item.Description>
						This will install with default values into the cluster {cluster}. Are you sure you want
						to proceed?
					</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>
		{@const module = row.original.chart as unknown as ModuleType}
		<Item.Root class="rounded-md border p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-sm font-medium">
					{module.name}
				</Item.Title>
				<Item.Description class="text-xs">
					v{module.version}
				</Item.Description>
			</Item.Content>
		</Item.Root>
		<Button onclick={handleInstall} disabled={isSubmitting}>
			{#if isSubmitting}
				<Spinner />
			{/if}
			Install
		</Button>
	</Dialog.Content>
</Dialog.Root>
