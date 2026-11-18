<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';

	import { shortcut } from '$lib/actions/shortcut.svelte';
	import { Badge } from '$lib/components/shadcnio/badge';
	import { Button } from '$lib/components/shadcnio/button';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	import { m } from '$lib/messages';
	import { notificationCenter } from '$lib/stores/notifications.svelte';

	import SheetNotification from './sheet-notification.svelte';

	let open = $state(false);

	const unreadCount = $derived(notificationCenter.unreadCount);
</script>

<svelte:window
	use:shortcut={{
		key: 'n',
		ctrl: true,
		callback: () => {
			open = !open;
		}
	}}
/>

<SheetNotification bind:open />

<Tooltip>
	<TooltipTrigger>
		{#snippet asChild(props)}
			<Button
				{...props({ class: 'relative' })}
				variant="ghost"
				size="icon-sm"
				onclick={() => {
					open = true;
				}}
			>
				<BellIcon />
				<span class="sr-only">{m.notifications()}</span>
				{#if unreadCount > 0}
					<Badge
						class="absolute -end-1.5 -top-1.5 h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums"
					>
						{unreadCount > 99 ? '99+' : unreadCount}
					</Badge>
				{/if}
			</Button>
		{/snippet}
	</TooltipTrigger>
	<TooltipContent>{m.notifications()}</TooltipContent>
</Tooltip>
