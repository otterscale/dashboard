<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/combobox';

	import type { EnumOption, SchemaValue } from '@sjsf/form/core';
	import type { Command as CommandType } from 'bits-ui';
	import type { Snippet as SnippetType } from 'svelte';

	import type { ButtonProps } from '$lib/components/ui/button/button.svelte';
	export type ComboboxEnumeration = EnumOption<SchemaValue> & {
		description?: SnippetType;
	};
	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredComboboxEnumerations?: (filterValue: string) => Promise<ComboboxEnumeration[]>;
			TailoredComboboxVisibility?: number;
			TailoredComboboxTrigger?: ButtonProps;
			TailoredComboboxInput?: CommandType.InputProps;
			TailoredComboboxEmptyText?: string;
			TailoredComboboxPopoverClass?: string;
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
		getPseudoId,
		handlersAttachment,
		inputAttributes,
		retrieveUiOption,
		uiOptionProps
	} from '@sjsf/form';
	import { idMapper, singleOption } from '@sjsf/form/options.svelte';
	import { tick } from 'svelte';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	const ctx = getFormContext();

	let {
		value = $bindable(),
		config,
		handlers,
		options
	}: ComponentProps['comboboxWidget'] = $props();
	const { oninput, onchange, ...buttonHandlers } = $derived(handlers);

	let filterValue = $state((value as string) ?? '');
	let enumerations = $state<ComboboxEnumeration[]>([]);

	const enumerationsProvider = $derived(
		retrieveUiOption(ctx, config, 'TailoredComboboxEnumerations') as (
			filterValue: string
		) => Promise<ComboboxEnumeration[]>
	);
	$effect(() => {
		if (enumerationsProvider) {
			enumerationsProvider(filterValue)
				.then((result) => {
					enumerations = result ?? [];
				})
				.catch((error) => {
					console.error('Failed to fetch enumerations:', error);
					enumerations = [];
				});
		}
	});

	const optionsProxy = $derived(
		enumerations
			? enumerations.map(
					(enumeration, index) =>
						({
							id: getPseudoId(ctx, config.path, index),
							label: enumeration.label,
							description: enumeration.description,
							value: enumeration.value,
							disabled: enumeration.disabled ?? false
						}) as ComboboxEnumeration
				)
			: (options as ComboboxEnumeration[])
	);
	const optionsManager = singleOption({
		mapper: () => idMapper(optionsProxy),
		value: () => value,
		update: (v) => (value = v)
	});

	const visibility: number = $derived(
		retrieveUiOption(ctx, config, 'TailoredComboboxVisibility') as number
	);
	let visibleOptions = $derived(visibility);
	const filteredOptions = $derived(
		optionsProxy.filter((option) => option.label.includes(filterValue))
	);
	$effect(() => {
		if (open === false) {
			filterValue = '';
			visibleOptions = visibility;
		}
	});

	const attributes = $derived(inputAttributes(ctx, config, 'TailoredComboboxInput', handlers, {}));

	const emptyText = $derived(retrieveUiOption(ctx, config, 'TailoredComboboxEmptyText'));
	const popoverClass = $derived(
		(retrieveUiOption(ctx, config, 'TailoredComboboxPopoverClass') as string) ?? 'w-[200px]'
	);

	let open = $state(false);
	let triggerReference = $state<HTMLButtonElement>(null!);
	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => {
			triggerReference.focus();
		});
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class="w-full justify-between"
		bind:ref={triggerReference}
		{...disabledProp({}, config, ctx)}
	>
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
					uiOptionProps('TailoredComboboxTrigger'),
					handlersAttachment(buttonHandlers),
					ariaInvalidProp
				)}
			>
				<span>
					{optionsProxy.find((option) => option.value === value)?.label ??
						value ??
						attributes.placeholder}
				</span>
				<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="{popoverClass} p-0">
		<Command.Root shouldFilter={false}>
			<Command.Input bind:value={filterValue} />
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
							value={option.value as string}
							onSelect={() => {
								optionsManager.current = option.id;
								oninput?.();
								onchange?.();
								closeAndFocusTrigger();
							}}
							disabled={option.disabled}
						>
							<Check
								class={cn(
									'mr-2 size-4',
									optionsManager.current !== option.id && 'text-transparent'
								)}
							/>
							<Item.Root class="w-full p-0">
								<Item.Content class="text-start">
									<Item.Title>{option.label}</Item.Title>
									{#if option?.description}
										<Item.Description>{option.description()}</Item.Description>
									{/if}
								</Item.Content>
							</Item.Root>
						</Command.Item>
					{/each}
				</Command.Group>
				{#if filteredOptions.length > visibleOptions}
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
