<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { MinusIcon, PlusIcon, ScalingIcon } from '@lucide/svelte';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
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
	const currentReplicas: number = $derived(object?.spec?.replicas ?? 1);

	let replicas = $state(currentReplicas);
	let open = $state(false);
	let isScaling = $state(false);

	function increment() {
		replicas = Math.max(0, replicas + 1);
	}

	function decrement() {
		replicas = Math.max(0, replicas - 1);
	}

	function handleScale() {
		if (isScaling) return;
		isScaling = true;

		toast.promise(
			async () => {
				const response = await client.scale({
					cluster,
					namespace,
					group,
					version,
					resource,
					name,
					replicas
				});
				return response;
			},
			{
				loading: `Scaling ${kind.toLowerCase()} ${name} to ${replicas} replicas...`,
				success: (response) => {
					return `Successfully scaled ${kind.toLowerCase()} ${name} to ${response.replicas} replicas`;
				},
				error: (error) => {
					console.error(`Failed to scale ${kind.toLowerCase()} ${name}:`, error);
					return `Failed to scale ${kind.toLowerCase()} ${name}: ${(error as ConnectError).message}`;
				},
				finally() {
					isScaling = false;
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
					<ScalingIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Scale</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[23vw] overflow-auto">
		<AlertDialog.Header>
			<AlertDialog.Title>Scale {kind}</AlertDialog.Title>
			<AlertDialog.Description>
				Adjust the number of replicas for <strong>{name}</strong> in namespace
				<strong>{namespace}</strong>. Current replicas: <strong>{currentReplicas}</strong>.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="flex items-center justify-center gap-4 py-4">
			<Button
				size="icon"
				variant="outline"
				onclick={decrement}
				disabled={replicas <= 0}
				aria-label="Decrease replicas"
			>
				<MinusIcon size={16} />
			</Button>
			<input
				type="number"
				min="0"
				bind:value={replicas}
				class="h-10 w-20 rounded-md border bg-background text-center text-lg font-semibold"
			/>
			<Button size="icon" variant="outline" onclick={increment} aria-label="Increase replicas">
				<PlusIcon size={16} />
			</Button>
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<Button onclick={handleScale} disabled={isScaling || replicas === currentReplicas}>
				{isScaling ? 'Scaling...' : 'Apply'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
