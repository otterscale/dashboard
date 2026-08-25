<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
	import lodash from 'lodash';
	import { getContext, onDestroy } from 'svelte';

	import * as Table from '$lib/components/ui/table/index.js';
	import { cn } from '$lib/utils';

	let {
		cluster,
		namespace,
		kind,
		name
	}: {
		cluster: string;
		namespace: string;
		kind: string;
		name: string;
	} = $props();

	type EventRow = {
		key: string;
		type: string;
		reason: string;
		message: string;
		count: number;
		lastSeen: string;
	};

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let events: EventRow[] = $state([]);
	let isLoading = $state(true);

	function toRow(object: JsonObject, index: number): EventRow {
		return {
			key: (lodash.get(object, 'metadata.uid') as string) ?? String(index),
			type: (lodash.get(object, 'type') as string) ?? 'Normal',
			reason: (lodash.get(object, 'reason') as string) ?? '—',
			message: (lodash.get(object, 'message') as string) ?? '—',
			count:
				(lodash.get(object, 'count') as number) ??
				(lodash.get(object, 'series.count') as number) ??
				1,
			lastSeen:
				(lodash.get(object, 'lastTimestamp') as string) ??
				(lodash.get(object, 'eventTime') as string) ??
				(lodash.get(object, 'metadata.creationTimestamp') as string) ??
				''
		};
	}

	// Kubernetes' own field selector, not a client-side filter: events for every other
	// object in the namespace never cross the wire.
	function buildFieldSelector(): string {
		const selectors = [`involvedObject.name=${name}`, `involvedObject.kind=${kind}`];
		if (namespace) selectors.push(`involvedObject.namespace=${namespace}`);
		return selectors.join(',');
	}

	let abortController: AbortController | null = null;
	async function fetchEvents() {
		abortController?.abort();
		const currentAbortController = new AbortController();
		abortController = currentAbortController;

		isLoading = true;
		try {
			const response = await resourceClient.list(
				{
					cluster,
					namespace,
					group: '',
					version: 'v1',
					resource: 'events',
					fieldSelector: buildFieldSelector()
				} as ListRequest,
				{ signal: currentAbortController.signal }
			);
			if (currentAbortController.signal.aborted) return;
			events = response.items
				.map((item, index) => toRow(item.object as JsonObject, index))
				.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
		} catch (e) {
			if (currentAbortController.signal.aborted) return;
			console.error('Failed to list events:', e);
			events = [];
		} finally {
			if (!currentAbortController.signal.aborted) isLoading = false;
		}
	}

	$effect(() => {
		void namespace;
		void kind;
		void name;
		fetchEvents();
	});

	onDestroy(() => abortController?.abort());

	function formatLastSeen(value: string): string {
		return value ? new Date(value).toLocaleString('sv-SE') : '—';
	}
</script>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Type</Table.Head>
			<Table.Head>Reason</Table.Head>
			<Table.Head>Message</Table.Head>
			<Table.Head class="text-right">Count</Table.Head>
			<Table.Head>Last Seen</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#if isLoading}
			<Table.Row>
				<Table.Cell colspan={5} class="text-center text-sm text-muted-foreground">
					Loading events…
				</Table.Cell>
			</Table.Row>
		{:else if events.length === 0}
			<Table.Row>
				<Table.Cell colspan={5} class="text-center text-sm text-muted-foreground">
					No events found.
				</Table.Cell>
			</Table.Row>
		{/if}
		{#each events as event (event.key)}
			<Table.Row>
				<Table.Cell class={cn('font-medium', event.type === 'Warning' && 'text-chart-1')}>
					{event.type}
				</Table.Cell>
				<Table.Cell class="text-muted-foreground">{event.reason}</Table.Cell>
				<Table.Cell class="max-w-md truncate" title={event.message}>{event.message}</Table.Cell>
				<Table.Cell class="text-right font-mono tabular-nums">{event.count}</Table.Cell>
				<Table.Cell class="whitespace-nowrap text-muted-foreground">
					{formatLastSeen(event.lastSeen)}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
