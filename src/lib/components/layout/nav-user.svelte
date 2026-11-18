<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { mode, toggleMode } from 'mode-watcher';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/shadcnio/avatar';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuGroup,
		DropdownMenuItem,
		DropdownMenuRadioGroup,
		DropdownMenuRadioItem,
		DropdownMenuSeparator,
		DropdownMenuSub,
		DropdownMenuSubContent,
		DropdownMenuSubTrigger,
		DropdownMenuTrigger
	} from '$lib/components/shadcnio/dropdown-menu';
	import {
		SidebarMenu,
		SidebarMenuButton,
		SidebarMenuItem,
		useSidebar
	} from '$lib/components/shadcnio/sidebar';
	import { m } from '$lib/messages';
	import { getLocale, type Locale, setLocale } from '$lib/paraglide/runtime';
	import type { User } from '$lib/server/session';

	let { user }: { user: User } = $props();

	let locale = $state<string>(getLocale());

	const sidebar = useSidebar();

	const getUserInitials = (name: string) => {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase();
	};

	const handleSignOut = () => {
		goto(resolve('/logout'));
	};

	const handleLanguageChange = (newLocale: string) => {
		setLocale(newLocale as Locale);
		locale = newLocale;
	};
</script>

{#snippet identity()}
	<Avatar class="size-8 rounded-lg">
		{#if user.picture}
			<AvatarImage src={user.picture} alt={user.name} />
		{/if}
		<AvatarFallback
			class="rounded-lg bg-sidebar-primary/10 text-xs font-medium text-sidebar-primary"
		>
			{getUserInitials(user.name)}
		</AvatarFallback>
	</Avatar>
	<div class="grid flex-1 text-start text-sm leading-tight">
		<span class="truncate font-medium">{user.name}</span>
		<span class="truncate text-xs text-muted-foreground">{user.email}</span>
	</div>
{/snippet}

<SidebarMenu>
	<SidebarMenuItem>
		<DropdownMenu
			positioning={{
				placement: sidebar.isMobile ? 'top-start' : 'right-end',
				gutter: 8,
				sameWidth: sidebar.isMobile
			}}
		>
			<DropdownMenuTrigger>
				{#snippet asChild(props)}
					<SidebarMenuButton size="lg" {...props()}>
						{@render identity()}
						<ChevronsUpDownIcon class="ms-auto size-4" />
					</SidebarMenuButton>
				{/snippet}
			</DropdownMenuTrigger>
			<DropdownMenuContent class="min-w-56">
				<div class="flex items-center gap-2 px-1.5 py-1.5">
					{@render identity()}
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem value="mode" onclick={toggleMode}>
						{#if mode.current === 'light'}
							<MoonIcon />
							{m.dark_mode()}
						{:else}
							<SunIcon />
							{m.light_mode()}
						{/if}
					</DropdownMenuItem>
					<DropdownMenuSub positioning={{ placement: 'right-start', gutter: 4 }}>
						<DropdownMenuSubTrigger>
							<GlobeIcon />
							{m.locale()}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuRadioGroup
								value={locale}
								onValueChange={(details) => handleLanguageChange(details.value)}
							>
								<DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="zh-hant">繁體中文</DropdownMenuRadioItem>
							</DropdownMenuRadioGroup>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem value="log-out" variant="destructive" onclick={handleSignOut}>
					<LogOutIcon />
					{m.log_out()}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	</SidebarMenuItem>
</SidebarMenu>
