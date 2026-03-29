<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/combobox';

	import type { EnumOption, SchemaValue } from '@sjsf/form/core';
	import type { Command } from 'bits-ui';
	import type { Snippet } from 'svelte';

	import type { ButtonProps } from '$lib/components/ui/button/button.svelte';
	export type ComboboxEnumeration = EnumOption<SchemaValue> & {
		description?: Snippet;
	};
	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredComboboxEnumerations?: (filterValue: string) => Promise<ComboboxEnumeration[]>;
			TailoredComboboxVisibility?: number;
			TailoredComboboxTrigger?: ButtonProps;
			TailoredComboboxInput?: Command.InputProps;
			TailoredComboboxEmptyText?: string;
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
	import { getThemeContext } from '@sjsf/shadcn4-theme';
	import { tick } from 'svelte';

	import CommandSeparator from '$lib/components/ui/command/command-separator.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import { cn } from '$lib/utils.js';
	const ctx = getFormContext();
	const themeCtx = getThemeContext();
	const {
		Popover,
		PopoverContent,
		PopoverTrigger,
		Button,
		Command: CommandRoot,
		CommandInput,
		CommandList,
		CommandGroup,
		CommandItem
	} = $derived(themeCtx.components);
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

	let open = $state(false);
	let triggerReference = $state<HTMLButtonElement>(null!);
	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => {
			triggerReference.focus();
		});
	}
</script>

<Popover bind:open>
	<PopoverTrigger
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
	</PopoverTrigger>
	<PopoverContent class="w-[200px] p-0">
		<CommandRoot shouldFilter={false}>
			<CommandInput bind:value={filterValue} />
			<CommandList>
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
				<CommandGroup>
					{#each filteredOptions.slice(0, visibleOptions) as option (option.id)}
						<CommandItem
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
						</CommandItem>
					{/each}
				</CommandGroup>
				{#if filteredOptions.length > visibleOptions}
					<CommandSeparator />
					<CommandItem
						class="flex w-full items-center justify-center rounded-t-none hover:bg-muted"
						onclick={() => {
							visibleOptions += visibility;
						}}
					>
						<PlusIcon />
					</CommandItem>
				{/if}
			</CommandList>
		</CommandRoot>
	</PopoverContent>
</Popover>
