<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import FileJsonIcon from '@lucide/svelte/icons/file-json';
	import FileSearchIcon from '@lucide/svelte/icons/file-search';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, type Snippet } from 'svelte';

	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import { ACTION_DIALOG_CONTENT_CLASS } from './constants';
	import { formatDescribe } from './describe-formatter';

	let {
		cluster,
		namespace,
		group,
		version,
		resource,
		object,
		onOpenChangeComplete,
		trigger
	}: {
		cluster: string;
		namespace?: string;
		group: string;
		version: string;
		resource: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
		trigger?: Snippet;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	const name: string = $derived(object?.metadata?.name ?? '');

	let open = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let describeText = $state<string>('');
	let jsonText = $state<string>('');
	let mode = $state('describe');

	async function fetchDescribe() {
		isLoading = true;
		error = null;
		describeText = '';
		jsonText = '';

		try {
			const response = await client.describe({
				cluster,
				group,
				version,
				resource,
				namespace,
				name
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const obj = (response.resource?.object as Record<string, any>) ?? {};
			const events = (response.events ?? []).map((e) => e.object ?? e);
			describeText = formatDescribe(obj, events);

			// response.resource and response.events are either plain objects or protobuf generated structures, JSON.stringify can handle them
			jsonText = JSON.stringify(
				{ resource: obj, events: events },
				(key, value) => (typeof value === 'bigint' ? value.toString() : value),
				2
			);
		} catch (err) {
			console.error(`Failed to describe ${name}:`, err);
			error = (err as ConnectError).message;
		} finally {
			isLoading = false;
		}
	}

	let copied = $state(false);

	async function copyContent() {
		const text = mode === 'json' ? jsonText : describeText;
		if (!text) return;
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			fetchDescribe();
		}
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	{#if trigger}
		{@render trigger()}
	{:else}
		<Dialog.Trigger class="w-full">
			<Item.Root class="p-0 text-xs" size="sm">
				<Item.Media>
					<FileSearchIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Describe</Item.Title>
				</Item.Content>
			</Item.Root>
		</Dialog.Trigger>
	{/if}
	<Dialog.Content class={ACTION_DIALOG_CONTENT_CLASS}>
		<Dialog.Header>
			<div class="flex items-end justify-between gap-4">
				<div class="flex flex-col gap-1.5 text-left">
					<Dialog.Title class="text-lg font-bold">Describe — {name}</Dialog.Title>
					<Dialog.Description>
						{#if namespace}
							Resource details and events in namespace <strong>{namespace}</strong>
						{:else}
							Resource details and events
						{/if}
					</Dialog.Description>
				</div>
				<!-- -mr-2 lines the icon column up with the dialog's close button (right-4 vs p-6). -->
				<div class="-mr-2 flex shrink-0 items-center gap-1">
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									disabled={mode === 'describe'}
									onclick={() => (mode = 'describe')}
									aria-label="Describe view"
								>
									<FileSearchIcon />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Describe view</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									disabled={mode === 'json'}
									onclick={() => (mode = 'json')}
									aria-label="JSON view"
								>
									<FileJsonIcon />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>JSON view</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									disabled={isLoading || !!error}
									onclick={copyContent}
									aria-label="Copy to clipboard"
								>
									{#if copied}
										<CheckIcon />
									{:else}
										<CopyIcon />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{copied ? 'Copied!' : 'Copy to clipboard'}</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</div>
		</Dialog.Header>

		<Tabs.Root bind:value={mode} class="flex min-h-0 flex-1 flex-col gap-3">
			{#if isLoading}
				<div class="min-h-0 flex-1 rounded-md border bg-muted">
					<Empty.Root class="h-full">
						<Empty.Header>
							<Empty.Media variant="icon">
								<Spinner />
							</Empty.Media>
							<Empty.Title>Loading resource details</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				</div>
			{:else if error}
				<Alert.Root variant="destructive">
					<CircleAlertIcon />
					<Alert.Title>Failed to describe {name}</Alert.Title>
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{:else}
				<Tabs.Content value="describe" class="mt-0 min-h-0 flex-1 outline-none">
					<pre
						class="h-full w-full overflow-auto rounded-md border bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre text-foreground">{describeText}</pre>
				</Tabs.Content>
				<Tabs.Content value="json" class="mt-0 min-h-0 flex-1 outline-none">
					<pre
						class="h-full w-full overflow-auto rounded-md border bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre text-foreground">{jsonText}</pre>
				</Tabs.Content>
			{/if}
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
