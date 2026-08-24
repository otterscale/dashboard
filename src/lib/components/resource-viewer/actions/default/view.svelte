<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import Braces from '@lucide/svelte/icons/braces';
	import File from '@lucide/svelte/icons/file';
	import type { Schema } from 'ajv';
	import lodash from 'lodash';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let { object, schema }: { object: JsonObject; schema: Schema } = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Sheet.Root>
				<Sheet.Trigger>
					<Button {...props} variant="ghost">
						<File />
					</Button>
				</Sheet.Trigger>
				<Sheet.Content
					side="right"
					class="flex h-full max-w-[62vw] min-w-[50vw] flex-col gap-0 overflow-y-auto p-4"
				>
					<Sheet.Header class="shruk-0 space-y-4">
						{@const [groupVersionKind] = lodash.get(schema, ['x-kubernetes-group-version-kind'])}
						{@const group = lodash.get(groupVersionKind, 'group')}
						{@const version = lodash.get(groupVersionKind, 'version')}
						{@const kind = lodash.get(groupVersionKind, 'kind')}
						{@const description = lodash.get(schema, ['description'])}
						<Sheet.Title>
							<Item.Root class="p-0">
								<Item.Content>
									<Item.Title class="text-lg">
										{name}
									</Item.Title>
									<Item.Description>
										{group}/{version}
										{kind}
									</Item.Description>
								</Item.Content>
							</Item.Root>
						</Sheet.Title>
						<Sheet.Description>{description}</Sheet.Description>
					</Sheet.Header>
					{#if object}
						<Code.Root
							code={stringify(object)}
							lang="yaml"
							class="no-shiki-limit m-4 border-none bg-muted"
						>
							<Code.CopyButton />
						</Code.Root>
					{:else}
						<Empty.Root class="m-4 bg-muted/50">
							<Empty.Header>
								<Empty.Media variant="icon">
									<Braces size={36} />
								</Empty.Media>
								<Empty.Title>No Data</Empty.Title>
								<Empty.Description>
									No data is currently available for this resource.
									<br />
									To populate this resource, please add properties or values through the resource editor.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content></Empty.Content>
						</Empty.Root>
					{/if}
				</Sheet.Content>
			</Sheet.Root>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>View</Tooltip.Content>
</Tooltip.Root>
