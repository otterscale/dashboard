<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import * as Field from '$lib/components/ui/field/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	import RelatedResources from '../../related-resources.svelte';
	import type { RelatedResource } from '../../types';

	let {
		group,
		version,
		kind,
		resource,
		namespace,
		name,
		object,
		relatedResources = []
	}: {
		group: string;
		version: string;
		kind: string;
		resource: string;
		name: string;
		namespace: string;
		object: JsonObject;
		relatedResources?: RelatedResource[];
	} = $props();
</script>

<Field.Group class="space-y-4 *:gap-4 *:not-has-[*]:hidden">
	<Field.Set>
		{@const entries = Object.entries(object).filter(
			([key]) => key !== 'apiVersion' && key !== 'kind'
		)}
		{@const [firstEntry] = entries}
		{@const [firstKey] = firstEntry}
		<Tabs.Root value={firstKey} class="w-full">
			<Tabs.List>
				{#each entries as [key] (key)}
					<Tabs.Trigger value={key}>{key}</Tabs.Trigger>
				{/each}
			</Tabs.List>
			{#each entries as [key, value] (key)}
				<Tabs.Content value={key}>
					<Code.Root
						code={stringify(value)}
						lang="yaml"
						class="no-shiki-limit max-h-[50vh] overflow-y-auto border-none bg-muted"
					>
						<Code.CopyButton />
					</Code.Root>
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	</Field.Set>
	<Field.Set>
		<RelatedResources {group} {version} {kind} {resource} {namespace} {name} {relatedResources} />
	</Field.Set>
</Field.Group>
