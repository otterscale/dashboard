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
		resource,
		object
	}: {
		cluster: string;
		group: string;
		version: string;
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

	const kind = 'Node';
	const apiVersion = `${group}/${version}`;
	const name = $derived(lodash.get(object, 'metadata.name') as string);

	let isSubmitting = $state(false);
</script>

<DropdownMenu.Item
	disabled={isVirtualOn}
	onclick={() => {
		if (isSubmitting) return;

		isSubmitting = true;

		toast.promise(
			async () => {
				const value = JSON.stringify({
					apiVersion,
					kind,
					metadata: {
						name,
						labels: {
							'otterscale.io/gpu': 'true',
							'nvidia.com/gpu.workload.config': null
						}
					}
				});

				const manifest = new TextEncoder().encode(value);

				await resourceClient.apply({
					cluster,
					name,
					group,
					version,
					resource,
					manifest,
					fieldManager: 'otterscale-web-ui',
					force: true
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

		toast.promise(
			async () => {
				const value = JSON.stringify({
					apiVersion,
					kind,
					metadata: {
						name,
						labels: {
							'otterscale.io/gpu': null,
							'nvidia.com/gpu.workload.config': 'vm-passthrough'
						}
					}
				});

				const manifest = new TextEncoder().encode(value);

				await resourceClient.apply({
					cluster,
					name,
					group,
					version,
					resource,
					manifest,
					fieldManager: 'otterscale-web-ui',
					force: true
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
