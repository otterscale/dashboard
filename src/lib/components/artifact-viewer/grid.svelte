<script lang="ts">
	import Icon from '@iconify/svelte';
	import { BookmarkIcon, DownloadIcon, TagsIcon } from '@lucide/svelte';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item/index.ts';

	import type { ArtifactType } from './types.d.ts';

	let { artifact }: { artifact: ArtifactType } = $props();
</script>

<Card.Root>
	{@const extraAttributes = artifact.extra_attrs ?? {}}
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media>
				<Avatar.Root>
					<Avatar.Image src={extraAttributes.icon as string} alt="helm" />
					<Avatar.Fallback>
						<Icon icon="logos:helm" />
					</Avatar.Fallback>
				</Avatar.Root>
			</Item.Media>
			<Item.Content class="text-left">
				<Item.Title>
					{@const title = [artifact.repository_name, extraAttributes.name]
						.filter((term) => !!term)
						.join(' ')}
					{title}
				</Item.Title>
				<Item.Description class="max-w-40  truncate">
					{artifact.digest}
				</Item.Description>
			</Item.Content>
			{#if artifact.type === 'CHART'}
				<Item.Actions>
					<Button variant="ghost" size="icon">
						<DownloadIcon />
					</Button>
				</Item.Actions>
			{/if}
		</Item.Root>
	</Card.Header>
	<Card.Content>
		{#if artifact.type === 'CHART'}
			<Item.Root class="col-span-2 items-start p-0">
				<Item.Content class="text-left">
					<Item.Description>
						{extraAttributes.description}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{:else if artifact.type === 'IMAGE'}
			<Item.Root class="items-start p-0">
				<Item.Content class="text-left">
					{@const system = `${extraAttributes.architecture}/${extraAttributes.os}`}
					<Item.Description>{system}</Item.Description>
				</Item.Content>
				<Item.Content class="text-left">
					<Item.Description>{extraAttributes.author}</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
	<Card.Footer class="flex gap-1 overflow-hidden text-xs text-gray-500">
		{@const labels = artifact.labels ?? []}
		{@const tags = artifact.tags ?? []}
		{#each labels as label, index (index)}
			<BookmarkIcon size={12} />
			{label.name}
		{/each}
		{#each tags as tag, index (index)}
			<TagsIcon size={12} />
			{tag.name}
		{/each}
	</Card.Footer>
</Card.Root>
