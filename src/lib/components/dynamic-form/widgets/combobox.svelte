<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/combobox';

	import type { Command } from 'bits-ui';

	import type { ButtonProps } from '$lib/components/ui/button/button.svelte';
	export type ComboboxEnumeration = {
		label: string;
		value: string;
		disabled?: boolean;
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
	import { PlusIcon, SearchXIcon } from '@lucide/svelte';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
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
	import { cn } from '$lib/utils.js';
	const ctx = getFormContext();
	const themeCtx = getThemeContext();
	const {
		Popover,
		PopoverContent,
		PopoverTrigger,
		Button,
		Command,
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

	let filterValue = $state(value ?? '');
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
			? enumerations.map((enumeration, index) => ({
					id: getPseudoId(ctx, config.path, index),
					label: enumeration.label,
					value: enumeration.value,
					disabled: enumeration.disabled ?? false
				}))
			: options
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
	const triggerContent = $derived(value ?? attributes.placeholder);

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
					{triggerContent}
				</span>
				<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</PopoverTrigger>
	<PopoverContent class="w-[200px] p-0">
		<Command shouldFilter={false}>
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
							value={option.value}
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
							{option.label}
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
		</Command>
	</PopoverContent>
</Popover>
