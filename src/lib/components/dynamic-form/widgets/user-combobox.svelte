<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/combobox';

	import type { Command as CommandType } from 'bits-ui';

	import type { ButtonProps } from '$lib/components/ui/button/button.svelte';

	export interface KeycloakUser {
		id: string;
		name: string;
		username: string;
		firstName?: string;
		lastName?: string;
	}

	declare module '@sjsf/form' {
		interface UiOptions {
			TailoredUserComboboxVisibility?: number;
			TailoredUserComboboxTrigger?: ButtonProps;
			TailoredUserComboboxInput?: CommandType.InputProps;
			TailoredUserComboboxEmptyText?: string;
			TailoredUserComboboxOnFetch?: (users: KeycloakUser[]) => void;
		}
	}

	export function getDisplayName(user: KeycloakUser | undefined) {
		if (!user) return '';

		const displayName = ((user.firstName ?? '') + ' ' + (user.lastName ?? '')).trim();
		if (!displayName) return user.username;

		return displayName;
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

	// Bind subject for identifier user
	let { value = $bindable(), config, handlers }: ComponentProps['comboboxWidget'] = $props();
	const { ...buttonHandlers } = $derived(handlers);

	let filterValue = $state('');
	let enumerations = $state<{ label: string; value: string }[]>([]);
	let labelCache = $state<Record<string, string>>({});
	let timer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const search = filterValue;
		if (timer) clearTimeout(timer);
		timer = setTimeout(async () => {
			try {
				const response = await fetch(`/rest/users?search=${encodeURIComponent(search)}`);
				if (response.ok) {
					const fetched: KeycloakUser[] = await response.json();
					onFetch?.(fetched);
					enumerations = fetched.map((user) => {
						const label = getDisplayName(user);
						labelCache[user.id] = label;
						return { label, value: user.id };
					});
				} else {
					enumerations = [];
				}
			} catch {
				enumerations = [];
			}
		}, 300);
	});

	$effect(() => {
		const subject = value as string | undefined;
		if (!subject || labelCache[subject]) return;
		fetch(`/rest/users/${encodeURIComponent(subject)}`)
			.then(async (response) => {
				if (!response.ok) return;
				const user: KeycloakUser = await response.json();
				labelCache[subject] = getDisplayName(user);
				onFetch?.([user]);
			})
			.catch(() => {});
	});
	const onFetch = $derived(
		retrieveUiOption(ctx, config, 'TailoredUserComboboxOnFetch') as
			| ((users: KeycloakUser[]) => void)
			| undefined
	);

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
	let triggerText: string | undefined = $derived(value ? labelCache[value as string] : undefined);

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
					{triggerText ?? attributes.placeholder}
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
					{#each filteredOptions.slice(0, visibleOptions) as option, index (index)}
						<Command.Item
							value={option.value}
							onSelect={() => {
								value = option.value;
								closeAndFocusTrigger();
							}}
						>
							<Check
								class={cn('mr-2 size-4', !(value && value === option.value) && 'text-transparent')}
							/>
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
						class="w-full rounded-t-none hover:bg-muted"
						onclick={() => {
							visibleOptions += visibility;
						}}
					>
						<div class="flex w-full items-center justify-center">
							<PlusIcon />
						</div>
					</Command.Item>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
