<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';

	import { shortcut } from '$lib/actions/shortcut.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
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

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon"
				class="relative size-7"
				onclick={() => {
					open = true;
				}}
			>
				<BellIcon />
				<span class="sr-only">{m.notifications()}</span>
				{#if unreadCount > 0}
					<Badge
						class="absolute -top-1.5 -right-1.5 h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums"
					>
						{unreadCount > 99 ? '99+' : unreadCount}
					</Badge>
				{/if}
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>{m.notifications()}</Tooltip.Content>
</Tooltip.Root>
