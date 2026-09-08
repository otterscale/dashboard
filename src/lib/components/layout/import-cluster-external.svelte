<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FileCodeIcon from '@lucide/svelte/icons/file-code';
	import ServerIcon from '@lucide/svelte/icons/server';
	import TerminalIcon from '@lucide/svelte/icons/terminal';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { type Link, LinkService } from '@otterscale/api/link/v1';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { AppsV1Deployment } from '@otterscale/types';
	import {
		type FormState,
		type FormValue,
		getValueSnapshot,
		type Schema,
		type UiSchemaRoot
	} from '@sjsf/form';
	import Ajv from 'ajv';
	import ajvErrors from 'ajv-errors';
	import { getContext, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Code from '$lib/components/custom/code';
	import Form from '$lib/components/dynamic-form/form.svelte';
	import ImportClusterAdministrators, {
		type KeycloakUser
	} from '$lib/components/layout/import-cluster-administrators.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import * as Item from '$lib/components/ui/item';
	import { Progress } from '$lib/components/ui/progress';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/messages';
	import { bump } from '$lib/stores/pulse.svelte';
	import { cn } from '$lib/utils';
	import {
		CLUSTER_INFO_REQUIRED_FIELDS,
		clusterInfoFieldsSchema
	} from '$lib/utils/cluster-info-schema';

	let {
		open = $bindable(false),
		onsuccess
	}: {
		open: boolean;
		onsuccess?: () => void;
	} = $props();

	const POLL_INTERVAL = 3000;

	const transport: Transport = getContext('transport');
	const linkClient = createClient(LinkService, transport);
	const resourceClient = createClient(ResourceService, transport);

	let stepIndex = $state(1);
	let clusterName = $state('');
	let installCommand = $state('');
	let agentValues = $state('');
	let robotName = $state('');
	let robotRotated = $state(false);
	let clusterStatus = $state<'pending' | 'installing' | 'done'>('pending');
	let isCreating = $state(false);
	let errorMessage = $state('');
	let isYamlOpen = $state(false);

	// Owned here so reset() can clear it and submitClusterInfo can read it; the
	// picker UI and its user search live in <ImportClusterAdministrators>.
	let selectedUsers = $state<KeycloakUser[]>([]);

	let isPolling = false;
	let abortController: AbortController | null = null;
	let wasOpen = open;

	onDestroy(() => {
		abortController?.abort();
	});

	$effect(() => {
		if (wasOpen && !open) reset();
		wasOpen = open;
	});

	// Mirrors core.ValidateClusterName on the server.
	const CLUSTER_NAME_PATTERN = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$';

	function defaultClusterNameValues(): FormValue {
		return { clusterName: '' };
	}

	function defaultClusterInfoValues(): FormValue {
		return {
			externalAddress: '',
			nodePortRangeMin: 30000,
			nodePortRangeMax: 32767,
			inferenceURL: ''
		};
	}

	// Step 1: just the name. Mirrors core.ValidateClusterName on the server.
	// `errorMessage` is an ajv-errors extension sjsf's `Schema` type doesn't model — cast, same
	// as clusterInfoSchema below.
	const clusterNameSchema: Schema = {
		type: 'object',
		properties: {
			clusterName: {
				type: 'string',
				title: m.import_cluster_name_label(),
				pattern: CLUSTER_NAME_PATTERN,
				maxLength: 63,
				errorMessage: m.import_cluster_name_invalid()
			}
		},
		required: ['clusterName']
	} as unknown as Schema;

	const clusterNameUiSchema: UiSchemaRoot = {
		clusterName: {
			'ui:options': {
				shadcn4Text: { placeholder: m.import_cluster_name_placeholder() }
			}
		}
	};

	// Step 2: externalAddress/nodePortRangeMin/nodePortRangeMax are always required;
	// inferenceURL is optional but format-checked. Cluster info is always enabled now, so this
	// is a flat schema (no `if`/`then` toggle). The rules come from cluster-info-schema.ts, the
	// same fragment /bff/cluster-import validates the request against, so the two can't drift
	// apart; only title/errorMessage (display, not a rule) are added here.
	const clusterInfoSchema: Schema = {
		type: 'object',
		required: [...CLUSTER_INFO_REQUIRED_FIELDS],
		properties: {
			externalAddress: {
				...clusterInfoFieldsSchema.properties.externalAddress,
				title: m.import_cluster_external_address_label(),
				errorMessage: m.import_cluster_external_address_invalid()
			},
			nodePortRangeMin: {
				...clusterInfoFieldsSchema.properties.nodePortRangeMin,
				title: m.import_cluster_node_port_range_label(),
				errorMessage: m.import_cluster_node_port_range_bounds_invalid()
			},
			nodePortRangeMax: {
				...clusterInfoFieldsSchema.properties.nodePortRangeMax,
				errorMessage: {
					type: m.import_cluster_node_port_range_bounds_invalid(),
					minimum: m.import_cluster_node_port_range_bounds_invalid(),
					maximum: m.import_cluster_node_port_range_bounds_invalid(),
					exclusiveMinimum: m.import_cluster_node_port_range_order_invalid()
				}
			},
			inferenceURL: {
				...clusterInfoFieldsSchema.properties.inferenceURL,
				title: m.import_cluster_inference_url_label(),
				errorMessage: m.import_cluster_inference_url_invalid()
			}
		}
		// sjsf's Schema type predates ajv's `$data` extension (used above by nodePortRangeMax's
		// exclusiveMinimum), so the two shapes don't structurally overlap enough for a direct
		// `as Schema` — routed through `unknown`, same as ajv itself treats it at runtime.
	} as unknown as Schema;

	const clusterInfoUiSchema: UiSchemaRoot = {
		'ui:options': {
			// Two-column grid: externalAddress/inferenceURL share the first row,
			// nodePortRangeMin/nodePortRangeMax the second. `order` drives which cell each lands in.
			order: ['externalAddress', 'inferenceURL', 'nodePortRangeMin', 'nodePortRangeMax'],
			layouts: {
				'object-properties': { class: 'grid grid-cols-2 gap-4' }
			}
		},
		externalAddress: {
			'ui:options': {
				help: m.import_cluster_external_address_description(),
				shadcn4Text: { placeholder: m.import_cluster_external_address_placeholder() }
			}
		},
		nodePortRangeMin: {
			'ui:options': {
				shadcn4Number: { placeholder: '30000' }
			}
		},
		nodePortRangeMax: {
			// Sits directly right of nodePortRangeMin under the shared "NodePort Range" label.
			'ui:options': {
				hideTitle: true,
				shadcn4Number: { placeholder: '32767' }
			}
		},
		inferenceURL: {
			'ui:options': {
				shadcn4Text: { placeholder: m.import_cluster_inference_url_placeholder() }
			}
		}
	} as UiSchemaRoot;

	let clusterNameFormReference: FormState<FormValue> | null = $state(null);
	let clusterInfoFormReference: FormState<FormValue> | null = $state(null);

	// Redundant with each sjsf form's own submit-time validation below; kept live so the
	// "Next" / "Generate command" buttons reflect validity as the user types.
	const validateClusterName = ajvErrors(new Ajv({ allErrors: true, strict: true })).compile(
		clusterNameSchema
	);
	const validateClusterInfo = ajvErrors(
		new Ajv({ allErrors: true, strict: true, $data: true })
	).compile(clusterInfoSchema);
	const canGoNext = $derived.by(() => {
		if (stepIndex === 1) {
			return (
				clusterNameFormReference !== null &&
				validateClusterName(getValueSnapshot(clusterNameFormReference))
			);
		}
		if (stepIndex === 2) {
			return (
				clusterInfoFormReference !== null &&
				validateClusterInfo(getValueSnapshot(clusterInfoFormReference))
			);
		}
		return false;
	});

	function reset() {
		abortController?.abort();
		abortController = null;
		isPolling = false;

		stepIndex = 1;
		clusterName = '';
		installCommand = '';
		agentValues = '';
		robotName = '';
		robotRotated = false;
		clusterStatus = 'pending';
		isCreating = false;
		errorMessage = '';
		isYamlOpen = false;
		clusterNameFormReference = null;
		clusterInfoFormReference = null;
		selectedUsers = [];
	}

	// Each visible wizard button lives outside its sjsf `<form>`, so it triggers that form's
	// own submit programmatically; the form's posthook only fires once its schema validation
	// succeeds. Step 1 just advances; step 2 does the real work in submitClusterInfo.
	function handleNext() {
		if (!canGoNext || isCreating || !clusterNameFormReference) return;
		clusterNameFormReference.submit(new SubmitEvent('submit', { cancelable: true }));
	}

	function goToClusterInfo() {
		stepIndex = 2;
	}

	function handleGenerateCommand() {
		if (!canGoNext || isCreating || !clusterInfoFormReference) return;
		clusterInfoFormReference.submit(new SubmitEvent('submit', { cancelable: true }));
	}

	async function submitClusterInfo(form: FormState<FormValue>) {
		if (isCreating) return;
		isCreating = true;
		errorMessage = '';

		const nameValues = clusterNameFormReference
			? (getValueSnapshot(clusterNameFormReference) as { clusterName: string })
			: { clusterName: '' };
		const values = getValueSnapshot(form) as {
			externalAddress?: string;
			nodePortRangeMin?: number;
			nodePortRangeMax?: number;
			inferenceURL?: string;
		};
		// Normalized once: polling and the final step both compare against this value.
		clusterName = nameValues.clusterName.trim();

		try {
			const response = await fetch('/bff/cluster-import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster: clusterName,
					extraUsers: selectedUsers.map((u) => u.id).filter((id) => id),
					clusterInfo: {
						enabled: true,
						externalAddress: (values.externalAddress ?? '').trim(),
						nodePortRangeMin: values.nodePortRangeMin,
						nodePortRangeMax: values.nodePortRangeMax,
						inferenceURL: (values.inferenceURL ?? '').trim()
					}
				})
			});

			if (!response.ok) {
				throw new Error((await response.text()) || m.import_cluster_command_failed());
			}

			const result = (await response.json()) as {
				installCommand: string;
				values: string;
				robot: { name: string; rotated: boolean };
			};

			installCommand = result.installCommand;
			agentValues = result.values;
			robotName = result.robot.name;
			robotRotated = result.robot.rotated;
			clusterStatus = 'pending';
			stepIndex = 3;

			toast.success(m.import_cluster_command_generated({ name: clusterName }));
			pollForConnection();
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : m.import_cluster_command_failed();
			toast.error(errorMessage);
		} finally {
			isCreating = false;
		}
	}

	async function pollForConnection() {
		if (isPolling) return;
		isPolling = true;

		abortController?.abort();
		abortController = new AbortController();
		const signal = abortController.signal;

		while (!signal.aborted && clusterStatus === 'pending') {
			try {
				const response = await linkClient.listLinks({});
				if (signal.aborted) break;

				const found = response.links.some((link: Link) => link.cluster === clusterName);
				if (found) {
					clusterStatus = 'installing';
					break;
				}
			} catch {
				// retry silently
			}
			if (!signal.aborted) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
			}
		}

		while (!signal.aborted && clusterStatus === 'installing') {
			try {
				const response = await resourceClient.get({
					cluster: clusterName,
					namespace: 'otterscale-system',
					group: 'apps',
					version: 'v1',
					resource: 'deployments',
					name: 'tenant-operator-controller-manager'
				});
				if (signal.aborted) break;

				const obj = response.object as AppsV1Deployment;
				const conditions = obj?.status?.conditions ?? [];
				const available = conditions.find((c) => c.type === 'Available');
				if (available?.status === 'True') {
					clusterStatus = 'done';
					stepIndex = 4;
					break;
				}
			} catch {
				// deployment may not exist yet, retry silently
			}
			if (!signal.aborted) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
			}
		}

		if (abortController?.signal === signal) isPolling = false;
	}

	function handleFinish() {
		bump('links');
		const target = resolve('/(auth)/[cluster]/console', { cluster: clusterName });
		goto(target);
		open = false;
		onsuccess?.();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[95vh] min-w-[38vw] flex-col overflow-hidden">
		<Dialog.Title class="sr-only">{m.import_cluster_dialog_title()}</Dialog.Title>
		<Progress value={stepIndex} max={4} class="mt-1 mr-6 w-auto shrink-0" />

		<div class="mt-4 flex min-h-0 flex-1 flex-col gap-6">
			{#if stepIndex <= 2}
				<!-- Both step forms stay mounted so going Back from step 2 keeps what was typed. -->
				<div class={stepIndex === 1 ? 'contents' : 'hidden'}>
					{@render stepClusterName()}
				</div>
				<div class={stepIndex === 2 ? 'contents' : 'hidden'}>
					{@render stepClusterInfo()}
				</div>
			{:else if stepIndex === 3}
				{@render stepDeployAgent()}
			{:else if stepIndex === 4}
				{@render stepVerifyBinding()}
			{/if}

			{#if stepIndex === 1 || stepIndex === 2 || stepIndex === 4}
				<div class="mt-auto flex w-full items-center justify-between gap-3 pt-4">
					{#if stepIndex === 1}
						<Button variant="outline" onclick={() => (open = false)}>{m.cancel()}</Button>
						<Button onclick={handleNext} disabled={!canGoNext}>{m.next()}</Button>
					{:else if stepIndex === 2}
						<Button variant="outline" onclick={() => (stepIndex = 1)}>{m.back()}</Button>
						<Button onclick={handleGenerateCommand} disabled={!canGoNext || isCreating}>
							{#if isCreating}
								<Spinner data-icon="inline-start" />
								{m.import_cluster_generating()}
							{:else}
								<TerminalIcon data-icon="inline-start" />
								{m.import_cluster_generate_install_command()}
							{/if}
						</Button>
					{:else}
						<div></div>
						<Button onclick={handleFinish}>{m.done()}</Button>
					{/if}
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

{#snippet stepClusterName()}
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold">{m.import_cluster_info_title()}</h3>
			<p class="text-sm text-muted-foreground">{m.import_cluster_info_description()}</p>
		</div>

		<Field.FieldGroup>
			<Form
				schema={clusterNameSchema}
				uiSchema={clusterNameUiSchema}
				initialValue={defaultClusterNameValues()}
				bind:reference={clusterNameFormReference}
				handleSubmit={{ posthook: goToClusterInfo }}
				class="**:data-[slot=dynamic-form-mode-controller]:hidden"
			/>

			<ImportClusterAdministrators bind:users={selectedUsers} />
		</Field.FieldGroup>
	</div>
{/snippet}

{#snippet stepClusterInfo()}
	<div class="flex flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold">{m.import_cluster_access_label()}</h3>
			<p class="text-sm text-muted-foreground">{m.import_cluster_access_description()}</p>
		</div>

		<Field.FieldGroup>
			<Form
				schema={clusterInfoSchema}
				uiSchema={clusterInfoUiSchema}
				initialValue={defaultClusterInfoValues()}
				bind:reference={clusterInfoFormReference}
				handleSubmit={{ posthook: submitClusterInfo }}
				class="**:data-[slot=dynamic-form-mode-controller]:hidden"
			/>
		</Field.FieldGroup>
	</div>
{/snippet}

{#snippet stepDeployAgent()}
	<div class="flex min-h-0 flex-1 flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold">{m.import_cluster_deploy_agent_title()}</h3>
			<p class="text-sm text-muted-foreground">
				{m.import_cluster_deploy_agent_description()}
			</p>
		</div>

		{#if robotRotated}
			<Item.Root variant="outline" class="border-amber-500/50 bg-amber-500/5">
				<Item.Media variant="icon" class="size-10 rounded-full bg-amber-500/10 text-amber-500">
					<TriangleAlertIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>{m.import_cluster_robot_rotated_title()}</Item.Title>
					<Item.Description>
						{m.import_cluster_robot_rotated_description({ name: robotName })}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}

		<div
			class={cn(
				'flex flex-col gap-3 rounded-lg border bg-card p-4',
				isYamlOpen && 'min-h-0 flex-1'
			)}
		>
			<Field.FieldLabel class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{m.import_cluster_install_command_label()}
			</Field.FieldLabel>

			<Code.Root
				lang="bash"
				class="w-full shrink-0 pr-12 text-sm [&_pre.shiki]:[scrollbar-width:none] [&_pre.shiki::-webkit-scrollbar]:hidden"
				variant="secondary"
				code={installCommand}
				hideLines
			>
				<Code.CopyButton />
			</Code.Root>

			<Field.FieldDescription>
				{m.import_cluster_install_command_description()}
			</Field.FieldDescription>

			{#if agentValues}
				<Collapsible.Root
					bind:open={isYamlOpen}
					class={cn('flex flex-col', isYamlOpen && 'min-h-0 flex-1')}
				>
					<Collapsible.Trigger
						class="group flex w-full items-center justify-between border-t pt-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						<span class="flex items-center gap-2">
							<FileCodeIcon class="size-4" />
							{m.import_cluster_preview_values()}
						</span>
						<ChevronDownIcon
							class="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
						/>
					</Collapsible.Trigger>
					<Collapsible.Content class="flex min-h-0 flex-1 flex-col">
						<div class="mt-2 min-h-0 flex-1 overflow-auto rounded-md border">
							<Code.Root lang="yaml" class="w-full text-xs" code={agentValues}>
								<Code.CopyButton />
							</Code.Root>
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}
		</div>

		<Item.Root variant="outline">
			<Item.Media variant="icon" class="size-10 rounded-full bg-muted text-muted-foreground">
				<ServerIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>{clusterName}</Item.Title>
				<Item.Description>
					{m.import_cluster_target_cluster()}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				{#if clusterStatus === 'pending'}
					<span class="flex items-center gap-2 text-muted-foreground">
						<span class="relative flex size-2">
							<span
								class="absolute inline-flex size-full animate-ping rounded-full bg-primary/75 opacity-75"
							></span>
							<span class="relative inline-flex size-2 rounded-full bg-primary"></span>
						</span>
						{m.import_cluster_waiting_connection()}
					</span>
				{:else if clusterStatus === 'installing'}
					<span class="flex items-center gap-2 text-amber-500">
						<Spinner />
						<span class="font-medium">{m.import_cluster_installing()}</span>
					</span>
				{:else}
					<span class="flex items-center gap-2 text-primary">
						<CircleCheckIcon />
						<span class="font-medium">{m.import_cluster_managed_status()}</span>
					</span>
				{/if}
			</Item.Actions>
		</Item.Root>
	</div>
{/snippet}

{#snippet stepVerifyBinding()}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon" class="size-14 bg-primary/10 ring-4 ring-primary/5">
				<CircleCheckIcon class="size-8 text-primary" />
			</Empty.Media>
			<Empty.Title>{m.import_cluster_managed_successfully_title()}</Empty.Title>
			<Empty.Description>
				<strong>{clusterName}</strong>{m.import_cluster_managed_ready_suffix()}
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<div class="w-full max-w-sm rounded-lg border bg-card p-3 text-sm shadow-sm">
				<div class="flex flex-col gap-2">
					<div class="flex justify-between">
						<span class="text-muted-foreground">{m.cluster()}</span>
						<span class="font-medium">{clusterName}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">{m.status()}</span>
						<span class="flex items-center gap-1.5 font-medium text-primary">
							<span class="size-1.5 rounded-full bg-primary"></span>
							{m.import_cluster_managed()}
						</span>
					</div>
					{#if robotName}
						<div class="flex justify-between gap-4">
							<span class="text-muted-foreground">{m.import_cluster_harbor_robot()}</span>
							<span class="truncate font-medium">{robotName}</span>
						</div>
					{/if}
					{#if selectedUsers.length > 0}
						<div class="flex justify-between">
							<span class="text-muted-foreground">{m.import_cluster_permissions()}</span>
							<span class="flex items-center gap-1.5 font-medium text-primary">
								<CircleCheckIcon class="size-3.5" />
								{m.import_cluster_admin_count({ count: selectedUsers.length })}
							</span>
						</div>
					{/if}
				</div>
			</div>
		</Empty.Content>
	</Empty.Root>
{/snippet}
