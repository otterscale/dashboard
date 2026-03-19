<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import type { ArtifactType } from '$lib/server/harbor';

	import Install from './install.svelte';
	import View from './view.svelte';

	let {
		cluster,
		namespace,
		chartArtifact,
		helmRepository
	}: {
		cluster: string;
		namespace: string;
		chartArtifact: ArtifactType;
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository;
	} = $props();

	let actionsOpen = $state(false);
</script>

<DropdownMenu.Root bind:open={actionsOpen}>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<div class="flex justify-end">
				<Button size="icon" variant="ghost" class="shadow-none" aria-label="Actions" {...props}>
					<Ellipsis size={16} aria-hidden="true" />
				</Button>
			</div>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<View {chartArtifact} />
			</DropdownMenu.Item>

			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Install
					{cluster}
					{namespace}
					{chartArtifact}
					{helmRepository}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
