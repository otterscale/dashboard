<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onMount } from 'svelte';

	import * as Select from '$lib/components/ui/select';
	import { m } from '$lib/messages';

	// Usage's Workspace choice. An admin picks one Workspace or all of them; a member sees their
	// own, fixed. The value is the Workspace's namespace, the label its name.
	let {
		cluster,
		namespace = $bindable(),
		fixed
	}: {
		cluster: string;
		/** '' for all Workspaces. */
		namespace: string;
		/** A member's own Workspace name: shown, not choosable. */
		fixed?: string;
	} = $props();

	const transport: Transport = getContext('transport');
	let options = $state<{ value: string; label: string }[]>([]);

	onMount(() => {
		if (fixed) return;
		createClient(ResourceService, transport)
			.list({
				cluster,
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				namespace: ''
			})
			.then((response) => {
				const list: { value: string; label: string }[] = [];
				for (const item of response.items) {
					const obj = item.object as {
						metadata?: { name?: string };
						spec?: { namespace?: string };
					};
					const name = obj?.metadata?.name;
					const ns = obj?.spec?.namespace;
					if (name && ns) list.push({ value: ns, label: name });
				}
				options = list.sort((a, b) => a.label.localeCompare(b.label));
			})
			.catch((error) => console.warn('Usage: failed to list Workspaces:', error));
	});

	const label = $derived(
		fixed ??
			(namespace
				? (options.find((o) => o.value === namespace)?.label ?? namespace)
				: m.usage_all_workspaces())
	);
	const trigger =
		'inline-flex h-9 max-w-[14rem] items-center gap-2 rounded-full border bg-background px-3.5 text-sm font-medium shadow-xs dark:border-input dark:bg-input/30';
</script>

{#if fixed}
	<span class="{trigger} text-foreground" title={m.usage_workspace_filter()}>
		<LayoutGridIcon class="size-4 shrink-0 text-muted-foreground" />
		<span class="truncate">{label}</span>
	</span>
{:else}
	<Select.Root type="single" bind:value={namespace}>
		<Select.Trigger
			class="{trigger} data-[size=default]:h-9"
			aria-label={m.usage_workspace_filter()}
		>
			<LayoutGridIcon class="size-4 shrink-0 text-muted-foreground" />
			<span class="truncate">{label}</span>
		</Select.Trigger>
		<Select.Content align="end">
			<Select.Item value="" label={m.usage_all_workspaces()} />
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label} />
			{/each}
		</Select.Content>
	</Select.Root>
{/if}
