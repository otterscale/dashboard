<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { Row } from '@tanstack/table-core';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

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

	const module = $derived(row.original['chart'] as unknown as ModuleType);
	const installedVersion = $derived((row.original['installedVersion'] as string) ?? module.version);

	let open = $state(false);
	let isSubmitting = $state(false);
	let confirm = $state('');
	const isConfirmed = $derived(confirm === module.name);

	async function handleUninstall() {
		if (isSubmitting) return;
		isSubmitting = true;

		const name = module.name;

		toast.promise(
			async () => {
				await resourceClient.delete({
					cluster,
					namespace,
					group,
					version,
					resource,
					name
				});
			},
			{
				loading: `Uninstalling ${kind} ${name}…`,
				success: () => {
					return `Successfully uninstalled ${kind} ${name} — FluxCD is reconciling`;
				},
				error: (error) => {
					console.error(`Failed to uninstall ${kind} ${name}:`, error);
					return `Failed to uninstall ${kind} ${name}: ${(error as ConnectError).message}`;
				},
				finally() {
					isSubmitting = false;
					open = false;
					confirm = '';
				}
			}
		);
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		onOpenChangeComplete?.();
		if (!isOpen) confirm = '';
	}}
>
	<Dialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs **:text-destructive" size="sm">
				<Item.Media>
					<Trash2Icon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Uninstall</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">Uninstall</Item.Title>
					<Item.Description>
						This will remove the module from cluster {cluster}. FluxCD will uninstall the associated
						Helm chart. Enter the module name to proceed.
					</Item.Description>
				</Item.Content>
			</Item.Root>
		</Dialog.Header>
		<Item.Root class="rounded-md border p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-sm font-medium">
					{module.name}
				</Item.Title>
				<Item.Description class="text-xs">
					Installed: v{installedVersion}
				</Item.Description>
			</Item.Content>
		</Item.Root>

		<div class="mt-3">
			<label for={`confirm-module-name-${module.name}`} class="text-sm font-medium"
				>Type module name to confirm</label
			>
			<input
				id={`confirm-module-name-${module.name}`}
				class="mt-1 w-full rounded-md border px-2 py-1"
				bind:value={confirm}
				placeholder={module.name}
				aria-label="Confirm module name"
			/>
		</div>
		<Button variant="destructive" onclick={handleUninstall} disabled={isSubmitting || !isConfirmed}>
			{#if isSubmitting}
				<Spinner />
			{/if}
			Uninstall
		</Button>
	</Dialog.Content>
</Dialog.Root>
