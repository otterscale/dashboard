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
	const cronJobName: string = $derived(object?.metadata?.name ?? '');
	const cronJobUid: string = $derived(object?.metadata?.uid ?? '');
	const containers: string[] = $derived(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(object?.spec?.jobTemplate?.spec?.template?.spec?.containers as any[])?.map(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(c: any) => c.name as string
		) ?? []
	);

	let open = $state(false);
	let associatedJobs = $state<string[]>([]);
	let selectedJob = $state('');
	let associatedPods = $state<string[]>([]);
	let selectedPod = $state('');

	async function fetchAssociatedJobs() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'batch',
				version: 'v1',
				resource: 'jobs'
			});
			// Filter Jobs owned by this CronJob via ownerReferences
			associatedJobs = response.items
				.filter((item) => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const owners = (item.object as any)?.metadata?.ownerReferences as any[];
					return owners?.some((ref) => ref.kind === 'CronJob' && ref.uid === cronJobUid);
				})
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((item) => (item.object as any)?.metadata?.name as string)
				.filter(Boolean);

			if (associatedJobs.length > 0 && !associatedJobs.includes(selectedJob)) {
				// Default to the most recent Job (last in list)
				selectedJob = associatedJobs[associatedJobs.length - 1];
			}
		} catch {
			associatedJobs = [];
		}
	}

	async function fetchAssociatedPods(jobName: string) {
		if (!jobName) {
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
			await fetchAssociatedJobs();
			if (selectedJob) {
				await fetchAssociatedPods(selectedJob);
			}
		}
	}

	async function handleJobChange(jobName: string) {
		selectedJob = jobName;
		selectedPod = '';
		associatedPods = [];
		await fetchAssociatedPods(jobName);
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
			<Dialog.Title>Pod Logs — {selectedPod || cronJobName}</Dialog.Title>
			<Dialog.Description
				>Streaming logs from namespace <strong>{namespace}</strong></Dialog.Description
			>
		</Dialog.Header>
		<LogViewer {cluster} {namespace} podName={selectedPod} {containers} active={open}>
			{#snippet extraControls({ restart })}
				{#if associatedJobs.length > 0}
					<Select
						type="single"
						value={selectedJob}
						onValueChange={async (value) => {
							await handleJobChange(value);
							if (open) restart();
						}}
					>
						<SelectTrigger class="w-56 max-w-64 min-w-0">
							<span class="truncate">{selectedJob || 'Select job'}</span>
						</SelectTrigger>
						<SelectContent class="w-56 max-w-64">
							{#each associatedJobs as j (j)}
								<SelectItem value={j}>{j}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				{/if}
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
