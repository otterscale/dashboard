<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/checkboxes';

	import type { SchemaValue } from '@sjsf/form/core';
	import type { CheckboxRootProps as CheckboxProps } from 'bits-ui';
	import type { Snippet } from 'svelte';

	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredCheckboxes?: CheckboxProps;
			TailoredCheckboxesIsDisabledInvisible?: boolean;
			TailoredCheckboxesTemplate?: Snippet<[{ optionValue: SchemaValue }]>;
		}
	}
</script>

<script lang="ts">
	import {
		type ComponentProps,
		customInputAttributes,
		getFormContext,
		getId,
		handlersAttachment,
		retrieveUiOption
	} from '@sjsf/form';
	import { idMapper, multipleOptions } from '@sjsf/form/options.svelte';

	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';

	const ctx = getFormContext();

	let {
		value = $bindable(),
		options,
		config,
		handlers
	}: ComponentProps['checkboxesWidget'] = $props();

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

	const isDisabledInvisible = $derived(
		retrieveUiOption(ctx, config, 'TailoredCheckboxesIsDisabledInvisible')
	) as boolean;
	const template = $derived(retrieveUiOption(ctx, config, 'TailoredCheckboxesTemplate')) as Snippet<
		[{ optionValue: SchemaValue; disabled: boolean }]
	>;

	const mapped = multipleOptions({
		mapper: () => idMapper(options),
		value: () => value,
		update: (v) => (value = v)
	});

	const selected = $derived(new Set(mapped.current));
</script>

{#each options as option (option.id)}
	{@const optionValue: any = option?.value}
	{@const disabled = optionValue.disabled || attributes.disabled}
	{@const isInvisible = isDisabledInvisible && isDisabledInvisible === true && disabled}
	{#if !isInvisible}
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
				{disabled}
			/>
			{@render template({ optionValue, disabled })}
		</div>
	{/if}
{/each}
