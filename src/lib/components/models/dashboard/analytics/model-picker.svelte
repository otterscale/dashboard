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
	import { getContext } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { get, writable } from 'svelte/store';

	import * as defaults from '$lib/components/dynamic-form/defaults';
	import ComboboxWidget, {
		type ComboboxEnumeration
	} from '$lib/components/dynamic-form/widgets/combobox.svelte';
	import { m } from '$lib/paraglide/messages';

	let {
		cluster,
		namespace,
		selectedModel = $bindable()
	}: {
		cluster: string | undefined;
		namespace: string | undefined;
		selectedModel: string | undefined;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	type ModelOption = { value: string; label: string };
	const modelOptions = writable<ModelOption[]>([]);

	function nameFromResourceItem(item: { object?: unknown }): string {
		const obj = item.object as Record<string, unknown> | undefined;
		const meta = obj?.metadata as Record<string, unknown> | undefined;
		const name = meta?.name;
		return typeof name === 'string' ? name : '';
	}

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
				): Promise<ComboboxEnumeration[]> => get(modelOptions) as ComboboxEnumeration[],
				TailoredComboboxVisibility: 50,
				TailoredComboboxEmptyText: m.no_result(),
				TailoredComboboxInput: { placeholder: '' },
				TailoredComboboxPopoverClass: 'w-full min-w-[200px] max-w-md'
			}
		},
		required: false
	});

	/** Re-fetch when cluster or workspace (namespace) changes — not only on first mount. */
	$effect(() => {
		const clusterId = (cluster ?? '').trim();
		const ns = (namespace ?? '').trim();
		let cancelled = false;

		(async () => {
			isLoaded = false;
			const modelNames = new SvelteSet<string>();

			if (clusterId) {
				try {
					const response = await resourceClient.list({
						cluster: clusterId,
						group: 'model.otterscale.io',
						version: 'v1alpha1',
						resource: 'modelservices',
						namespace: ns
					});
					for (const item of response.items) {
						const name = nameFromResourceItem(item);
						if (name) modelNames.add(name);
					}
				} catch (error) {
					console.error('Failed to list ModelServices for analytics picker:', error);
				}
			}

			if (cancelled) return;

			const models: ModelOption[] = [...modelNames]
				.sort((a, b) => a.localeCompare(b))
				.map((name) => ({
					value: name,
					label: name.length > 40 ? name.slice(0, 37) + '...' : name
				}));

			const options = models.length > 0 ? [{ value: '.*', label: m.all_models() }, ...models] : [];
			modelOptions.set(options);
			selectedModel = models.length > 0 ? options[0]!.value : '.*';
			isLoaded = true;
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

{#if isLoaded && $modelOptions.length > 0}
	<ComboboxWidget
		type="widget"
		bind:value={selectedModel}
		{config}
		handlers={{}}
		options={[]}
		errors={[]}
		uiOption={(() => undefined) as UiOption}
	/>
{/if}
