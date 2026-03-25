<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { Box, Globe } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { writable } from 'svelte/store';

	import { Single as SingleSelect } from '$lib/components/custom/select';
	import { m } from '$lib/paraglide/messages';

	let {
		cluster,
		currentWorkspace = '',
		namespace = $bindable(),
		isClusterAdmin = false
	}: {
		cluster: string;
		/** Name of the currently active workspace (used as default selection) */
		currentWorkspace?: string;
		/** Bindable: resolved namespace for Prometheus/API filters; '' = all namespaces */
		namespace: string | undefined;
		isClusterAdmin?: boolean;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// value = namespace (for filtering), label = workspace name (shown in UI)
	type WorkspaceOption = { value: string; label: string };
	const workspaceOptions = writable<WorkspaceOption[]>([]);

	let isLoaded = $state(false);

	onMount(async () => {
		if (!isClusterAdmin) {
			isLoaded = true;
			return;
		}

		const nameToNs = new SvelteMap<string, string>();
		try {
			const response = await resourceClient.list({
				cluster,
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				namespace: ''
			});
			for (const item of response.items) {
				const obj = item.object as Record<string, unknown> | undefined;
				const meta = obj?.metadata as Record<string, unknown> | undefined;
				const spec = obj?.spec as Record<string, unknown> | undefined;
				const name = meta?.name;
				const ns = spec?.namespace;
				if (typeof name === 'string' && typeof ns === 'string' && name && ns) {
					nameToNs.set(name, ns);
				}
			}
		} catch (error) {
			console.error('Failed to list workspaces:', error);
		}

		const sorted = [...nameToNs.keys()].sort((a, b) => a.localeCompare(b));
		const options: WorkspaceOption[] = [
			{ value: '', label: m.all_namespaces() },
			...sorted.map((name) => ({
				value: nameToNs.get(name)!,
				label: name
			}))
		];
		workspaceOptions.set(options);

		// Default to current workspace's namespace; fall back to "all"
		namespace = currentWorkspace ? (nameToNs.get(currentWorkspace) ?? '') : '';

		isLoaded = true;
	});
</script>

{#if isClusterAdmin && isLoaded && $workspaceOptions.length > 0}
	<SingleSelect.Root options={workspaceOptions} bind:value={namespace}>
		<SingleSelect.Trigger />
		<SingleSelect.Content>
			<SingleSelect.Options>
				<SingleSelect.Input />
				<SingleSelect.List>
					<SingleSelect.Empty>{m.no_result()}</SingleSelect.Empty>
					<SingleSelect.Group>
						{#each $workspaceOptions as option (option.value + option.label)}
							<SingleSelect.Item {option}>
								{#if option.value === ''}
									<Globe class="size-5" />
								{:else}
									<Box class="size-5" />
								{/if}
								{option.label}
								<SingleSelect.Check {option} />
							</SingleSelect.Item>
						{/each}
					</SingleSelect.Group>
				</SingleSelect.List>
			</SingleSelect.Options>
		</SingleSelect.Content>
	</SingleSelect.Root>
{/if}
