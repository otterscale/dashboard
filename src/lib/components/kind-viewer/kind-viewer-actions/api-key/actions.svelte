<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import type { Schema } from '@sjsf/form';
	import { toast } from 'svelte-sonner';

	import {
		decryptApiKey,
		deleteStashedPrivateKey,
		loadStashedPrivateKey,
		stashId
	} from '$lib/components/api-keys/crypto';
	import RevealKeyDialog from '$lib/components/api-keys/reveal-key-dialog.svelte';
	import { type ApiKeyObject } from '$lib/components/api-keys/service';
	import Delete from '$lib/components/kind-viewer/kind-viewer-actions/default/delete.svelte';
	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/messages';

	import Rotate from './rotate.svelte';

	let {
		schema,
		object,
		cluster = '',
		namespace = '',
		group = '',
		version = '',
		kind = '',
		resource = ''
	}: {
		schema: Schema;
		object?: ApiKeyObject;
		cluster?: string;
		namespace?: string;
		group?: string;
		version?: string;
		kind?: string;
		resource?: string;
	} = $props();

	let actionsOpen = $state(false);

	// Issued but never shown, e.g. the page was refreshed while waiting for the key.
	let pendingId = $state('');
	$effect(() => {
		const generation = Number(object?.status?.keyGeneration ?? 0);
		if (!object || !generation || !object.status?.encryptedKey) {
			pendingId = '';
			return;
		}
		const id = stashId(cluster, namespace, object.metadata.name, generation);
		loadStashedPrivateKey(id).then((privateKey) => {
			pendingId = privateKey ? id : '';
		});
	});

	let reveal = $state({ open: false, plainKey: '', name: '', clientId: '', stashedKeyId: '' });

	function openReveal(plainKey: string, apiKey: ApiKeyObject, stashedKeyId: string) {
		reveal = {
			open: true,
			plainKey,
			name: apiKey.metadata.name,
			clientId: apiKey.status?.clientId ?? '',
			stashedKeyId
		};
	}

	function onRevealClosed() {
		const id = reveal.stashedKeyId;
		reveal = { open: false, plainKey: '', name: '', clientId: '', stashedKeyId: '' };
		if (id) {
			void deleteStashedPrivateKey(id);
			pendingId = '';
		}
	}

	async function revealPending() {
		if (!object || !pendingId) return;
		actionsOpen = false;
		try {
			const privateKey = await loadStashedPrivateKey(pendingId);
			if (!privateKey) throw new Error('stash lost');
			const plainKey = await decryptApiKey(privateKey, object.status!.encryptedKey!);
			openReveal(plainKey, object, pendingId);
		} catch (error) {
			console.error('[api-keys] pending reveal failed:', error);
			void deleteStashedPrivateKey(pendingId);
			pendingId = '';
			toast.error(m.api_key_reveal_lost());
		}
	}
</script>

<DropdownMenu.Root bind:open={actionsOpen}>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<div class="flex justify-end">
				<Button size="icon" variant="ghost" class="shadow-none" aria-label="Actions" {...props}>
					<EllipsisIcon size={16} aria-hidden="true" />
				</Button>
			</div>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-full">
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<View {schema} {object} />
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Describe {cluster} {namespace} {group} {version} {resource} {object} />
			</DropdownMenu.Item>
			{#if pendingId}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Item.Root
						class="w-full p-0 text-xs"
						size="sm"
						title={m.api_key_pending_reveal_hint()}
						onclick={revealPending}
					>
						<Item.Media>
							<KeyRoundIcon />
						</Item.Media>
						<Item.Content>
							<Item.Title>{m.api_key_pending_reveal()}</Item.Title>
						</Item.Content>
					</Item.Root>
				</DropdownMenu.Item>
			{/if}
			{#if object}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Rotate
						{cluster}
						{namespace}
						apiKey={object}
						onRevealKey={openReveal}
						onOpenChangeComplete={() => {
							actionsOpen = false;
						}}
					/>
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Delete
					{schema}
					{object}
					{cluster}
					{namespace}
					{group}
					{version}
					{kind}
					{resource}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<RevealKeyDialog
	bind:open={reveal.open}
	name={reveal.name}
	clientId={reveal.clientId}
	plainKey={reveal.plainKey}
	onClosed={onRevealClosed}
/>
