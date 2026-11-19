<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';

	import {
		SIDEBAR_COLLAPSE_SLOP,
		SIDEBAR_MAX_WIDTH,
		SIDEBAR_MIN_WIDTH,
		useSidebar
	} from './shared';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'button'>>, 'as'> = $props();
	const __useSidebar1 = useSidebar();
	const { setOpen, state: stateValue, toggleSidebar } = $derived(__useSidebar1);
	let dragRef = $state<{
		lastWidth: string;
		moved: boolean;
		startWidth: number;
		startX: number;
	} | null>(null);
	const commitWidth = (wrapper: HTMLElement, width: string) => {
		wrapper.style.setProperty('--sidebar-width', width);
	};
	const setWrapperResizing = (target: EventTarget | null, resizing: boolean) => {
		if (!(target instanceof Element)) {
			return;
		}

		const wrapper = target.closest('[data-slot=sidebar-wrapper]');

		if (!(wrapper instanceof HTMLElement)) {
			return;
		}

		if (resizing) {
			wrapper.dataset.resizing = '';
			return;
		}

		wrapper.removeAttribute('data-resizing');
	};
	const onPointerCancel = (
		event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) => {
		setWrapperResizing(event.currentTarget, false);
		dragRef = null;
	};
	const onPointerDown = (
		event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) => {
		if (stateValue === 'collapsed') {
			return;
		}

		const sidebar = event.currentTarget.closest('[data-slot=sidebar]');

		if (!(sidebar instanceof HTMLElement)) {
			return;
		}

		dragRef = {
			lastWidth: `${sidebar.offsetWidth}px`,
			moved: false,
			startWidth: sidebar.offsetWidth,
			startX: event.clientX
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const onPointerMove = (
		event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) => {
		const drag = dragRef;

		if (drag === null) {
			return;
		}

		const sidebar = event.currentTarget.closest('[data-slot=sidebar]');
		const wrapper = event.currentTarget.closest('[data-slot=sidebar-wrapper]');

		if (!(sidebar instanceof HTMLElement && wrapper instanceof HTMLElement)) {
			return;
		}

		const dx = event.clientX - drag.startX;

		if (!drag.moved && Math.abs(dx) < 4) {
			return;
		}

		drag.moved = true;
		setWrapperResizing(event.currentTarget, true);
		const placement = sidebar.getAttribute('data-placement') === 'right' ? 'right' : 'left';
		const raw = drag.startWidth + (placement === 'left' ? dx : -dx);

		if (raw < SIDEBAR_MIN_WIDTH - SIDEBAR_COLLAPSE_SLOP) {
			drag.lastWidth = `${SIDEBAR_MIN_WIDTH}px`;
			commitWidth(wrapper, drag.lastWidth);
			setOpen(false);
			return;
		}

		if (stateValue === 'collapsed') {
			setOpen(true);
		}

		const next = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, raw));
		drag.lastWidth = `${next}px`;
		commitWidth(wrapper, drag.lastWidth);
	};
	const onPointerUp = (
		event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement }
	) => {
		const drag = dragRef;
		dragRef = null;
		setWrapperResizing(event.currentTarget, false);

		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			// Capture may already be gone.
		}

		if (!drag?.moved) {
			toggleSidebar();
		}
	};
</script>

<Ark
	as="button"
	aria-label="Resize or toggle sidebar"
	class={cn(
		'absolute inset-y-0 z-20 hidden w-4 touch-none hover:after:bg-sidebar-border md:flex',
		'after:absolute after:inset-y-0 after:inset-s-1/2 after:w-[2px]',
		'hover:after:bg-sidebar-border',
		'group-data-[placement=left]:-inset-e-4 group-data-[placement=right]:inset-s-0',
		'in-data-[placement=left]:cursor-w-resize in-data-[placement=right]:cursor-e-resize',
		'[[data-placement=left][data-state=collapsed]_&]:cursor-e-resize [[data-placement=right][data-state=collapsed]_&]:cursor-w-resize',
		'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:inset-s-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
		'[[data-placement=left][data-collapsible=offcanvas]_&]:-inset-e-2',
		'[[data-placement=right][data-collapsible=offcanvas]_&]:-inset-s-2',
		className
	)}
	data-sidebar="rail"
	data-slot="sidebar-rail"
	onpointercancel={onPointerCancel}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	tabindex={-1}
	title="Drag to resize, click to toggle"
	type="button"
	{...rest}
	bind:ref
/>
