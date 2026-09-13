<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/multi-select';

	import type { Command as CommandType } from 'bits-ui';

	import type { ButtonProps } from '$lib/components/ui/button/button.svelte';

	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredMultiComboboxVisibility?: number;
			TailoredMultiComboboxTrigger?: ButtonProps;
			TailoredMultiComboboxInput?: CommandType.InputProps;
			TailoredMultiComboboxEmptyText?: string;
		}
	}
</script>

<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchXIcon from '@lucide/svelte/icons/search-x';
	import {
		ariaInvalidProp,
		type ComponentProps,
		composeProps,
		disabledProp,
		getFormContext,
		handlersAttachment,
		inputAttributes,
		retrieveUiOption,
		uiOptionProps
	} from '@sjsf/form';
	import { idMapper, multipleOptions } from '@sjsf/form/options.svelte';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';

	const ctx = getFormContext();

	let {
		value = $bindable(),
		config,
		handlers,
		options,
		mapped = multipleOptions({
			mapper: () => idMapper(options),
			value: () => value,
			update: (v) => (value = v)
		})
	}: ComponentProps['multiSelectWidget'] = $props();
	const { oninput, onchange, ...buttonHandlers } = $derived(handlers);

	let filterValue = $state('');

	const visibility: number = $derived(
		retrieveUiOption(ctx, config, 'TailoredMultiComboboxVisibility') as number
	);
	let visibleOptions = $derived(visibility);
	const filteredOptions = $derived(options.filter((option) => option.label.includes(filterValue)));

	let open = $state(false);
	$effect(() => {
		if (open === false) {
			filterValue = '';
			visibleOptions = visibility;
		}
	});

	const attributes = $derived(
		inputAttributes(ctx, config, 'TailoredMultiComboboxInput', handlers, {})
	);
	const emptyText = $derived(retrieveUiOption(ctx, config, 'TailoredMultiComboboxEmptyText'));
	const popoverClass = 'w-[var(--bits-popover-anchor-width)] min-w-xs';

	const selectedIds = $derived(new Set(mapped.current));
	const triggerContent = $derived(
		options
			.filter((option) => selectedIds.has(option.id))
			.map((option) => option.label)
			.join(', ')
	);

	// Selection toggles in place and the popover stays open so several
	// options can be picked in one pass.
	function toggle(id: string) {
		mapped.current = mapped.current.includes(id)
			? mapped.current.filter((current) => current !== id)
			: [...mapped.current, id];
		oninput?.();
		onchange?.();
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger class="w-full justify-between" {...disabledProp({}, config, ctx)}>
		{#snippet child({ props })}
			<Button
				{...composeProps(
					ctx,
					config,
					{
						variant: 'outline',
						...props,
						role: 'combobox',
						'aria-expanded': open
					} satisfies ButtonProps,
					uiOptionProps('TailoredMultiComboboxTrigger'),
					handlersAttachment(buttonHandlers),
					ariaInvalidProp
				)}
			>
				<span class="truncate text-start">
					{triggerContent || attributes.placeholder}
				</span>
				<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="{popoverClass} p-0">
		<Command.Root shouldFilter={false}>
			<Command.Input bind:value={filterValue} placeholder={attributes.placeholder} />
			<Command.List>
				{#if filteredOptions.length === 0}
					<Empty.Root>
						<Empty.Header>
							<Empty.Media>
								<SearchXIcon />
							</Empty.Media>
							<Empty.Description>{emptyText}</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
				<Command.Group>
					{#each filteredOptions.slice(0, visibleOptions) as option (option.id)}
						<Command.Item
							value={option.id}
							onSelect={() => {
								toggle(option.id);
							}}
							disabled={option.disabled}
						>
							<Check class={cn('mr-2 size-4', !selectedIds.has(option.id) && 'text-transparent')} />
							{option.label}
						</Command.Item>
					{/each}
				</Command.Group>
				{#if visibleOptions !== undefined && filteredOptions.length > visibleOptions}
					<Command.Separator />
					<Command.Item
						class="flex w-full items-center justify-center rounded-t-none hover:bg-muted"
						onclick={() => {
							visibleOptions += visibility;
						}}
					>
						<PlusIcon />
					</Command.Item>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
