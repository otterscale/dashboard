<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import BanIcon from '@lucide/svelte/icons/ban';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import {
		type APIResource,
		type DiscoveryRequest,
		ResourceService
	} from '@otterscale/api/resource/v1';
	import lodash from 'lodash';
	import { getContext, onMount } from 'svelte';

	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import KindViewer from '$lib/components/kind-viewer/kind-viewer.svelte';
	import type {
		ResourceIdentifier,
		ResourceRule,
		ResourceRuleVerbs,
		ResourceRuleVerbsByGroupResource
	} from '$lib/components/resources/types';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	const shortcutIdentifiers: { group: string; resource: string }[] = [
		{ group: 'apps', resource: 'deployments' },
		{ group: 'apps', resource: 'statefulsets' },
		{ group: 'apps', resource: 'daemonsets' },
		{ group: 'batch', resource: 'jobs' },
		{ group: '', resource: 'pods' },
		{ group: 'gateway.networking.k8s.io', resource: 'gateways' },
		{ group: '', resource: 'services' },
		{ group: 'networking.k8s.io', resource: 'networkpolicies' },
		{ group: 'storage.k8s.io', resource: 'storageclasses' },
		{ group: '', resource: 'persistentvolumeclaims' },
		{ group: '', resource: 'configmaps' },
		{ group: '', resource: 'secrets' }
	];

	function matchesGroup(resourceRule: ResourceRule, group: string): boolean {
		if (!resourceRule.apiGroups) return false;

		for (const apiGroup of resourceRule.apiGroups) {
			if (apiGroup === '*') return true;
			if (apiGroup === group) return true;
		}

		return false;
	}

	function matchesResource(resourceRule: ResourceRule, resource: string): boolean {
		if (!resourceRule.resources) return false;

		const [mainResource, subresource = ''] = resource.split('/');

		for (const resourceRuleResource of resourceRule.resources) {
			if (resourceRuleResource === '*') return true;
			if (resourceRuleResource === resource) return true;

			if (subresource === '') continue;
			if (resourceRuleResource === `*/${subresource}`) return true;
			if (resourceRuleResource === `${mainResource}/*`) return true;
		}

		return false;
	}

	function createResourceRuleVerbs(): ResourceRuleVerbs {
		return { resourceVerbs: [], subresourceVerbs: {}, resourceNameVerbs: {} };
	}

	const EMPTY_RESOURCE_RULE_VERBS: ResourceRuleVerbs = Object.freeze(createResourceRuleVerbs());

	function buildVerbsMap(
		apiResources: APIResource[],
		resourceRules: ResourceRule[]
	): ResourceRuleVerbsByGroupResource {
		const map: ResourceRuleVerbsByGroupResource = {};

		for (const apiResource of apiResources) {
			const matchedResourceRules = resourceRules.filter(
				(resourceRule) =>
					matchesGroup(resourceRule, apiResource.group) &&
					matchesResource(resourceRule, apiResource.resource)
			);

			if (matchedResourceRules.length === 0) continue;

			const resourceVerbs: string[] = [];
			const resourceNameVerbs: Record<string, string[]> = {};

			for (const resourceRule of matchedResourceRules) {
				const resourceNames = resourceRule.resourceNames ?? [];

				if (resourceNames.length === 0) {
					resourceVerbs.push(...resourceRule.verbs);
					continue;
				}

				for (const resourceName of resourceNames) {
					resourceNameVerbs[resourceName] = [
						...(resourceNameVerbs[resourceName] ?? []),
						...resourceRule.verbs
					];
				}
			}

			if (resourceVerbs.length === 0 && Object.keys(resourceNameVerbs).length === 0) continue;

			const [mainResource, subresource = ''] = apiResource.resource.split('/');

			if (!map[apiResource.group]) {
				map[apiResource.group] = {};
			}
			if (!map[apiResource.group][mainResource]) {
				map[apiResource.group][mainResource] = createResourceRuleVerbs();
			}

			const entry = map[apiResource.group][mainResource];

			if (subresource === '') {
				entry.resourceVerbs = lodash.uniq(resourceVerbs).sort();
				entry.resourceNameVerbs = lodash.mapValues(resourceNameVerbs, (values) =>
					lodash.uniq(values).sort()
				);
			} else {
				entry.subresourceVerbs[subresource] = lodash.uniq(resourceVerbs).sort();
			}
		}

		return map;
	}

	function getAPIResourceByGroupVersionResource(
		apiResources: APIResource[],
		identifier: ResourceIdentifier
	): APIResource | undefined {
		return apiResources.find(
			(apiResource) =>
				apiResource.group === identifier.group &&
				apiResource.version === identifier.version &&
				apiResource.resource === identifier.resource
		);
	}

	const cluster = $derived(page.params.cluster ?? '');

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	let apiResources = $state<APIResource[]>([]);
	let isLoaded = $state(false);
	let hasError = $state(false);
	let loadError = $state<{ name?: string; rawMessage?: string } | undefined>(undefined);

	const identifier = $derived({
		group: page.url.searchParams.get('group') ?? '',
		version: page.url.searchParams.get('version') ?? '',
		kind: page.url.searchParams.get('kind') ?? '',
		resource: page.url.searchParams.get('resource') ?? ''
	});

	const selectedAPIResource = $derived.by(() => {
		if (apiResources.length === 0) return undefined;

		if (identifier.resource || identifier.kind) {
			const matched = apiResources.find(
				(apiResource) =>
					apiResource.group === identifier.group &&
					(identifier.version === '' || apiResource.version === identifier.version) &&
					(identifier.resource
						? apiResource.resource === identifier.resource
						: apiResource.kind === identifier.kind)
			);
			if (matched) return matched;
		}

		return (
			getAPIResourceByGroupVersionResource(apiResources, {
				resource: 'pods',
				group: '',
				version: 'v1'
			}) ?? apiResources.find((apiResource) => !apiResource.resource.includes('/'))
		);
	});

	function selectAPIResource(apiResource: APIResource, replaceState = false): void {
		const url = new URL(page.url);
		url.searchParams.set('group', apiResource.group);
		url.searchParams.set('version', apiResource.version);
		url.searchParams.set('kind', apiResource.kind);
		url.searchParams.set('resource', apiResource.resource);

		if (url.href === page.url.href) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, { replaceState, keepFocus: true, noScroll: true, invalidateAll: false });
	}

	const groupedMainAPIResources = $derived(
		lodash.groupBy(
			apiResources.filter((apiResource) => !apiResource.resource.includes('/')),
			(apiResource) => apiResource.group
		)
	);

	const shortcuts = $derived(
		shortcutIdentifiers.flatMap((shortcutIdentifier) => {
			const apiResource = apiResources.find(
				(candidate) =>
					candidate.group === shortcutIdentifier.group &&
					candidate.resource === shortcutIdentifier.resource
			);
			return apiResource ? [apiResource] : [];
		})
	);

	const resourceRules = $derived<ResourceRule[]>(
		page.data.selfsubjectrulesreviewStatus?.resourceRules ?? []
	);
	const resourceRuleVerbsMap = $derived(buildVerbsMap(apiResources, resourceRules));

	const selectedResourceRuleVerbs = $derived(
		selectedAPIResource
			? (resourceRuleVerbsMap[selectedAPIResource.group]?.[selectedAPIResource.resource] ??
					EMPTY_RESOURCE_RULE_VERBS)
			: EMPTY_RESOURCE_RULE_VERBS
	);

	async function fetchAPIResources(cluster: string): Promise<APIResource[]> {
		const response = await client.discovery({ cluster } as DiscoveryRequest);
		return response.apiResources;
	}

	onMount(async () => {
		try {
			apiResources = await fetchAPIResources(cluster);

			// Reflect the resolved default selection in the URL so it is shareable.
			if (!identifier.resource && !identifier.kind && selectedAPIResource) {
				selectAPIResource(selectedAPIResource, true);
			}
		} catch (error) {
			hasError = true;
			loadError = error as typeof loadError;
		} finally {
			isLoaded = true;
		}
	});
