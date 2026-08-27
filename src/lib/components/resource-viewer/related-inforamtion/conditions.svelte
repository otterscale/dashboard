<script lang="ts">
	import { type ColumnDef } from '@tanstack/table-core';
	import lodash from 'lodash';

	import * as Table from '$lib/components/ui/table/index.js';

	import RelatedInformationTable from '../related-information-table.svelte';
	import type { ResourceObject } from '../types';
	import { formatTimestamp } from '../utils';

	let { object }: { object: ResourceObject | undefined } = $props();

	type ConditionRow = {
		id: string;
		type: string;
		status: string;
		reason: string;
		message: string;
		lastTransitionTime: string;
	};

	const columns: ColumnDef<ConditionRow>[] = [
		{ accessorKey: 'type' },
		{ accessorKey: 'status' },
		{ accessorKey: 'reason' },
		{ accessorKey: 'message' },
		{ accessorKey: 'lastTransitionTime' }
	];

	const conditions = $derived.by<ConditionRow[]>(() => {
		const raw = lodash.get(object, 'status.conditions');
		if (!Array.isArray(raw)) return [];
		return raw.map((condition, index) => ({
			id: `${lodash.get(condition, 'type') ?? index}`,
			type: (lodash.get(condition, 'type') as string) ?? '—',
			status: (lodash.get(condition, 'status') as string) ?? undefined,
			reason: (lodash.get(condition, 'reason') as string) ?? '—',
			message: (lodash.get(condition, 'message') as string) ?? '—',
			lastTransitionTime: (lodash.get(condition, 'lastTransitionTime') as string) ?? ''
		}));
	});
</script>

<RelatedInformationTable data={conditions} {columns}>
	{#snippet header()}
		<Table.Row>
			<Table.Head>Type</Table.Head>
			<Table.Head>Status</Table.Head>
			<Table.Head>Reason</Table.Head>
			<Table.Head>Message</Table.Head>
			<Table.Head>Last Transition</Table.Head>
		</Table.Row>
	{/snippet}
	{#snippet row(condition)}
		<Table.Row>
			<Table.Cell>{condition.type}</Table.Cell>
			<Table.Cell>{condition.status}</Table.Cell>
			<Table.Cell>{condition.reason}</Table.Cell>
			<Table.Cell title={condition.message}>{condition.message}</Table.Cell>
			<Table.Cell>{formatTimestamp(condition.lastTransitionTime)}</Table.Cell>
		</Table.Row>
	{/snippet}
</RelatedInformationTable>
