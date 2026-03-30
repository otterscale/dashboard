<script lang="ts">
	import MonitorIcon from '@lucide/svelte/icons/monitor';

	import DefaultVnc from '$lib/components/kind-viewer/kind-viewer-actions/default/vnc.svelte';
	import * as Item from '$lib/components/ui/item';

	import { canVnc } from './vm-status';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const printableStatus: string = $derived(object?.status?.printableStatus ?? '');
	const isActionAllowed = $derived(canVnc(printableStatus));
</script>

{#if isActionAllowed}
	<DefaultVnc {cluster} {object} {onOpenChangeComplete} />
{:else}
	<Item.Root class="pointer-events-none w-full p-0 text-xs opacity-50" size="sm">
		<Item.Media>
			<MonitorIcon />
		</Item.Media>
		<Item.Content>
			<Item.Title>VNC</Item.Title>
		</Item.Content>
	</Item.Root>
{/if}
