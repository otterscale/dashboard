<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, type Snippet } from 'svelte';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

	import LogViewer from './log-viewer.svelte';

	let {
		cluster,
		object,
		kind,
		onOpenChangeComplete,
		trigger
	}: {
		cluster: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		kind: string;
		onOpenChangeComplete?: () => void;
		trigger?: Snippet;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const namespace: string = $derived(object?.metadata?.namespace ?? '');
	const name: string = $derived(object?.metadata?.name ?? '');
	const uid: string = $derived(object?.metadata?.uid ?? '');
	const matchLabels: Record<string, string> = $derived(object?.spec?.selector?.matchLabels ?? {});

	const containers: string[] = $derived(extractContainers(object, kind));

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function extractContainers(obj: any, k: string): string[] {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let specs: any[] | undefined;
		if (k === 'Pod') {
			specs = obj?.spec?.containers;
		} else if (k === 'CronJob') {
			specs = obj?.spec?.jobTemplate?.spec?.template?.spec?.containers;
		} else {
			specs = obj?.spec?.template?.spec?.containers;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return specs?.map((c: any) => c.name as string) ?? [];
	}

	let open = $state(false);
	let associatedJobs = $state<string[]>([]);
	let selectedJob = $state('');
	let associatedPods = $state<string[]>([]);
	let selectedPod = $state('');

	const effectivePodName: string = $derived(kind === 'Pod' ? name : selectedPod);

	function toLabelSelector(labels: Record<string, string>): string {
		return Object.entries(labels)
			.map(([k, v]) => `${k}=${v}`)
			.join(',');
	}

	async function fetchAssociatedJobs() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'batch',
				version: 'v1',
				resource: 'jobs'
			});
			associatedJobs = response.items
				.filter((item) => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const owners = (item.object as any)?.metadata?.ownerReferences as any[];
					return owners?.some((ref) => ref.kind === 'CronJob' && ref.uid === uid);
				})
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.map((item) => (item.object as any)?.metadata?.name as string)
				.filter(Boolean);

			if (associatedJobs.length > 0 && !associatedJobs.includes(selectedJob)) {
				selectedJob = associatedJobs[associatedJobs.length - 1];
			}
		} catch (e) {
			console.error('Failed to fetch associated jobs:', e);
			associatedJobs = [];
		}
	}

	async function fetchPodsByJobName(jobName: string) {
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
		} catch (error) {
			console.error('Failed to fetch pods for job', jobName, error);
			associatedPods = [];
		}
	}

	async function fetchPodsByOwnership() {
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
				const rsResponse = await resourceClient.list({
					cluster,
					namespace,
					group: 'apps',
					version: 'v1',
					resource: 'replicasets',
					labelSelector: selector
				});
				ownerUids = new Set(
					rsResponse.items
						.filter((item) => {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							const owners = (item.object as any)?.metadata?.ownerReferences as any[];
							return owners?.some((ref) => ref.kind === 'Deployment' && ref.uid === uid);
						})
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						.map((item) => (item.object as any)?.metadata?.uid as string)
						.filter(Boolean)
				);
			} else {
				ownerUids = new Set([uid]);
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
		} catch (error) {
			console.error('Failed to fetch associated pods:', error);
			associatedPods = [];
		}
	}

	async function handleOpenChange(isOpen: boolean) {
		if (!isOpen || kind === 'Pod') return;

		if (kind === 'CronJob') {
			await fetchAssociatedJobs();
			if (selectedJob) {
				await fetchPodsByJobName(selectedJob);
			}
		} else if (kind === 'Job') {
			await fetchPodsByJobName(name);
		} else {
			await fetchPodsByOwnership();
		}
	}

	async function handleJobChange(jobName: string) {
		selectedJob = jobName;
		selectedPod = '';
		associatedPods = [];
		await fetchPodsByJobName(jobName);
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	{#if trigger}
		{@render trigger()}
	{:else}
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
	{/if}
	<Dialog.Content class="flex h-fit max-h-[80vh] max-w-[70vw] min-w-[55vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>Pod Logs — {effectivePodName || name}</Dialog.Title>
			<Dialog.Description
				>Streaming logs from namespace <strong>{namespace}</strong></Dialog.Description
			>
		</Dialog.Header>
		<LogViewer {cluster} {namespace} podName={effectivePodName} {containers} active={open}>
			{#snippet extraControls({ restart })}
				{#if kind === 'CronJob' && associatedJobs.length > 0}
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
				{#if kind !== 'Pod' && associatedPods.length > 0}
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
