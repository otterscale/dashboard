<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { GpuIcon } from '@lucide/svelte';
	import lodash from 'lodash';
	import { onMount } from 'svelte';

	import { page } from '$app/state';
	import { formatWithBinarySuffix } from '$lib/components/dynamic-table/utils';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Modal from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';
	import { sharedMetrics } from '$lib/prometheus';

	let gpus: Record<string, JsonValue>[] = [];
	let gpusByModelName: Record<string, JsonValue>[] = [];
	let gpusByHostName: Record<string, JsonValue>[] = [];
	/** Set when the numbers could not be loaded, so an empty table is not read as no GPUs. */
	let errorMessage: string | null = null;

	onMount(async () => {
		// Per-card inventory and vGPU totals: cluster-wide, naming no workload,
		// from the shared scope for every viewer.
		const shared = sharedMetrics(page.params.cluster!, page.data.namespace ?? '');

		try {
			const [fieldBufferResponse, vgpuLimitResponse, vgpuUsageResponse] = await Promise.all([
				shared.instant('gpu-inventory'),
				shared.instant('vgpu-memory-limit'),
				shared.instant('vgpu-memory-used')
			]);

			const vgpuLimits = vgpuLimitResponse.result.map((series) => {
				return { ...series.metric.labels, limit: series.value?.value };
			});
			const vgpuUsages = vgpuUsageResponse.result.map((series) => {
				return { ...series.metric.labels, usage: series.value?.value };
			});

			const limitsByDeviceUUID = lodash.mapValues(
				lodash.groupBy(vgpuLimits, 'device_uuid'),
				(group) => lodash.sumBy(group, 'limit')
			);
			const usagesByDeviceUUID = lodash.mapValues(
				lodash.groupBy(vgpuUsages, 'device_uuid'),
				(group) => lodash.sumBy(group, 'usage')
			);

			gpus = fieldBufferResponse.result.map((series) => {
				const labels = series.metric.labels;
				const uuid = lodash.get(labels, 'UUID');
				return {
					...labels,
					total: lodash.get(series, ['value', 'value'], undefined),
					limit: lodash.get(limitsByDeviceUUID, uuid, undefined),
					usage: lodash.get(usagesByDeviceUUID, uuid, undefined)
				};
			});
			gpusByModelName = Object.entries(
				lodash.groupBy(gpus, (gpu) => lodash.get(gpu, 'modelName'))
			).map(([key, value]) => ({
				identifier: key,
				limit: lodash.sumBy(value, 'limit'),
				usage: lodash.sumBy(value, 'usage'),
				total: lodash.sumBy(value, 'total')
			}));
			gpusByHostName = Object.entries(
				lodash.groupBy(gpus, (gpu) => lodash.get(gpu, 'hostname'))
			).map(([key, value]) => ({
				identifier: key,
				limit: lodash.sumBy(value, 'limit'),
				usage: lodash.sumBy(value, 'usage'),
				total: lodash.sumBy(value, 'total')
			}));
		} catch (error) {
			console.warn('Failed to fetch GPU resources:', error);
			gpus = [];
			gpusByModelName = [];
			gpusByHostName = [];
			errorMessage = m.gpu_resources_fetch_error({
				message: error instanceof Error ? error.message : String(error)
			});
		}
	});
</script>

