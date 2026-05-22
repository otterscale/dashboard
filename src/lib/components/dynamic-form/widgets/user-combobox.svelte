<script lang="ts" module>
	import '@sjsf/form/fields/extra-widgets/combobox';

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
			TailoredUserComboboxOnSelect?: (user: KeycloakUser) => void;
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
		retrieveUiOption
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

	const onSelect = $derived(
		retrieveUiOption(ctx, config, 'TailoredUserComboboxOnSelect') as
			| ((user: KeycloakUser) => void)
			| undefined
	);

	let timer: ReturnType<typeof setTimeout> | null = null;
	let searchTerm = $state('');
	let enumerations = $state<{ label: string; value: string; user: KeycloakUser }[]>([]);
	$effect(() => {
		const term = searchTerm;
		if (timer) clearTimeout(timer);
		timer = setTimeout(async () => {
			try {
				const response = await fetch(`/rest/users?search=${encodeURIComponent(term)}`);
				if (response.ok) {
					const fetchedUsers: KeycloakUser[] = await response.json();
					enumerations = fetchedUsers.map((user) => {
						const label = getDisplayName(user);
						return { label, value: user.id, user: user };
					});
				} else {
					enumerations = [];
				}
			} catch {
				enumerations = [];
			}
		}, 300);
	});
	const filteredEnumerations = $derived(
		enumerations.filter((option) => option.label.includes(searchTerm))
	);

	const visibility: number = $derived(
		(retrieveUiOption(ctx, config, 'TailoredUserComboboxVisibility') as number) ?? 10
	);
	let visibleOptions = $derived(visibility);

	let open = $state(false);
	let triggerReference = $state<HTMLButtonElement>(null!);
	function closeAndFocusTrigger() {
		open = false;
		tick().then(() => {
			triggerReference?.focus();
		});
	}
</script>

<Popover.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (isOpen) return;

		searchTerm = '';
		visibleOptions = visibility;
	}}
>
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
					handlersAttachment(buttonHandlers),
					ariaInvalidProp
				)}
			>
				<span class="min-w-0 flex-1 truncate text-left">
					{value ?? 'User'}
				</span>
				<ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[var(--bits-popover-anchor-width)] min-w-xs p-0">
		<Command.Root shouldFilter={false}>
			<Command.Input bind:value={searchTerm} />
			<Command.List>
				{#if filteredEnumerations.length === 0}
					<Empty.Root>
						<Empty.Header>
							<Empty.Media>
								<SearchXIcon />
							</Empty.Media>
							<Empty.Description>No users available.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
				<Command.Group>
					{#each filteredEnumerations.slice(0, visibleOptions) as option, index (index)}
						<Command.Item
							value={option.value}
							onSelect={() => {
								value = option.value;
								onSelect?.(option.user);
								closeAndFocusTrigger();
							}}
						>
							<Check
								class={cn('mr-2 size-4', !(value && value === option.value) && 'text-transparent')}
							/>
							<Item.Root class="w-full p-0">
								<Item.Content class="text-start">
									<Item.Title>{option.label}</Item.Title>
									<Item.Description>{option.value}</Item.Description>
								</Item.Content>
							</Item.Root>
						</Command.Item>
					{/each}
				</Command.Group>
				{#if filteredEnumerations.length > visibleOptions}
					<Command.Separator />
					<Command.Item
						class="w-full rounded-t-none hover:bg-muted"
						onclick={() => {
							visibleOptions = visibility + visibleOptions;
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
