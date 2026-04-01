<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import {
		createForm,
		setFormContext,
		type Config,
		type FieldPath,
		type Schema,
		type UiOption
	} from '@sjsf/form';
	import { getContext, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { get, writable } from 'svelte/store';

	import * as defaults from '$lib/components/dynamic-form/defaults';
	import ComboboxWidget, {
		type ComboboxEnumeration
	} from '$lib/components/dynamic-form/widgets/combobox.svelte';
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

	const schema: Schema = {
		type: 'object',
		properties: {
			picker: { type: 'string', title: ' ' }
		}
	};

	const form = createForm<{ picker: string | undefined }>({
		...defaults,
		schema,
		initialValue: { picker: undefined }
	});
	setFormContext(form);

	const pickerPath = ['picker'] as unknown as FieldPath;

	const config: Config = $derived({
		path: pickerPath,
		title: ' ',
		schema: { type: 'string' },
		uiSchema: {
			'ui:options': {
				TailoredComboboxEnumerations: async (
					_filter: string
				): Promise<ComboboxEnumeration[]> => get(workspaceOptions) as ComboboxEnumeration[],
				TailoredComboboxVisibility: 50,
				TailoredComboboxEmptyText: m.no_result(),
				TailoredComboboxInput: { placeholder: '' },
				TailoredComboboxPopoverClass: 'w-full min-w-[200px] max-w-md'
			}
		},
		required: false
	});

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
	<ComboboxWidget
		type="widget"
		bind:value={namespace}
		{config}
		handlers={{}}
		options={[]}
		errors={[]}
		uiOption={(() => undefined) as UiOption}
	/>
{/if}
