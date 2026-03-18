<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ScrollTextIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

	import LogViewer from '../default/log-viewer.svelte';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const namespace: string = $derived(object?.metadata?.namespace ?? '');
	const jobName: string = $derived(object?.metadata?.name ?? '');
	const containers: string[] = $derived(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(object?.spec?.template?.spec?.containers as any[])?.map(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(c: any) => c.name as string
		) ?? []
	);

	let open = $state(false);
	let associatedPods = $state<string[]>([]);
	let selectedPod = $state('');

	async function fetchAssociatedPods() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: '',
				version: 'v1',
				resource: 'pods',
				labelSelector: `job-name=${jobName}`
			});
			associatedPods = response.items
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((item) => (item.object as any)?.metadata?.name as string)
				.filter(Boolean);
			if (associatedPods.length > 0 && !associatedPods.includes(selectedPod)) {
				selectedPod = associatedPods[0];
			}
		} catch {
			associatedPods = [];
		}
	}

	async function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			await fetchAssociatedPods();
		}
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<ScrollTextIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>Logs</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content class="flex h-fit max-h-[80vh] max-w-[70vw] min-w-[55vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>Pod Logs — {selectedPod || jobName}</Dialog.Title>
			<Dialog.Description
				>Streaming logs from namespace <strong>{namespace}</strong></Dialog.Description
			>
		</Dialog.Header>
		<LogViewer {cluster} {namespace} podName={selectedPod} {containers} active={open}>
			{#snippet extraControls({ restart })}
				{#if associatedPods.length > 0}
					<Select
						type="single"
						value={selectedPod}
						onValueChange={(value) => {
							selectedPod = value;
							if (open) restart();
						}}
					>
						<SelectTrigger class="w-64 max-w-64 min-w-0">
							<span class="truncate">{selectedPod || 'Select pod'}</span>
						</SelectTrigger>
						<SelectContent class="w-64 max-w-64">
							{#each associatedPods as p (p)}
								<SelectItem value={p}>{p}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				{/if}
			{/snippet}
		</LogViewer>
	</Dialog.Content>
</Dialog.Root>
