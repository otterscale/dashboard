<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import Icon from '@iconify/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onMount } from 'svelte';
	import { writable } from 'svelte/store';

	import { Single as SingleSelect } from '$lib/components/custom/select';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils';

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

	type ModelOption = { value: string; label: string; icon: string };
	const modelOptions = writable<ModelOption[]>([]);

	function nameFromResourceItem(item: { object?: unknown }): string {
		const obj = item.object as Record<string, unknown> | undefined;
		const meta = obj?.metadata as Record<string, unknown> | undefined;
		const name = meta?.name;
		return typeof name === 'string' ? name : '';
	}

	let isLoaded = $state(false);
	onMount(async () => {
		const modelNames = new Set<string>();
		const ns = (namespace ?? '').trim();
		const clusterId = (cluster ?? '').trim();

		if (clusterId && ns) {
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

		const models: ModelOption[] = [...modelNames]
			.sort((a, b) => a.localeCompare(b))
			.map((name) => ({
				value: name,
				label: name.length > 40 ? name.slice(0, 37) + '...' : name,
				icon: 'ph:robot'
			}));

		const options =
			models.length > 0
				? [{ value: '.*', label: m.all_models(), icon: 'ph:robot-duotone' }, ...models]
				: [{ value: '.*', label: m.all_models(), icon: 'ph:robot-duotone' }];
		modelOptions.set(options);
		selectedModel = options[0]?.value ?? '.*';
		isLoaded = true;
	});
</script>

{#if isLoaded}
	<SingleSelect.Root options={modelOptions} bind:value={selectedModel}>
		<SingleSelect.Trigger />
		<SingleSelect.Content>
			<SingleSelect.Options>
				<SingleSelect.Input />
				<SingleSelect.List>
					<SingleSelect.Empty>{m.no_result()}</SingleSelect.Empty>
					<SingleSelect.Group>
						{#each $modelOptions as option (option.value)}
							<SingleSelect.Item {option}>
								<Icon
									icon={option.icon ? option.icon : 'ph:empty'}
									class={cn('size-5', option.icon ? 'visible' : 'invisible')}
								/>
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
