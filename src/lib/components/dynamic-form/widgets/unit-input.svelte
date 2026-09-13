<script lang="ts" module>
	declare module '@sjsf/form' {
		interface UiOptions {
			/** Unit rendered as a trailing addon, e.g. `Mi` for `nvidia.com/gpumem`. */
			TailoredUnitInputUnit?: string;
		}
	}
</script>

<script lang="ts">
	import {
		type ComponentProps,
		Datalist,
		getFormContext,
		inputAttributes,
		retrieveUiOption
	} from '@sjsf/form';

	import * as InputGroup from '$lib/components/ui/input-group/index.js';

	const ctx = getFormContext();

	let { value = $bindable(), config, handlers }: ComponentProps['textWidget'] = $props();

	const attributes = $derived(inputAttributes(ctx, config, 'shadcn4Text', handlers, {}));
	const unit = $derived(
		retrieveUiOption(ctx, config, 'TailoredUnitInputUnit') as string | undefined
	);
</script>

<InputGroup.Root>
	<InputGroup.Input bind:value {...attributes} />
	{#if unit}
		<InputGroup.Addon align="inline-end">
			<InputGroup.Text>{unit}</InputGroup.Text>
		</InputGroup.Addon>
	{/if}
</InputGroup.Root>
<Datalist id={attributes.list} {config} />
