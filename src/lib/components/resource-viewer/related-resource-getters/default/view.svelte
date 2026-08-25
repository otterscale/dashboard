<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';

	import * as Field from '$lib/components/ui/field/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';

	import RelatedResources from '../../related-resources.svelte';
	import ResourceConditions from '../../resource-conditions.svelte';
	import ResourceEvents from '../../resource-events.svelte';
	import type { RelatedResource } from '../../types';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		namespace,
		name,
		object,
		relatedResources = []
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		namespace: string;
		name: string;
		object: JsonObject;
		relatedResources?: RelatedResource[];
	} = $props();
</script>

<Field.Group class="space-y-4 *:gap-4">
	<Field.Set>
		<Tabs.Root value="related-resource" class="w-full">
			<Tabs.List>
				<Tabs.Trigger value="related-resource">Related Resource</Tabs.Trigger>
				<Tabs.Trigger value="event">Event</Tabs.Trigger>
				<Tabs.Trigger value="condition">Condition</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="related-resource">
				<RelatedResources {group} {version} {kind} {resource} {namespace} {name} {relatedResources} />
			</Tabs.Content>
			<Tabs.Content value="event">
				<ResourceEvents {cluster} {namespace} {kind} {name} />
			</Tabs.Content>
			<Tabs.Content value="condition">
				<ResourceConditions {object} />
			</Tabs.Content>
		</Tabs.Root>
	</Field.Set>
</Field.Group>
