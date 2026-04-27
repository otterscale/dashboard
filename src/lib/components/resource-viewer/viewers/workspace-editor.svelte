<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';

	import Update from '$lib/components/kind-viewer/kind-viewer-actions/workspace/update.svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		role,
		cluster,
		group,
		version,
		kind,
		resource,
		schema,
		object,
		onsuccess
	}: {
		role: string;
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
			<Update {role} {cluster} {group} {version} {kind} {resource} {schema} {object} {onsuccess}>
				{#snippet trigger(props)}
					<Button
						{...tooltipProps}
						{...props}
						variant="outline"
						size="icon-lg"
						disabled={role === 'view'}
					>
						<Pencil />
					</Button>
				{/snippet}
			</Update>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>Edit Resource</Tooltip.Content>
</Tooltip.Root>