</script>

{#if !isLoaded}
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
{:else if hasError}
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
				<Alert.Title class="font-bold">{loadError?.name}</Alert.Title>
				<Alert.Description class="text-start">
					{loadError?.rawMessage}
				</Alert.Description>
			</Alert.Root>
			<div class="flex gap-4">
				<Button variant="outline" onclick={() => history.back()}>Go Back</Button>
				<Button href="/">Go Home</Button>
			</div>
		</Empty.Content>
	</Empty.Root>
{:else}
	<div class="flex flex-col space-y-4 pb-8">
		<div class="flex items-end justify-between gap-4">
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">
						{selectedAPIResource?.kind}
					</Item.Title>
					<Item.Description class="text-base">
						{selectedAPIResource?.group || 'core'}/{selectedAPIResource?.version}
					</Item.Description>
				</Item.Content>
				<Item.Actions>
					<Popover.Root>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" class="justify-between">
									<ChevronsUpDownIcon class="opacity-50" />
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content
							class="grid h-[50vh] w-full min-w-2xl grid-cols-[0.6fr_0_1fr] gap-2 p-2"
							align="end"
						>
							<Command.Root class="h-full min-w-0">
								<Command.List class="h-full max-h-none">
									<Command.Group>
										{#each shortcuts as shortcut (`${shortcut.group}/${shortcut.version}/${shortcut.resource}`)}
											<Command.Item
												value={`${shortcut.group}/${shortcut.version}/${shortcut.resource}`}
												onSelect={() => selectAPIResource(shortcut)}
											>
												<Item.Root class="p-0" size="sm">
													<Item.Content>
														<Item.Title>{shortcut.kind}</Item.Title>
														<Item.Description>
															{shortcut.group || 'core'}
														</Item.Description>
													</Item.Content>
												</Item.Root>
											</Command.Item>
										{/each}
									</Command.Group>
								</Command.List>
							</Command.Root>
							<Separator orientation="vertical" />
							<Command.Root class="h-full min-w-0">
								<Command.Input placeholder="Search resource..." />
								<Command.List class="h-full max-h-none">
									<Command.Empty>No resource found.</Command.Empty>
									{#each Object.entries(groupedMainAPIResources) as [group, groupAPIResources] (group)}
										<Command.Group heading={group || 'core'}>
											<Command.Separator />
											{#each groupAPIResources as apiResource (`${apiResource.group}/${apiResource.version}/${apiResource.resource}`)}
												<Command.Item
													value={`${apiResource.group}/${apiResource.version}/${apiResource.resource}`}
													onSelect={() => selectAPIResource(apiResource)}
												>
													{apiResource.resource}
													<Command.Shortcut>
														{apiResource.version}
													</Command.Shortcut>
												</Command.Item>
											{/each}
										</Command.Group>
									{/each}
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
				</Item.Actions>
			</Item.Root>
		</div>
		{#if selectedAPIResource}
			{#key `${selectedAPIResource.group}/${selectedAPIResource.version}/${selectedAPIResource.resource}`}
				<KindViewer
					isClusterAdmin={true}
					resourceRuleVerbs={selectedResourceRuleVerbs}
					{cluster}
					apiResource={selectedAPIResource}
				/>
			{/key}
		{/if}
	</div>
{/if}
