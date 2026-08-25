<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import lodash from 'lodash';

	import * as Table from '$lib/components/ui/table/index.js';
	import { cn } from '$lib/utils';

	let { object }: { object: JsonObject } = $props();

	type ConditionRow = {
		key: string;
		type: string;
		status: string;
		reason: string;
		message: string;
		lastTransitionTime: string;
	};

	const conditions = $derived.by<ConditionRow[]>(() => {
		const raw = lodash.get(object, 'status.conditions');
		if (!Array.isArray(raw)) return [];
		return raw.map((condition, index) => ({
			key: `${lodash.get(condition, 'type') ?? index}`,
			type: (lodash.get(condition, 'type') as string) ?? '—',
			status: (lodash.get(condition, 'status') as string) ?? 'Unknown',
			reason: (lodash.get(condition, 'reason') as string) ?? '—',
			message: (lodash.get(condition, 'message') as string) ?? '—',
			lastTransitionTime: (lodash.get(condition, 'lastTransitionTime') as string) ?? ''
		}));
	});

	function statusClass(status: string): string {
		if (status === 'True') return 'text-chart-2';
		if (status === 'False') return 'text-chart-1';
		return 'text-muted-foreground';
	}

	function formatTime(value: string): string {
		return value ? new Date(value).toLocaleString('sv-SE') : '—';
	}
</script>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Type</Table.Head>
			<Table.Head>Status</Table.Head>
			<Table.Head>Reason</Table.Head>
			<Table.Head>Message</Table.Head>
			<Table.Head>Last Transition</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#if conditions.length === 0}
			<Table.Row>
				<Table.Cell colspan={5} class="text-center text-sm text-muted-foreground">
					No conditions reported.
				</Table.Cell>
			</Table.Row>
		{/if}
		{#each conditions as condition (condition.key)}
			<Table.Row>
				<Table.Cell class="font-medium">{condition.type}</Table.Cell>
				<Table.Cell class={cn('font-medium', statusClass(condition.status))}>
					{condition.status}
				</Table.Cell>
				<Table.Cell class="text-muted-foreground">{condition.reason}</Table.Cell>
				<Table.Cell class="max-w-md truncate" title={condition.message}>
					{condition.message}
				</Table.Cell>
				<Table.Cell class="whitespace-nowrap text-muted-foreground">
					{formatTime(condition.lastTransitionTime)}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
