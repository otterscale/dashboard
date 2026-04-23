<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/combobox';

	import type { Command as CommandType } from 'bits-ui';

	import type { ButtonProps } from '$lib/components/ui/button/button.svelte';

	export interface KeycloakUser {
		id: string;
		username: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}

	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredUserComboboxVisibility?: number;
			TailoredUserComboboxTrigger?: ButtonProps;
			TailoredUserComboboxInput?: CommandType.InputProps;
			TailoredUserComboboxEmptyText?: string;
			TailoredUserComboboxOnFetched?: (users: KeycloakUser[]) => void;
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
	import { tick } from 'svelte';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';

	const ctx = getFormContext();

	let { value = $bindable(), config, handlers }: ComponentProps['comboboxWidget'] = $props();
	const { ...buttonHandlers } = $derived(handlers);

	let filterValue = $state((value as string) ?? '');
	let enumerations = $state<{ label: string; value: string }[]>([]);

	const onFetched = $derived(
		retrieveUiOption(ctx, config, 'TailoredUserComboboxOnFetched') as
			| ((users: KeycloakUser[]) => void)
			| undefined
	);

	let timer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const search = filterValue;
		if (timer) clearTimeout(timer);
		timer = setTimeout(async () => {
			try {
				const response = await fetch(`/rest/users?search=${encodeURIComponent(search)}`);
				if (response.ok) {
					const fetched: KeycloakUser[] = await response.json();
					onFetched?.(fetched);
					enumerations = fetched.map((user) => ({
						label: ((user.firstName ?? '') + ' ' + (user.lastName ?? '')).trim() || user.username,
						value: user.username
					}));
				} else {
					enumerations = [];
				}
			} catch {
				enumerations = [];
			}
		}, 300);
	});

	const visibility: number = $derived(
		(retrieveUiOption(ctx, config, 'TailoredUserComboboxVisibility') as number) ?? 10
	);
	let visibleOptions = $derived(visibility);
	const filteredOptions = $derived(
		enumerations.filter((option) => option.label.includes(filterValue))
	);
	$effect(() => {
		if (open === false) {
			filterValue = '';
			visibleOptions = visibility;
		}
	});

	const attributes = $derived(
		inputAttributes(ctx, config, 'TailoredUserComboboxInput', handlers, {})
	);
	const emptyText = $derived(retrieveUiOption(ctx, config, 'TailoredUserComboboxEmptyText'));

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
					uiOptionProps('TailoredUserComboboxTrigger'),
					handlersAttachment(buttonHandlers),
					ariaInvalidProp
				)}
			>
				<span>
					{enumerations.find((option) => option.value === value)?.label ??
						value ??
						attributes.placeholder}
				</span>
				<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[var(--bits-popover-anchor-width)] min-w-xs p-0">
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
					{#each filteredOptions.slice(0, visibleOptions) as option (option.value)}
						<Command.Item
							value={option.value}
							onSelect={() => {
								value = option.value;
								closeAndFocusTrigger();
							}}
						>
							<Check class={cn('mr-2 size-4', value !== option.value && 'text-transparent')} />
							<Item.Root class="w-full p-0">
								<Item.Content class="text-start">
									<Item.Title>{option.label}</Item.Title>
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
