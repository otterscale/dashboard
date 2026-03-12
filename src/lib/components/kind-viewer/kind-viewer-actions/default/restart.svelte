<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { RotateCcwIcon } from '@lucide/svelte';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import type { FormValue, Schema } from '@sjsf/form';
	import { SubmitButton } from '@sjsf/form';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Form from '$lib/components/dynamic-form/form.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(RuntimeService, transport);

	const name: string = $derived(object?.metadata?.name ?? '');

	const jsonSchema = {
		type: 'object',
		properties: {}
	} as Schema;

	let values: any = $state({});

	let open = $state(false);
	let isRestarting = $state(false);

	function handleRestart() {
		if (isRestarting) return;
		isRestarting = true;

		toast.promise(
			async () => {
				await client.restart({
					cluster,
					namespace,
					group,
					version,
					resource,
					name
				});
			},
			{
				loading: `Restarting ${kind.toLowerCase()} ${name}...`,
				success: () => {
					return `Successfully triggered rolling restart for ${kind.toLowerCase()} ${name}`;
				},
				error: (error) => {
					console.error(`Failed to restart ${kind.toLowerCase()} ${name}:`, error);
					return `Failed to restart ${kind.toLowerCase()} ${name}: ${(error as ConnectError).message}`;
				},
				finally() {
					isRestarting = false;
					open = false;
				}
			}
		);
	}
</script>

<AlertDialog.Root bind:open {onOpenChangeComplete}>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<RotateCcwIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Restart</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[23vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Restart {kind}</Item.Title>
				<Item.Description>
					Are you sure you want to trigger a rolling restart for <strong>{name}</strong>
					in namespace <strong>{namespace}</strong>? This will recreate all pods managed by this {kind.toLowerCase()}.
				</Item.Description>
			</Item.Content>
		</Item.Root>
		<Form
			schema={jsonSchema as any}
			uiSchema={{}}
			initialValue={{} as FormValue}
			bind:values
			handleSubmit={{
				posthook: () => {
					handleRestart();
				}
			}}
			class="**:data-[slot=dynamic-form-mode-controller]:hidden"
		>
			{#snippet actions()}
				<div class="*:w-full">
					<SubmitButton />
				</div>
			{/snippet}
		</Form>
	</AlertDialog.Content>
</AlertDialog.Root>
