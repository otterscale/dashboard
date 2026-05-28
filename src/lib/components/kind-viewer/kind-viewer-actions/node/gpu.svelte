<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1Node } from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		object
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		object: CoreV1Node;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const isPassthroughOn = $derived(
		object?.metadata?.labels?.['nvidia.com/gpu.workload.config'] === 'vm-passthrough'
	);
	const isVirtualOn = $derived(
		object?.metadata?.labels?.['otterscale.io/gpu'] === 'true' &&
			!lodash.get(object?.metadata?.labels, 'nvidia.com/gpu.workload.config')
	);

	function buildNodeManifest(labels: Record<string, string>) {
		const manifest = lodash.cloneDeep(object) as CoreV1Node & {
			apiVersion?: string;
			kind?: string;
			status?: unknown;
		};
		manifest.apiVersion = group ? `${group}/${version}` : version;
		manifest.kind = kind;
		manifest.metadata = {
			...(manifest.metadata ?? {}),
			name: object.metadata?.name,
			labels: {
				...(object.metadata?.labels ?? {}),
				...labels
			}
		};
		delete manifest.status;
		return JSON.stringify(manifest);
	}

	let isSubmitting = $state(false);
</script>

<DropdownMenu.Item
	disabled={isVirtualOn}
	onclick={() => {
		if (isSubmitting) return;

		isSubmitting = true;

		const name = object?.metadata?.name;

		toast.promise(
			async () => {
				const value = buildNodeManifest({
					'otterscale.io/gpu': 'true',
					'nvidia.com/gpu.workload.config': ''
				});

				const manifest = new TextEncoder().encode(value);

				await resourceClient.update({
					cluster,
					name,
					group,
					version,
					resource,
					manifest,
					fieldManager: 'otterscale-web-ui'
				});
			},
			{
				loading: `Updating ${kind} ${name}...`,
				success: () => {
					return `Successfully updated ${kind} ${name}`;
				},
				error: (error) => {
					console.error(`Failed to update ${kind} ${name}:`, error);
					return `Failed to update ${kind} ${name}: ${(error as ConnectError).message}`;
				},
				finally() {
					isSubmitting = false;
				}
			}
		);
	}}
>
	Virtual GPU
</DropdownMenu.Item>
<DropdownMenu.Item
	disabled={isPassthroughOn}
	onclick={() => {
		if (isSubmitting) return;

		isSubmitting = true;

		const name = object?.metadata?.name;

		toast.promise(
			async () => {
				const value = buildNodeManifest({
					'otterscale.io/gpu': '',
					'nvidia.com/gpu.workload.config': 'vm-passthrough'
				});

				const manifest = new TextEncoder().encode(value);

				await resourceClient.update({
					cluster,
					name,
					group,
					version,
					resource,
					manifest,
					fieldManager: 'otterscale-web-ui'
				});
			},
			{
				loading: `Updating ${kind} ${name}...`,
				success: () => {
					return `Successfully updated ${kind} ${name}`;
				},
				error: (error) => {
					console.error(`Failed to update ${kind} ${name}:`, error);
					return `Failed to update ${kind} ${name}: ${(error as ConnectError).message}`;
				},
				finally() {
					isSubmitting = false;
				}
			}
		);
	}}
>
	VM Passthrough
</DropdownMenu.Item>
