<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ScrollTextIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

	import LogViewer from './log-viewer.svelte';

	let {
		cluster,
		object,
		kind,
		onOpenChangeComplete
	}: {
		cluster: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		kind: string;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const namespace: string = $derived(object?.metadata?.namespace ?? '');
	const workloadName: string = $derived(object?.metadata?.name ?? '');
	const workloadUid: string = $derived(object?.metadata?.uid ?? '');
	const matchLabels: Record<string, string> = $derived(object?.spec?.selector?.matchLabels ?? {});
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

	function toLabelSelector(labels: Record<string, string>): string {
		return Object.entries(labels)
			.map(([k, v]) => `${k}=${v}`)
			.join(',');
	}

	async function fetchAssociatedPods() {
		const selector = toLabelSelector(matchLabels);
		if (!selector) {
			associatedPods = [];
			return;
		}

		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: '',
				version: 'v1',
				resource: 'pods',
				labelSelector: selector
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const allPods = response.items.map((item) => item.object as any);

			let ownerUids: Set<string>;

			if (kind === 'Deployment') {
				// Deployment → ReplicaSet → Pod: find RS owned by this Deployment first
				const rsResponse = await resourceClient.list({
					cluster,
					namespace,
					group: 'apps',
					version: 'v1',
					resource: 'replicasets'
				});
				ownerUids = new Set(
					rsResponse.items
						.filter((item) => {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							const owners = (item.object as any)?.metadata?.ownerReferences as any[];
							return owners?.some((ref) => ref.kind === 'Deployment' && ref.uid === workloadUid);
						})
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						.map((item) => (item.object as any)?.metadata?.uid as string)
						.filter(Boolean)
				);
			} else {
				// StatefulSet / DaemonSet: pods are directly owned
				ownerUids = new Set([workloadUid]);
			}

			associatedPods = allPods
				.filter((pod) => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const owners = pod?.metadata?.ownerReferences as any[];
					return owners?.some((ref) => ownerUids.has(ref.uid));
				})
				.map((pod) => pod?.metadata?.name as string)
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
			<Dialog.Title>Pod Logs — {selectedPod || workloadName}</Dialog.Title>
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
