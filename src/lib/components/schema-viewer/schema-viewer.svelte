<script lang="ts">
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as HoverCard from '$lib/components/ui/hover-card/index.js';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils';

	let { schema: jsonSchema, class: className }: { schema: any; class?: string } = $props();

	let path: string[] = $state([]);
	function navigateTo(key: string) {
		path = [...path, key];
	}
	function navigateToIndex(index: number) {
		path = index < 0 ? [] : path.slice(0, index + 1);
	}

	const currentSchema = $derived.by(() => {
		if (!path) return null;

		let node = jsonSchema;
		for (const segment of path) {
			if (node?.properties?.[segment]) {
				node = node.properties[segment];
			} else if (node?.items?.properties?.[segment]) {
				node = node.items.properties[segment];
			} else {
				return null;
			}
		}
		return node;
	});
	const entries = $derived.by(() => {
		if (!currentSchema) return [];

		const properties = currentSchema.properties ?? currentSchema.items?.properties;
		if (!properties) return [];
		const required = new Set(currentSchema.required ?? currentSchema.items?.required ?? []);

		return Object.entries(properties).map(([property, propertySchema]: [string, any]) => {
			const hasChildren = !!(propertySchema.properties || propertySchema.items?.properties);
			return {
				key: property,
				description: propertySchema.description ?? '',
				type: resolveType(propertySchema),
				required: required.has(property),
				hasChildren,
				schema: propertySchema
			};
		});
	});

	function resolveType(schema: any): string {
		if (schema.type && schema.format) return `${schema.type} | ${schema.format}`;
		if (schema.type) return schema.type;
		return 'unknown';
	}

	function getConstraints(schema: any): object {
		const excludedProperties = ['description', 'required', 'type', 'format', 'properties', 'items'];
		const constraitns = Object.fromEntries(
			Object.entries(schema).filter(([key]) => !excludedProperties.includes(key))
		);
		return constraitns;
	}
</script>

<main class={cn('space-y-4', className)}>
	<!-- Breadcrumb Navigation -->
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				{#if path.length > 0}
					<Breadcrumb.Link
						href="#"
						onclick={(e) => {
							e.preventDefault();
							navigateToIndex(-1);
						}}
					>
						root
					</Breadcrumb.Link>
				{:else}
					<Breadcrumb.Page>root</Breadcrumb.Page>
				{/if}
			</Breadcrumb.Item>

			{#each path as segment, indedx (indedx)}
				<Breadcrumb.Separator />
				<Breadcrumb.Item>
					{#if indedx < path.length - 1}
						<Breadcrumb.Link
							href="#"
							onclick={(e) => {
								e.preventDefault();
								navigateToIndex(indedx);
							}}
						>
							{segment}
						</Breadcrumb.Link>
					{:else}
						<Breadcrumb.Page>{segment}</Breadcrumb.Page>
					{/if}
				</Breadcrumb.Item>
			{/each}
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<!-- Current Node Description -->
	{#if currentSchema?.description}
		<p class="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
			{currentSchema.description}
		</p>
	{/if}

	<!-- Properties List -->
	{#if entries.length > 0}
		<div class="divide-y divide-border rounded-lg border">
			{#each entries as entry}
				{@const constraints = getConstraints(entry.schema)}
				<Button
					class="h-full w-full rounded-none border-none text-start shadow-none first:rounded-t-lg last:rounded-b-lg"
					variant="ghost"
					onclick={() => navigateTo(entry.key)}
				>
					<Item.Root class="h-full w-full p-0">
						<Item.Content>
							<Item.Title>
								{entry.key}
							</Item.Title>
							<Item.Description>
								{entry.description}
							</Item.Description>
							{#if Object.keys(constraints).length > 0}
								<div class="flex flex-wrap gap-1">
									{#each Object.entries(constraints) as [key, value]}
										<HoverCard.Root>
											<HoverCard.Trigger>
												<Badge variant="outline">
													{#if typeof value === 'object' || !String(value)}
														{key}
													{:else}
														{`${key}: ${value}`}
													{/if}
												</Badge>
											</HoverCard.Trigger>
											<HoverCard.Content class="max-h-[38vh] w-fit max-w-[62vw] overflow-auto">
												<Item.Root class="h-full w-full p-0">
													<Item.Content class="space-y-2 text-xs">
														<Item.Title class="font-medium text-muted-foreground">
															{key}
														</Item.Title>
														<pre><code>{stringify(value, null, 2)}</code></pre>
													</Item.Content>
												</Item.Root>
											</HoverCard.Content>
										</HoverCard.Root>
									{/each}
								</div>
							{/if}
						</Item.Content>
						<Item.Actions>
							<Badge variant="secondary">
								{entry.type}
							</Badge>
							{#if entry.required}
								<Badge variant="destructive">required</Badge>
							{/if}
						</Item.Actions>
					</Item.Root>
				</Button>
			{/each}
		</div>
	{:else if currentSchema}
		<Code.Root
			class="h-fit w-full"
			lang="yaml"
			code={stringify(currentSchema, null, 2)}
			hideLines
		/>
	{/if}
</main>
