<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
	import { type ColumnDef } from '@tanstack/table-core';
	import lodash from 'lodash';
	import { getContext, onDestroy } from 'svelte';

	import * as Table from '$lib/components/ui/table/index.js';

	import RelatedInformationTable from '../related-information-table.svelte';
	import { formatTimestamp, getResourceURL } from '../utils';

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

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	type EventRow = {
		id: string;
		name: string;
		type: string;
		reason: string;
		message: string;
		count: number;
		lastSeen: string;
	};

	const columns: ColumnDef<EventRow>[] = [
		{ accessorKey: 'name' },
		{ accessorKey: 'type' },
		{ accessorKey: 'reason' },
		{ accessorKey: 'message' },
		{ accessorKey: 'count' },
		{ accessorKey: 'lastSeen' }
	];

	let events: EventRow[] = $state([]);

	function getEventResourceURL(event: EventRow): string {
		return getResourceURL({
			group: '',
			version: 'v1',
			kind: 'Event',
			resource: 'events',
			name: event.name,
			namespace
		});
	}

	function toEventRow(eventObject: JsonObject, index: number): EventRow {
		return {
			id: (lodash.get(eventObject, 'metadata.uid') as string) ?? String(index),
			name: (lodash.get(eventObject, 'metadata.name') as string) ?? '',
			type: (lodash.get(eventObject, 'type') as string) ?? 'Normal',
			reason: (lodash.get(eventObject, 'reason') as string) ?? '—',
			message: (lodash.get(eventObject, 'message') as string) ?? '—',
			count:
				(lodash.get(eventObject, 'count') as number) ??
				(lodash.get(eventObject, 'series.count') as number) ??
				1,
			lastSeen:
				(lodash.get(eventObject, 'lastTimestamp') as string) ??
				(lodash.get(eventObject, 'eventTime') as string) ??
				(lodash.get(eventObject, 'metadata.creationTimestamp') as string) ??
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

	let eventsAbortController: AbortController | null = null;
	async function fetchEvents() {
		eventsAbortController?.abort();
		const currentAbortController = new AbortController();
		eventsAbortController = currentAbortController;

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
				.map((item, index) => toEventRow(item.object as JsonObject, index))
				.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
		} catch (e) {
			if (currentAbortController.signal.aborted) return;
			console.error('Failed to list events:', e);
			events = [];
		}
	}

	$effect(() => {
		void cluster;
		void namespace;
		void kind;
		void name;
		fetchEvents();
	});

	onDestroy(() => {
		eventsAbortController?.abort();
	});
</script>

<RelatedInformationTable data={events} {columns}>
	{#snippet header()}
		<Table.Row>
			<Table.Head>Name</Table.Head>
			<Table.Head>Type</Table.Head>
			<Table.Head>Reason</Table.Head>
			<Table.Head>Message</Table.Head>
			<Table.Head>Count</Table.Head>
			<Table.Head>Last Seen</Table.Head>
		</Table.Row>
	{/snippet}
	{#snippet row(event)}
		<Table.Row>
			<Table.Cell>
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={getEventResourceURL(event)}
					target="_blank"
					rel="noopener noreferrer"
					class="hover:underline"
				>
					{event.name}
				</a>
			</Table.Cell>
			<Table.Cell>{event.type}</Table.Cell>
			<Table.Cell>{event.reason}</Table.Cell>
			<Table.Cell title={event.message}>{event.message}</Table.Cell>
			<Table.Cell>{event.count}</Table.Cell>
			<Table.Cell>{formatTimestamp(event.lastSeen)}</Table.Cell>
		</Table.Row>
	{/snippet}
</RelatedInformationTable>
