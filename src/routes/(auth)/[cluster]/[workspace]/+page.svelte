<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import BanIcon from '@lucide/svelte/icons/ban';
	import {
		type APIResource,
		type DiscoveryRequest,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import type { CoreV1Service } from '@otterscale/types';
	import { getContext } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import KindViewer from '$lib/components/kind-viewer/kind-viewer.svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { breadcrumbs } from '$lib/stores';

	$effect(() => {
		// Set breadcrumbs navigation
		breadcrumbs.set([
			{
				title: page.url.searchParams.get('kind') ?? 'Resource',
				url: resolve('/(auth)/[cluster]/[workspace]', {
					cluster: page.params.cluster!,
					workspace: page.params.workspace!
				})
			}
		]);
	});

	const isClusterAdmin = $derived(page.data.isClusterAdmin === true);
	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(page.data.namespace ?? '');
	const group = $derived(page.url.searchParams.get('group') ?? '');
	const version = $derived(page.url.searchParams.get('version') ?? '');
	const kind = $derived(page.url.searchParams.get('kind') ?? '');
	const resource = $derived(page.url.searchParams.get('resource') ?? '');

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	let apiResources = $state<APIResource[]>([]);
	async function fetchAPIResources(cluster: string, group: string, version: string, kind: string) {
		const response = await client.discovery({
			cluster: cluster
		} as DiscoveryRequest);

		apiResources = response.apiResources.filter(
			(apiResource) =>
				apiResource &&
				apiResource.group === group &&
				apiResource.version === version &&
				apiResource.kind === kind
		);
		return apiResources;
	}

	async function fetchServiceUrl(kind: string) {
		const serviceGatewayResponse = await client.get({
			cluster,
			namespace: 'istio-ingress',
			name: 'gateway-istio',
			group: '',
			version: 'v1',
			resource: 'services'
		});

		const serviceGateway = serviceGatewayResponse.object as CoreV1Service;

		const [externalIP] = serviceGateway.spec?.externalIPs ?? [''];

		if (kind === 'ModelService') {
			const modelGatewayResponse = await client.get({
				cluster,
				namespace: 'llm-d',
				name: 'llm-d-infra-inference-gateway-istio',
				group: '',
				version: 'v1',
				resource: 'services'
			});
			const modelGateway = modelGatewayResponse.object as CoreV1Service;
			const port = modelGateway?.spec?.ports?.find((port) => port.name === 'default');
			return `${externalIP}:${port?.port}`;
		}
		return externalIP;
	}
</script>

{#key cluster + group + version + kind}
	{#await fetchAPIResources(cluster, group, version, kind)}
		<div class="flex flex-col gap-4 pt-1">
			<Skeleton class="h-6 w-32" />
			<Skeleton class="h-4 w-64" />
			<Skeleton class="h-8 w-full" />
			<Skeleton class="h-144 w-full" />
			<div class="flex items-center justify-between">
				<Skeleton class="h-8 w-36" />
				<div class="flex items-center gap-4">
					<Skeleton class="h-8 w-24" />
					<Skeleton class="h-8 w-48" />
				</div>
			</div>
		</div>
	{:then apiResources}
		<div class="space-y-4">
			<div class="flex items-end justify-between gap-4">
				<Item.Root class="p-0">
					<Item.Content class="text-left">
						<Item.Title class="text-xl font-bold">
							{kind}
						</Item.Title>
						{#await fetchServiceUrl(kind) then serviceUrl}
							{#if serviceUrl}
								<Item.Description class="text-base">
									Available at {serviceUrl}
								</Item.Description>
							{/if}
						{/await}
					</Item.Content>
				</Item.Root>
			</div>
			{#key resource + namespace}
				{@const apiResource = apiResources.find(
					(apiResource) =>
						apiResource &&
						apiResource.group === group &&
						apiResource.version === version &&
						apiResource.kind === kind &&
						apiResource.resource === resource
				)}
				{#if apiResource}
					<KindViewer {isClusterAdmin} {cluster} {namespace} {apiResource} />
				{/if}
			{/key}
		</div>
	{:catch error}
		<Empty.Root>
			<Empty.Header>
				<Empty.Media class="rounded-full bg-muted p-4">
					<BanIcon class="size-8" />
				</Empty.Media>
				<Empty.Title class="text-2xl font-bold">Failed to load data</Empty.Title>
				<Empty.Description>
					An error occurred while fetching data. Please check your connection or try again later.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Alert.Root variant="destructive" class="border-none bg-destructive/5">
					<Alert.Title class="font-bold">{error?.name}</Alert.Title>
					<Alert.Description class="text-start">
						{error?.rawMessage}
					</Alert.Description>
				</Alert.Root>
				<div class="flex gap-4">
					<Button variant="outline" onclick={() => history.back()}>Go Back</Button>
					<Button href="/">Go Home</Button>
				</div>
			</Empty.Content>
		</Empty.Root>
	{/await}
{/key}
