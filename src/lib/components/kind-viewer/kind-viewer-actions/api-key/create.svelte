<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import {
		decryptApiKey,
		deleteStashedPrivateKey,
		exportPublicKey,
		generateKeyPair,
		stashId,
		stashPrivateKey
	} from '$lib/components/api-keys/crypto';
	import RevealKeyDialog from '$lib/components/api-keys/reveal-key-dialog.svelte';
	import {
		type ApiKeyObject,
		createApiKey,
		describeApiKeyError,
		fetchKubernetesUsername,
		waitForIssuedKey
	} from '$lib/components/api-keys/service';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';

	let {
		cluster = '',
		namespace = ''
	}: {
		cluster?: string;
		namespace?: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	let open = $state(false);
	let name = $state('');
	let isSubmitting = $state(false);
	let errorMessage = $state('');

	let reveal = $state({ open: false, plainKey: '', name: '', clientId: '', stashedKeyId: '' });

	const DNS_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
	const trimmedName = $derived(name.trim());
	const nameValid = $derived(
		trimmedName.length > 0 && trimmedName.length <= 63 && DNS_LABEL.test(trimmedName)
	);
	const nameHint = $derived(trimmedName && !nameValid ? m.api_key_name_rule() : '');

	async function submit() {
		if (!nameValid || isSubmitting) return;
		isSubmitting = true;
		errorMessage = '';
		const keyName = trimmedName;
		const id = stashId(cluster, namespace, keyName, 1);
		let created = false;

		try {
			const username = await fetchKubernetesUsername(client, cluster);
			const keyPair = await generateKeyPair();
			const publicKey = await exportPublicKey(keyPair.publicKey);
			await stashPrivateKey(id, keyPair.privateKey);

			await createApiKey(client, { cluster, namespace, name: keyName, username, publicKey });
			created = true;

			const issued = await waitForIssuedKey(client, {
				cluster,
				namespace,
				name: keyName,
				generation: 1
			});
			const plainKey = await decryptApiKey(keyPair.privateKey, issued.status!.encryptedKey!);

			open = false;
			name = '';
			openReveal(plainKey, issued, id);
		} catch (error) {
			console.error('[api-keys] create failed:', error);
			errorMessage = describeApiKeyError(error);
			toast.error(m.api_key_create_failed({ name: keyName }));
			// Once created, keep the stash so the pending-reveal action can still decrypt it.
			if (!created) void deleteStashedPrivateKey(id);
		} finally {
			isSubmitting = false;
		}
	}

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
		if (id) void deleteStashedPrivateKey(id);
	}
</script>

<Tooltip.Root>
	<Dialog.Root
		bind:open
		onOpenChangeComplete={(isOpen) => {
			if (isOpen) return;
			name = '';
			errorMessage = '';
		}}
	>
		<Tooltip.Trigger>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="icon">
						<PlusIcon />
					</Button>
				{/snippet}
			</Dialog.Trigger>
		</Tooltip.Trigger>
		<Dialog.Content
			class="max-h-[95vh] min-w-[24vw] overflow-auto"
			onInteractOutside={(e) => e.preventDefault()}
		>
			<Dialog.Header>
				<Dialog.Title class="text-xl font-bold">{m.api_key_create()}</Dialog.Title>
				<Dialog.Description>{m.api_key_create_description()}</Dialog.Description>
			</Dialog.Header>

			<div class="flex flex-col gap-2">
				<Label for="api-key-name">{m.api_key_name()}</Label>
				<Input
					id="api-key-name"
					bind:value={name}
					placeholder="my-key"
					autocomplete="off"
					spellcheck="false"
					disabled={isSubmitting}
					onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && submit()}
				/>
				{#if nameHint}
					<p class="text-sm text-destructive">{nameHint}</p>
				{:else}
					<p class="text-sm text-muted-foreground">{m.api_key_name_rule()}</p>
				{/if}
			</div>

			{#if errorMessage}
				<p class="text-sm text-destructive">{errorMessage}</p>
			{/if}

			<Dialog.Footer>
				<Button variant="outline" disabled={isSubmitting} onclick={() => (open = false)}>
					{m.cancel()}
				</Button>
				<Button disabled={!nameValid || isSubmitting} onclick={submit}>
					{#if isSubmitting}
						<Spinner class="size-4" />
						{m.api_key_waiting()}
					{:else}
						{m.api_key_create()}
					{/if}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
	<Tooltip.Content>{m.api_key_create()}</Tooltip.Content>
</Tooltip.Root>

<RevealKeyDialog
	bind:open={reveal.open}
	name={reveal.name}
	clientId={reveal.clientId}
	plainKey={reveal.plainKey}
	onClosed={onRevealClosed}
/>
