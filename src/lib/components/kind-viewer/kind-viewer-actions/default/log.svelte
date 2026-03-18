<script lang="ts">
	import { ScrollTextIcon } from '@lucide/svelte';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	import LogViewer from './log-viewer.svelte';

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

	const namespace: string = $derived(object?.metadata?.namespace ?? '');
	const podName: string = $derived(object?.metadata?.name ?? '');
	const containers: string[] = $derived(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(object?.spec?.containers as any[])?.map((c: any) => c.name as string) ?? []
	);

	let open = $state(false);
</script>

<Dialog.Root bind:open {onOpenChangeComplete}>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<ScrollTextIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>Logs</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content class="flex h-fit max-h-[80vh] max-w-[70vw] min-w-[55vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>Pod Logs — {podName}</Dialog.Title>
			<Dialog.Description
				>Streaming logs from namespace <strong>{namespace}</strong></Dialog.Description
			>
		</Dialog.Header>
		<LogViewer {cluster} {namespace} {podName} {containers} active={open} />
	</Dialog.Content>
</Dialog.Root>
