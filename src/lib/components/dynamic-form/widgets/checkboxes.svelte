<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/checkboxes';

	import type { CheckboxRootProps as CheckboxProps } from 'bits-ui';

	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredCheckboxes?: CheckboxProps;
		}
	}
</script>

<script lang="ts">
	import {
		type ComponentProps,
		customInputAttributes,
		getFormContext,
		getId,
		handlersAttachment
	} from '@sjsf/form';
	import { idMapper, multipleOptions } from '@sjsf/form/options.svelte';

	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import * as Item from '$lib/components/ui/item';
	import Label from '$lib/components/ui/label/label.svelte';

	const ctx = getFormContext();

	let {
		value = $bindable(),
		options,
		config,
		handlers
	}: ComponentProps['checkboxesWidget'] = $props();

	const mapped = multipleOptions({
		mapper: () => idMapper(options),
		value: () => value,
		update: (v) => (value = v)
	});
	const selected = $derived(new Set(mapped.current));

	const { oninput, onchange, ...buttonHandlers } = $derived(handlers);

	const id = $derived(getId(ctx, config.path));

	const attributes = $derived(
		customInputAttributes(
			ctx,
			config,
			'TailoredCheckboxes',
			handlersAttachment(buttonHandlers)({
				...handlers,
				name: id,
				required: config.required
			})
		)
	);
</script>

{#each options as option (option.id)}
	{@const optionValue: any = option?.value}
	<div class="flex items-center space-x-3">
		<Checkbox
			checked={selected.has(option.id)}
			value={option.id}
			onCheckedChange={(v) => {
				mapped.current = v
					? mapped.current.concat(option.id)
					: mapped.current.filter((id) => id !== option.id);
				oninput?.();
				onchange?.();
			}}
			{...attributes}
			id={option.id}
			disabled={option.disabled || attributes.disabled || optionValue.disabled}
		/>
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title>
					<Label for={option.id}>{optionValue.label}</Label>
				</Item.Title>
				<Item.Description>
					{optionValue.description}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</div>
{/each}
