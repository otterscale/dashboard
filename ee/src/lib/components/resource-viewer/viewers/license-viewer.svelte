<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import XCircleIcon from '@lucide/svelte/icons/circle-x';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import FileKeyIcon from '@lucide/svelte/icons/file-key';
	import ServerIcon from '@lucide/svelte/icons/server';
	import lodash from 'lodash';

	import { decodeTokenPayload, getLicenseExpiry } from '$lib/components/license/token';
	import type { LicenseObject, NodeGPU } from '$lib/components/license/types';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';

	let { object }: { object: JsonObject } = $props();

	const license = $derived(object as LicenseObject);
	const status = $derived(license?.status ?? {});
	const phase = $derived(status.phase ?? 'Pending');
	const isPlatform = $derived(status.isPlatform === true);
	const maxNodes = $derived(status.maxNodes ?? 0);
	const authorizedCount = $derived(status.authorizedNodeCount ?? 0);
	const gpuQuota = $derived(status.gpuQuota ?? []);
	const nodeAuthorizations = $derived(status.nodeAuthorizations ?? []);
	const conditions = $derived(status.conditions ?? []);

	const jwtPayload = $derived(decodeTokenPayload(license?.spec?.token ?? ''));
	const licenseId = $derived((jwtPayload?.license_id ?? '') as string);
	const licenseExp = $derived(getLicenseExpiry(jwtPayload));
	const licenseRemainingDays = $derived(
		licenseExp ? Math.ceil((licenseExp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
	);

	function phaseLabel(p: string) {
		switch (p) {
			case 'Provisional':
				return m.license_phase_provisional();
			case 'Active':
				return m.license_phase_active();
			case 'Expired':
				return m.license_phase_expired();
			case 'Invalid':
				return m.license_phase_invalid();
			default:
				return m.license_phase_pending();
		}
	}

	function phaseVariant(p: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (p) {
			case 'Active':
				return 'default';
			case 'Provisional':
				return 'secondary';
			case 'Expired':
			case 'Invalid':
				return 'destructive';
			default:
				return 'outline';
		}
	}

	function taintReasonLabel(reason: string) {
		switch (reason) {
			case 'node_quota_exceeded':
				return m.license_taint_node_quota_exceeded();
			case 'gpu_quota_exceeded':
				return m.license_taint_gpu_quota_exceeded();
			case 'gpu_model_unlicensed':
				return m.license_taint_gpu_model_unlicensed();
			case 'admin_override':
				return m.license_taint_admin_override();
			default:
				return reason;
		}
	}

	// Conditions whose True value indicates a problem (inverted semantics)
	const NEGATIVE_CONDITIONS = new Set([
		'AuthorizedNodesOverrideRejected',
		'EnforcementFrozen',
		'PlatformAliasConflict'
	]);

	// Returns true if the condition is healthy for its type
	function isConditionHealthy(type: string, conditionStatus: string): boolean {
		const isTrue = conditionStatus === 'True';
		return NEGATIVE_CONDITIONS.has(type) ? !isTrue : isTrue;
	}
</script>

<Field.Group>
	<!-- License status -->
	<Field.Set>
		<Card.Root class="flex h-full flex-col border-0 bg-muted/30 shadow-none ring-0">
			<Card.Header>
				<Card.Title>
					<Item.Root class="p-0">
						<Item.Media>
							<FileKeyIcon />
						</Item.Media>
						<Item.Content>
							<Item.Title>
								{status.softwareID ?? license?.metadata?.name ?? ''}
							</Item.Title>
							{#if licenseId}
								<Item.Description class="font-mono">{licenseId}</Item.Description>
							{/if}
						</Item.Content>
						<Item.Actions>
							<Badge variant={phaseVariant(phase)}>{phaseLabel(phase)}</Badge>
						</Item.Actions>
					</Item.Root>
				</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-8">
				<div class="grid grid-cols-2 gap-4">
					{#if licenseExp}
						<Item.Root class="p-0">
							<Item.Content>
								<Item.Description>{m.license_expiry_date()}</Item.Description>
								<Item.Title>{licenseExp.toLocaleDateString()}</Item.Title>
							</Item.Content>
						</Item.Root>
						<Item.Root class="p-0">
							<Item.Content>
								<Item.Description>{m.license_remaining_days()}</Item.Description>
								<Item.Title>
									{#if licenseRemainingDays !== null && licenseRemainingDays <= 0}
										<span class="font-semibold text-destructive">{m.license_expired_label()}</span>
									{:else if licenseRemainingDays !== null && licenseRemainingDays <= 30}
										<span class="font-semibold text-amber-500"
											>{licenseRemainingDays} {m.day()}</span
										>
									{:else if licenseRemainingDays !== null}
										<span class="font-semibold text-green-600 dark:text-green-400"
											>{licenseRemainingDays} {m.day()}</span
										>
									{/if}
								</Item.Title>
							</Item.Content>
						</Item.Root>
					{/if}
					<Item.Root class="p-0">
						<Item.Content>
							<Item.Description>{m.license_fingerprint_section()}</Item.Description>
							<Item.Title class="flex items-center gap-2">
								{#if status.clusterFingerprintOK === true}
									<CheckCircleIcon class="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
									<span class="text-green-600 dark:text-green-400">{m.license_condition_ok()}</span>
								{:else if status.clusterFingerprintOK === false}
									<XCircleIcon class="h-4 w-4 shrink-0 text-destructive" />
									<span class="text-destructive">{m.license_invalid_cluster()}</span>
								{:else}
									<span class="text-muted-foreground">{m.license_verifying()}</span>
								{/if}
							</Item.Title>
						</Item.Content>
					</Item.Root>
				</div>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
					{#if status.bindingRefreshedAt}
						<Item.Root class="p-0">
							<Item.Content>
								<Item.Description>{m.license_binding_refreshed_at()}</Item.Description>
								<Item.Title>{new Date(status.bindingRefreshedAt).toLocaleString()}</Item.Title>
							</Item.Content>
						</Item.Root>
					{/if}
					{#if conditions.length > 0}
						{#each conditions as condition (condition.type)}
							{@const isHealthy = isConditionHealthy(condition.type, condition.status)}
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Description>
										{condition.type}
									</Item.Description>
									<Item.Title>{condition.reason ?? condition.message}</Item.Title>
								</Item.Content>
								<Item.Actions>
									<Badge
										variant={condition.status == 'True' && !isHealthy ? 'destructive' : 'secondary'}
										>{condition.status}</Badge
									>
								</Item.Actions>
							</Item.Root>
						{/each}
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	</Field.Set>

	{#if isPlatform}
		<!-- Node quota + GPU quota (populated on the platform license only) -->
		<Field.Set>
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>{m.resource_quota()}</Item.Title>
					<Item.Description>
						{#if Number(maxNodes) == 0}
							{m.license_unlimited()}
						{:else}
							{authorizedCount}
						{/if}
						{m.node()}
						/
						{#if gpuQuota.length == 0}
							{m.license_unlimited()}
						{:else}
							{gpuQuota.reduce(
								(gpus: number, gpu: object) => gpus + lodash.get(gpu, 'authorizedCards', 0),
								0
							)}
						{/if}
						{m.gpu()}
					</Item.Description>
				</Item.Content>
			</Item.Root>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<Card.Root class="flex h-full flex-col border-0 bg-muted/30 shadow-none ring-0">
					<Card.Header>
						<Card.Title>
							<Item.Root class="p-0">
								<Item.Media>
									<ServerIcon size={20} />
								</Item.Media>
								<Item.Content>
									<Item.Title>
										{m.license_node_quota_card()}
									</Item.Title>
								</Item.Content>
							</Item.Root>
						</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
							<Item.Root class="w-fit p-0">
								<Item.Content class="flex gap-2">
									<Item.Description>{m.license_authorized_count()}</Item.Description>
									<Item.Title>
										{#if Number(maxNodes) == 0}
											{m.license_unlimited()}
										{:else}
											{authorizedCount} / {maxNodes}
										{/if}
									</Item.Title>
								</Item.Content>
							</Item.Root>
						</div>
					</Card.Content>
				</Card.Root>

				<!-- GPU Quota -->
				<Card.Root class="flex h-full flex-col border-0 bg-muted/30 shadow-none ring-0">
					<Card.Header>
						<Card.Title>
							<Item.Root class="p-0">
								<Item.Media>
									<CpuIcon size={20} />
								</Item.Media>
								<Item.Content>
									<Item.Title>
										{m.license_gpu_quota_card()}
									</Item.Title>
								</Item.Content>
							</Item.Root>
						</Card.Title>
					</Card.Header>
					<Card.Content>
						{#if gpuQuota.length > 0}
							<div class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
								{#each gpuQuota as gpu (gpu.modelID)}
									<Item.Root class="w-fit p-0">
										<Item.Content class="flex gap-2">
											<Item.Description>{gpu.modelID}</Item.Description>
											<Item.Title>
												{gpu.authorizedCards} / {gpu.maxCards}
											</Item.Title>
										</Item.Content>
									</Item.Root>
								{/each}
							</div>
						{:else}
							<Item.Root class="w-fit p-0">
								<Item.Content class="flex gap-2">
									<Item.Description>{m.license_authorized_count()}</Item.Description>
									<Item.Title>
										{m.license_unlimited()}
									</Item.Title>
								</Item.Content>
							</Item.Root>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>
		</Field.Set>

		<!-- Node authorization status -->
		<Field.Set>
			<Item.Root class="p-0">
				<Item.Content>
					<Item.Title>{m.license_node_authorizations_title()}</Item.Title>
					<Item.Description>
						{nodeAuthorizations.length}
						{m.license_node_col_name()}
					</Item.Description>
				</Item.Content>
			</Item.Root>
			{#if nodeAuthorizations.length > 0}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m.license_node_col_name()}</Table.Head>
							<Table.Head>{m.license_node_col_authorized()}</Table.Head>
							<Table.Head>{m.license_node_col_gpus()}</Table.Head>
							<Table.Head>{m.license_node_col_reason()}</Table.Head>
							<Table.Head>{m.license_node_col_created()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each nodeAuthorizations as node (node.name)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">{node.name}</Table.Cell>
								<Table.Cell>
									{#if node.authorized}
										<span class="flex items-center gap-1 text-green-600 dark:text-green-400">
											<CheckCircleIcon class="h-4 w-4" />
											{m.license_condition_ok()}
										</span>
									{:else}
										<span class="flex items-center gap-1 text-destructive">
											<XCircleIcon class="h-4 w-4" />
											{m.license_unauthorized()}
										</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-xs">
									{#if node.gpus && node.gpus.length > 0}
										{node.gpus
											.map((g: NodeGPU) => `${g.count} ${g.modelID ?? 'devices'}`)
											.join(', ')}
									{/if}
								</Table.Cell>
								<Table.Cell class="text-xs">
									{#if node.reason}
										{taintReasonLabel(node.reason)}
									{/if}
								</Table.Cell>
								<Table.Cell class="text-xs">
									{#if node.createdAt}
										{new Date(node.createdAt).toLocaleDateString()}
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{:else}
				<Empty.Root class="h-full bg-muted/30">
					<Empty.Header>
						<Empty.Media variant="icon">
							<ServerIcon />
						</Empty.Media>
						<Empty.Title>{m.license_no_nodes()}</Empty.Title>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</Field.Set>
	{/if}
</Field.Group>
