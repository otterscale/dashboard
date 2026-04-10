import { createClient, type Transport } from '@connectrpc/connect';
import { ResourceService } from '@otterscale/api/resource/v1';
import { SvelteSet } from 'svelte/reactivity';

interface PodResolverOptions {
	transport: Transport;
	cluster: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	object: any;
	kind: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractContainers(obj: any, kind: string): string[] {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let specs: any[] | undefined;
	if (kind === 'Pod') {
		specs = obj?.spec?.containers;
	} else if (kind === 'CronJob') {
		specs = obj?.spec?.jobTemplate?.spec?.template?.spec?.containers;
	} else {
		specs = obj?.spec?.template?.spec?.containers;
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return specs?.map((c: any) => c.name as string) ?? [];
}

function toLabelSelector(labels: Record<string, string>): string {
	return Object.entries(labels)
		.map(([k, v]) => `${k}=${v}`)
		.join(',');
}

export function createPodResolver(options: () => PodResolverOptions) {
	const namespace = $derived(options().object?.metadata?.namespace ?? '');
	const name = $derived(options().object?.metadata?.name ?? '');
	const uid = $derived(options().object?.metadata?.uid ?? '');
	const matchLabels: Record<string, string> = $derived(
		options().object?.spec?.selector?.matchLabels ?? {}
	);
	const containers: string[] = $derived(extractContainers(options().object, options().kind));

	let associatedJobs = $state<string[]>([]);
	let selectedJob = $state('');
	let associatedPods = $state<string[]>([]);
	let selectedPod = $state('');
	let selectedContainer = $state('');

	const effectivePodName = $derived(options().kind === 'Pod' ? name : selectedPod);

	$effect(() => {
		if (containers.length > 0 && !containers.includes(selectedContainer)) {
			selectedContainer = containers[0];
		}
	});

	function getClient() {
		return createClient(ResourceService, options().transport);
	}

	async function fetchAssociatedJobs() {
		const client = getClient();
		const { cluster } = options();
		try {
			const response = await client.list({
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
		const client = getClient();
		const { cluster } = options();
		try {
			const response = await client.list({
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

		const client = getClient();
		const { cluster, kind } = options();

		try {
			const response = await client.list({
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
				const rsResponse = await client.list({
					cluster,
					namespace,
					group: 'apps',
					version: 'v1',
					resource: 'replicasets',
					labelSelector: selector
				});
				ownerUids = new SvelteSet(
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
				ownerUids = new SvelteSet([uid]);
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

	async function handleJobChange(jobName: string) {
		selectedJob = jobName;
		selectedPod = '';
		associatedPods = [];
		await fetchPodsByJobName(jobName);
	}

	async function resolve() {
		const { kind } = options();
		if (kind === 'Pod') return;

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

	return {
		get namespace() {
			return namespace;
		},
		get name() {
			return name;
		},
		get containers() {
			return containers;
		},
		get effectivePodName() {
			return effectivePodName;
		},
		get associatedJobs() {
			return associatedJobs;
		},
		get selectedJob() {
			return selectedJob;
		},
		set selectedJob(v: string) {
			selectedJob = v;
		},
		get associatedPods() {
			return associatedPods;
		},
		get selectedPod() {
			return selectedPod;
		},
		set selectedPod(v: string) {
			selectedPod = v;
		},
		get selectedContainer() {
			return selectedContainer;
		},
		set selectedContainer(v: string) {
			selectedContainer = v;
		},
		handleJobChange,
		resolve
	};
}
