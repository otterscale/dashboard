<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
	import TrendingUpDownIcon from '@lucide/svelte/icons/trending-up-down';
	import type { Schema } from '@sjsf/form';
	import type { ValidateFunction } from 'ajv';
	import lodash from 'lodash';

	import Delete from '$lib/components/kind-viewer/kind-viewer-actions/default/delete.svelte';
	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import Edit from '$lib/components/kind-viewer/kind-viewer-actions/default/edit.svelte';
	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	import type { ResourceRuleVerbs } from '$lib/components/resources/types';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let {
		schema,
		validate,
		object,
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		resourceRuleVerbs
	}: {
		schema: Schema;
		validate: ValidateFunction;
		object: any; // eslint-disable-line @typescript-eslint/no-explicit-any
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		resourceRuleVerbs: ResourceRuleVerbs;
	} = $props();

	let actionsOpen = $state(false);

	function hasVerb(verbs: string[], verb: string): boolean {
		return verbs.includes('*') || verbs.includes(verb);
	}

	const resourceInstanceVerbs = $derived(
		lodash.union(
			resourceRuleVerbs.resourceVerbs ?? [],
			resourceRuleVerbs.resourceNameVerbs[object?.metadata?.name] ?? []
		)
	);

	function hasSubresourceVerb(subresource: string, verb: string): boolean {
		return hasVerb(resourceRuleVerbs.subresourceVerbs[subresource] ?? [], verb);
	}

	function hasResourceVerb(verb: string): boolean {
		return hasVerb(resourceInstanceVerbs, verb);
	}

	const canDescribe = $derived(hasResourceVerb('get'));
	const canEdit = $derived(hasResourceVerb('update') || hasResourceVerb('patch'));
	const canDelete = $derived(hasResourceVerb('delete'));

	const canLogs = $derived(hasSubresourceVerb('log', 'get'));
	const canExecute = $derived(hasSubresourceVerb('exec', 'create'));
	const canPortForward = $derived(hasSubresourceVerb('portforward', 'create'));
	const canScale = $derived(hasSubresourceVerb('scale', 'update'));

	const hasSubresourceAction = $derived(canLogs || canExecute || canPortForward || canScale);

	function notImplemented(action: string) {
		console.log('[placeholder]', action, {
			cluster,
			namespace,
			resource,
			name: object?.metadata?.name
		});
		actionsOpen = false;
	}
</script>

<DropdownMenu.Root bind:open={actionsOpen}>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<div class="flex justify-end">
				<Button
					size="icon"
					variant="ghost"
					class="shadow-none"
					aria-label="Open actions menu"
					{...props}
				>
					<EllipsisIcon size={16} aria-hidden="true" />
				</Button>
			</div>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-full">
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<View {schema} {object} />
			</DropdownMenu.Item>

			{#if canDescribe}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Describe {cluster} {namespace} {group} {version} {resource} {object} />
				</DropdownMenu.Item>
			{/if}

			{#if canEdit}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Edit
						{cluster}
						{namespace}
						{group}
						{version}
						{kind}
						{resource}
						{schema}
						{validate}
						{object}
						onOpenChangeComplete={() => {
							actionsOpen = false;
						}}
					/>
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Group>

		{#if hasSubresourceAction}
			<DropdownMenu.Separator />
			<DropdownMenu.Group>
				{#if canLogs}
					<DropdownMenu.Item onSelect={() => notImplemented('logs')}>
						<ScrollTextIcon size={16} aria-hidden="true" />
						Logs
					</DropdownMenu.Item>
				{/if}
				{#if canExecute}
					<DropdownMenu.Item onSelect={() => notImplemented('exec')}>
						<SquareTerminalIcon size={16} aria-hidden="true" />
						Terminal
					</DropdownMenu.Item>
				{/if}
				{#if canPortForward}
					<DropdownMenu.Item onSelect={() => notImplemented('port-forward')}>
						<ExternalLinkIcon size={16} aria-hidden="true" />
						Port Forward
					</DropdownMenu.Item>
				{/if}
				{#if canScale}
					<DropdownMenu.Item onSelect={() => notImplemented('scale')}>
						<TrendingUpDownIcon size={16} aria-hidden="true" />
						Scale
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Group>
		{/if}

		{#if canDelete}
			<DropdownMenu.Separator />
			<DropdownMenu.Group>
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Delete
						{schema}
						{object}
						{cluster}
						{namespace}
						{group}
						{version}
						{kind}
						{resource}
						onOpenChangeComplete={() => {
							actionsOpen = false;
						}}
					/>
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
