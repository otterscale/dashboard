<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import CheckCheckIcon from '@lucide/svelte/icons/check-check';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import InfoIcon from '@lucide/svelte/icons/info';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	import { CopyButton } from '$lib/components/custom/copy-button';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as Item from '$lib/components/ui/item';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { siteConfig } from '$lib/config/site';
	import { formatTimeAgo } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { notificationCenter, type NotificationLevel } from '$lib/stores/notifications.svelte';
	import { cn } from '$lib/utils';

	let { open = $bindable(false) }: { open: boolean } = $props();

	const levelIcons: Record<NotificationLevel, typeof InfoIcon> = {
		success: CircleCheckIcon,
		error: OctagonXIcon,
		warning: TriangleAlertIcon,
		info: InfoIcon
	};

	const hasUnread = $derived(notificationCenter.unreadCount > 0);

	/** Notifications whose full, unclamped text is shown. */
	const expanded = new SvelteSet<string>();

	/** Which clamped texts actually overflow; only their cards are expandable. */
	const truncated = new SvelteMap<string, boolean>();

	/** Marks whether a clamp hides text; skipped while expanded so the card stays collapsible. */
	function trackTruncation(key: string, skip: boolean) {
		return (node: HTMLElement) => {
			if (skip) return;
			const measure = () => truncated.set(key, node.scrollHeight > node.clientHeight + 1);
			measure();
			const observer = new ResizeObserver(measure);
			observer.observe(node);
			return () => observer.disconnect();
		};
	}

	function toggleExpanded(id: string) {
		if (!expanded.delete(id)) expanded.add(id);
	}
	function onCardClick(event: MouseEvent, id: string, expandable: boolean) {
		if (!expandable) return;
		// Clicks on the card's own buttons (copy, delete) must not toggle it.
		if (event.target instanceof Element && event.target.closest('button')) return;
		// Neither should a click that ends a text selection.
		if (window.getSelection()?.toString()) return;
		toggleExpanded(id);
	}
	function onCardKeydown(event: KeyboardEvent, id: string, expandable: boolean) {
		if (!expandable) return;
		if (event.target !== event.currentTarget) return;
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		toggleExpanded(id);
	}
	function clearAll() {
		notificationCenter.clearAll();
		expanded.clear();
	}
	function deleteNotification(id: string) {
		notificationCenter.delete(id);
		expanded.delete(id);
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="rounded-l-lg p-6">
		<div class="flex min-h-0 flex-1 flex-col gap-2">
			<Sheet.Title class="text-xl">{m.notifications()}</Sheet.Title>
			<div class="flex items-center justify-end gap-1">
				<Button
					variant="ghost"
					size="sm"
					disabled={!hasUnread}
					onclick={() => notificationCenter.markAllRead()}
				>
					<CheckCheckIcon data-icon="inline-start" />
					{m.mark_all_as_read()}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={notificationCenter.items.length === 0}
					onclick={clearAll}
				>
					<Trash2Icon data-icon="inline-start" />
					{m.clear_all()}
				</Button>
			</div>
			<Separator />
			<ScrollArea class="min-h-0 flex-1">
				{#if notificationCenter.items.length === 0}
					<Empty.Root>
						<Empty.Header>
							<Empty.Media variant="icon">
								<BellIcon />
							</Empty.Media>
							<Empty.Title>{m.no_notifications()}</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				{:else}
					<Item.Group class="gap-2 pb-4">
						{#each notificationCenter.items as notification (notification.id)}
							{@const LevelIcon = levelIcons[notification.level]}
							{@const isExpanded = expanded.has(notification.id)}
							{@const isExpandable =
								isExpanded ||
								truncated.get(`${notification.id}:title`) ||
								truncated.get(`${notification.id}:content`) ||
								false}
							<Item.Root
								variant="outline"
								size="sm"
								class={cn(
									'flex-nowrap',
									isExpandable && 'cursor-pointer transition-colors hover:bg-muted/50'
								)}
								role={isExpandable ? 'button' : undefined}
								tabindex={isExpandable ? 0 : undefined}
								aria-expanded={isExpandable ? isExpanded : undefined}
								onclick={(event: MouseEvent) => onCardClick(event, notification.id, isExpandable)}
								onkeydown={(event: KeyboardEvent) =>
									onCardKeydown(event, notification.id, isExpandable)}
							>
								<Item.Media variant="icon" class="relative">
									<LevelIcon
										aria-hidden="true"
										class={cn(notification.level === 'error' && 'text-destructive')}
									/>
									{#if !notification.read}
										<span class="absolute -top-1 -right-1 size-2 rounded-full bg-primary"></span>
									{/if}
								</Item.Media>
								<Item.Content class="min-w-0">
									<!-- line-clamp makes Item.Title a block; this wrapper keeps the badge on the row. -->
									<div class="flex items-start gap-1.5">
										<Item.Title class="line-clamp-none min-w-0">
											<span
												class={cn('text-xs wrap-anywhere', !isExpanded && 'line-clamp-2')}
												{@attach trackTruncation(`${notification.id}:title`, isExpanded)}
											>
												{notification.title}
											</span>
										</Item.Title>
										{#if notification.count > 1}
											<Badge variant="secondary" class="h-4 shrink-0 px-1 text-[10px] tabular-nums">
												×{notification.count}
											</Badge>
										{/if}
									</div>
									<!-- Description and meta share one line, so every card is title + meta tall. -->
									{@const meta = [
										notification.content,
										notification.from || siteConfig.title,
										formatTimeAgo(notification.updated)
									]
										.filter(Boolean)
										.join(' · ')}
									<span
										class={cn(
											'text-xs wrap-anywhere whitespace-pre-wrap text-muted-foreground',
											!isExpanded && 'line-clamp-2'
										)}
										{@attach trackTruncation(`${notification.id}:content`, isExpanded)}
									>
										{meta}
									</span>
								</Item.Content>
								<Item.Actions class="gap-0 self-start">
									<CopyButton
										variant="ghost"
										size="icon-xs"
										text={[notification.title, notification.content].filter(Boolean).join('\n')}
									/>
									<Tooltip.Root>
										<Tooltip.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon-xs"
													onclick={() => deleteNotification(notification.id)}
												>
													<Trash2Icon />
													<span class="sr-only">{m.delete()}</span>
												</Button>
											{/snippet}
										</Tooltip.Trigger>
										<Tooltip.Content>{m.delete()}</Tooltip.Content>
									</Tooltip.Root>
								</Item.Actions>
							</Item.Root>
						{/each}
					</Item.Group>
				{/if}
			</ScrollArea>
		</div>
	</Sheet.Content>
</Sheet.Root>
