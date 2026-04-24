<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';

	import Update from '$lib/components/kind-viewer/kind-viewer-actions/workspace/update.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { role } from '$lib/stores';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		schema,
		object,
		onsuccess
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: any;
		object?: any;
		onsuccess?: () => void;
	} = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props: tooltipProps })}
			<Update {cluster} {group} {version} {kind} {resource} {schema} {object} {onsuccess}>
				{#snippet trigger(props)}
					<button
						{...tooltipProps}
						{...props}
						disabled={$role === 'view'}
						class={buttonVariants({ variant: 'outline', size: 'icon-lg' })}
					>
						<Pencil />
					</button>
				{/snippet}
			</Update>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>Edit Resource</Tooltip.Content>
</Tooltip.Root>