<Modal.Root>
	<Modal.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
		<GpuIcon />
	</Modal.Trigger>
	<Modal.Content
		class="max-h-[95vh] min-w-[77vw] overflow-auto"
		onInteractOutside={(e) => e.preventDefault()}
	>
		<Item.Root class="w-full px-2">
			<Item.Content class="*:font-bold">
				<Item.Title>GPU Resources</Item.Title>
				<Item.Description>Amount of limits, usage, and total field buffers.</Item.Description>
			</Item.Content>
			{#if !errorMessage}
				<Item.Actions>{gpus.length} devices</Item.Actions>
			{/if}
		</Item.Root>

		{#if errorMessage}
			<p class="px-2 text-sm text-destructive">{errorMessage}</p>
		{:else}
			<Item.Root class="w-full px-2 py-0">
				<Item.Content>
					<Item.Title>Summary</Item.Title>
					<Item.Description>
						{gpusByModelName.length} types
					</Item.Description>
				</Item.Content>
			</Item.Root>
			<Table.Root class="rounded-lg bg-muted/30">
				<Table.Header>
					<Table.Row class="hover:bg-transparent">
						<Table.Head>Identifier</Table.Head>
						<Table.Head class="text-end">usage</Table.Head>
						<Table.Head class="text-end">limit</Table.Head>
						<Table.Head class="text-end">total</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body class="[&_td:first-child]:rounded-l-lg [&_td:last-child]:rounded-r-lg">
					{#each gpusByModelName as gpuByIdetifier, index (index)}
						<Table.Row class="border-none">
							<Table.Cell>{gpuByIdetifier.identifier}</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpuByIdetifier.usage && typeof gpuByIdetifier.usage === 'number'
										? formatWithBinarySuffix(BigInt(gpuByIdetifier.usage))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpuByIdetifier.limit && typeof gpuByIdetifier.limit === 'number'
										? formatWithBinarySuffix(BigInt(gpuByIdetifier.limit))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpuByIdetifier.total && typeof gpuByIdetifier.total === 'number'
										? formatWithBinarySuffix(BigInt(gpuByIdetifier.total))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>

			<Item.Root class="w-full px-2 py-0">
				<Item.Content>
					<Item.Title>Summary</Item.Title>
					<Item.Description>
						{gpusByHostName.length} hosts
					</Item.Description>
				</Item.Content>
			</Item.Root>
			<Table.Root class="rounded-lg bg-muted/30">
				<Table.Header>
					<Table.Row class="hover:bg-transparent">
						<Table.Head>Identifier</Table.Head>
						<Table.Head class="text-end">usage</Table.Head>
						<Table.Head class="text-end">limit</Table.Head>
						<Table.Head class="text-end">total</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body class="[&_td:first-child]:rounded-l-lg [&_td:last-child]:rounded-r-lg">
					{#each gpusByHostName as gpuByIdetifier, index (index)}
						<Table.Row class="border-none">
							<Table.Cell>{gpuByIdetifier.identifier}</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpuByIdetifier.usage && typeof gpuByIdetifier.usage === 'number'
										? formatWithBinarySuffix(BigInt(gpuByIdetifier.usage))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpuByIdetifier.limit && typeof gpuByIdetifier.limit === 'number'
										? formatWithBinarySuffix(BigInt(gpuByIdetifier.limit))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpuByIdetifier.total && typeof gpuByIdetifier.total === 'number'
										? formatWithBinarySuffix(BigInt(gpuByIdetifier.total))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>

			<Item.Root class="w-full px-2 py-0">
				<Item.Content>
					<Item.Title>Details</Item.Title>
					<Item.Description>
						{gpus.length} devices
					</Item.Description>
				</Item.Content>
			</Item.Root>
			<Table.Root class="rounded-lg bg-muted/30">
				<Table.Header>
					<Table.Row class="hover:bg-transparent">
						<Table.Head>Model Name</Table.Head>
						<Table.Head>Host Name</Table.Head>
						<Table.Head>Device</Table.Head>
						<Table.Head>UUID</Table.Head>
						<Table.Head class="text-end">usage</Table.Head>
						<Table.Head class="text-end">limit</Table.Head>
						<Table.Head class="text-end">total</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body class="[&_td:first-child]:rounded-l-lg [&_td:last-child]:rounded-r-lg">
					{#each gpus as gpu, index (index)}
						<Table.Row class="border-none">
							<Table.Cell>{gpu.modelName}</Table.Cell>
							<Table.Cell>{gpu.hostname}</Table.Cell>
							<Table.Cell>{gpu.device}</Table.Cell>
							<Table.Cell>{gpu.UUID}</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpu.usage && typeof gpu.usage === 'number'
										? formatWithBinarySuffix(BigInt(gpu.usage))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpu.limit && typeof gpu.limit === 'number'
										? formatWithBinarySuffix(BigInt(gpu.limit))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
							<Table.Cell class="text-end">
								{@const { value, unit } =
									gpu.total && typeof gpu.total === 'number'
										? formatWithBinarySuffix(BigInt(gpu.total))
										: { value: undefined, unit: undefined }}
								{#if value !== undefined && unit !== undefined}
									{value.toFixed(2)} {unit}
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</Modal.Content>
</Modal.Root>
