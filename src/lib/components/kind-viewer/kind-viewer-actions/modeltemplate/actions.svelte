<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { ValidateFunction } from 'ajv';

	import { page } from '$app/state';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	import Configure, { type ConfigureAction } from './configure.svelte';
	import { isAvailable as isDeployAvailable } from './deploy.svelte';

	/**
	 * Actions of one model entry, shared by its table row and its card. Each
	 * one first opens the picker that narrows the entry's deployment templates
	 * down to one, then hands that template to View, Copy or Deploy.
	 */
	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		schema,
		validate,
		object
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		validate: ValidateFunction;
		/** The model entry; its deployment templates are listed when an action opens. */
		object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
	} = $props();
	// The entry's own namespace is read off the object; only the write target matters here.
	// svelte-ignore state_referenced_locally
	void namespace;

	// Templates live in otterscale-system; copies and deployments go to the workspace.
	const targetNamespace = $derived(page.data.namespace as string);

	let configureAction: ConfigureAction = $state('view');
	let configureOpen = $state(false);

	function configure(action: ConfigureAction) {
		configureAction = action;
		configureOpen = true;
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<div class="flex justify-end">
				<Button size="icon" variant="ghost" class="shadow-none" aria-label="Actions" {...props}>
					<EllipsisIcon size={16} aria-hidden="true" />
				</Button>
			</div>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-full">
		<DropdownMenu.Group>
			<DropdownMenu.Label>Inspect</DropdownMenu.Label>
			<DropdownMenu.Item onSelect={() => configure('view')}>
				<EyeIcon />
				View
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Label>Manage</DropdownMenu.Label>
			<DropdownMenu.Item onSelect={() => configure('deploy')} disabled={!isDeployAvailable}>
				<RocketIcon />
				Deploy
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={() => configure('copy')}>
				<PlusIcon />
				Copy
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<Configure
	bind:open={configureOpen}
	action={configureAction}
	{cluster}
	namespace={targetNamespace}
	{group}
	{version}
	{kind}
	{resource}
	{schema}
	{validate}
	entry={object}
/>
