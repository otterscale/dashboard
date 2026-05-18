<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/radio';

	import type { RadioGroupItemProps, RadioGroupRootProps, WithoutChildrenOrChild } from 'bits-ui';

	import { Label } from '$lib/components/ui/label/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';

	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredRadioGroup?: WithoutChildrenOrChild<RadioGroupRootProps>;
			TailoredRadioItem?: Omit<WithoutChildrenOrChild<RadioGroupItemProps>, 'value'>;
			TailoredRadioLabelGetter?: (label: string) => string;
		}
	}
</script>

<script lang="ts">
	import {
		ariaInvalidProp,
		type ComponentProps,
		composeProps,
		customInputAttributes,
		getFormContext,
		retrieveUiOption,
		uiOptionProps
	} from '@sjsf/form';
	import { idMapper, singleOption } from '@sjsf/form/options.svelte';

	const ctx = getFormContext();

	let {
		config,
		handlers,
		value = $bindable(),
		options,
		mapped = singleOption({
			mapper: () => idMapper(options),
			value: () => value,
			update: (v) => (value = v)
		})
	}: ComponentProps['radioWidget'] = $props();

	const attributes = $derived(
		customInputAttributes(ctx, config, 'TailoredRadioGroup', {
			onValueChange: handlers.onchange
		})
	);

	const itemAttributes = $derived(
		composeProps(
			ctx,
			config,
			{
				onclick: handlers.oninput,
				onblur: handlers.onblur
			},
			uiOptionProps('TailoredRadioItem'),
			ariaInvalidProp
		)
	);

	const getLabel = $derived(
		retrieveUiOption(ctx, config, 'TailoredRadioLabelGetter') as (
			label: string
		) => string | undefined
	);
</script>

<RadioGroup.Root bind:value={mapped.current} {...attributes}>
	{#each options as option (option.id)}
		<div class="flex items-center space-x-3">
			<RadioGroup.Item
				{...itemAttributes}
				value={option.mappedValue ?? option.id}
				id={option.id}
				disabled={option.disabled}
			/>
			<Label for={option.id}>{getLabel?.(option.label) ?? option.label}</Label>
		</div>
	{/each}
</RadioGroup.Root>
