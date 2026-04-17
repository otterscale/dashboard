<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ListIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1ConfigMap, CoreV1Secret } from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext } from 'svelte';

	import * as Code from '$lib/components/custom/code';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		namespace,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let open = $state(false);

	const name = $derived(object?.metadata?.name ?? '');

	async function fetchSecret(): Promise<CoreV1Secret | null> {
		try {
			const response = await resourceClient.get({
				cluster,
				namespace,
				name,
				group: '',
				version: 'v1',
				resource: 'secrets'
			});
			return response?.object as CoreV1Secret;
		} catch {
			return null;
		}
	}

	async function fetchWorkspaceConfiguration() {
		try {
			const response = await resourceClient.get({
				cluster,
				namespace,
				name: 'workspace-config',
				group: '',
				version: 'v1',
				resource: 'configmaps'
			});
			return response.object as CoreV1ConfigMap;
		} catch {
			return null;
		}
	}
</script>

<AlertDialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) {
			onOpenChangeComplete?.();
		}
	}}
>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root {...props} class="w-full p-0 text-xs" size="sm">
				<Item.Media>
					<ListIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>List</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[62vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">List</Item.Title>
				<Item.Description>
					Use the following command to list all files in your object storage bucket. Replace the
					placeholders with your actual values.
				</Item.Description>
			</Item.Content>
		</Item.Root>
		{#await fetchSecret()}
			<div class="flex flex-col items-center gap-3 py-8">
				<div class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"></div>
				<p class="text-sm text-muted-foreground">fetching secret</p>
			</div>
		{:then secret}
			{#await fetchWorkspaceConfiguration()}
				<div class="flex flex-col items-center gap-3 py-8">
					<div
						class="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary"
					></div>
					<p class="text-sm text-muted-foreground">fetching workspace configuration</p>
				</div>
			{:then workspaceConfiguration}
				{@const endpoint = lodash.get(
					workspaceConfiguration,
					['data', 'ObjectGatewayEndpoint'],
					'<endpoint>'
				)}
				{@const bucketName = lodash.get(object, ['spec', 'bucketName'], '<bucket-name>')}
				{@const command = `\
TIMESTAMP=$(date -u +'%a, %d %b %Y %H:%M:%S GMT')
ACCESS_KEY=$(echo ${secret?.data?.AWS_ACCESS_KEY_ID} | base64 -d)
SECRET_KEY=$(echo ${secret?.data?.AWS_SECRET_ACCESS_KEY} | base64 -d)
SIGNATURE=$(echo -en "GET\\n\\n\\n$TIMESTAMP\\n/${bucketName}/" \\
  | openssl sha1 -hmac "$SECRET_KEY" -binary \\
  | base64)
curl -s "http://${endpoint}/${bucketName}/" \\
  -H "Date: $TIMESTAMP" \\
  -H "Authorization: AWS $ACCESS_KEY:$SIGNATURE"\
`}
				<Code.Root lang="bash" code={command} hideLines />
				<Button
					class="mt-auto w-full"
					onclick={() => {
						open = false;
					}}
				>
					Close
				</Button>
			{:catch error}
				<div class="flex flex-col gap-4 py-4">
					<div
						class="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
					>
						{lodash.get(error, 'message', 'Unknown error')}
					</div>
				</div>
			{/await}
		{:catch error}
			<div class="flex flex-col gap-4 py-4">
				<div
					class="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive"
				>
					{lodash.get(error, 'message', 'Unknown error')}
				</div>
			</div>
		{/await}
	</AlertDialog.Content>
</AlertDialog.Root>
