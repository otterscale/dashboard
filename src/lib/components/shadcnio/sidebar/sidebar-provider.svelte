<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-expressions -- registry code, kept as shipped */
	import { Ark } from '@ark-ui/svelte/factory';
	import { untrack } from 'svelte';

	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
	import { cn } from '$lib/utils';

	import {
		SIDEBAR_COOKIE_MAX_AGE,
		SIDEBAR_COOKIE_NAME,
		SIDEBAR_KEYBOARD_SHORTCUT,
		SIDEBAR_WIDTH,
		SIDEBAR_WIDTH_ICON,
		type SidebarContextProps,
		type SidebarProviderProps
	} from './shared';
	import SidebarContext from './sidebar-context.svelte';
	let {
		defaultOpen = true,
		open: openProp,
		onOpenChange: setOpenProp,
		persist = true,
		shortcut = true,
		class: className,
		style,
		children,
		...rest
	}: SidebarProviderProps = $props();
	// The registry's Svelte port ships `const isMobile = false`, so the mobile sheet could
	// never open. Follow the viewport, with the project's own breakpoint hook.
	const mobileQuery = new IsMobile();
	const isMobile = $derived(mobileQuery.current);
	let openMobile = $state(false);
	const setOpenMobile = (
		next: typeof openMobile | ((previous: typeof openMobile) => typeof openMobile)
	) => {
		openMobile = typeof next === 'function' ? next(openMobile) : next;
	};
	let wrapperRef = $state<HTMLDivElement | null>(null);
	let dir = $state<'ltr' | 'rtl'>('ltr');
	const setDir = (next: 'ltr' | 'rtl' | ((previous: 'ltr' | 'rtl') => 'ltr' | 'rtl')) => {
		dir = typeof next === 'function' ? next(dir) : next;
	};
	let _open = $state(defaultOpen);
	const _setOpen = (next: typeof _open | ((previous: typeof _open) => typeof _open)) => {
		_open = typeof next === 'function' ? next(_open) : next;
	};
	const open = $derived(openProp ?? _open);
	$effect(() => {
		isMobile;
		open;
		openMobile;
		return untrack(() => {
			const node = wrapperRef ?? document.documentElement;
			setDir(getComputedStyle(node).direction === 'rtl' ? 'rtl' : 'ltr');
		});
	});
	const setOpen = (value: boolean | ((value: boolean) => boolean)) => {
		const openState = typeof value === 'function' ? value(open) : value;
		if (setOpenProp) {
			setOpenProp(openState);
		} else {
			_setOpen(openState);
		}

		if (!persist) {
			return;
		}

		document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
	};
	const toggleSidebar = () => {
		if (isMobile) {
			setOpenMobile((isOpen) => !isOpen);
		} else {
			setOpen((isOpen) => !isOpen);
		}
	};
	$effect(() => {
		shortcut;
		toggleSidebar;
		return untrack(() => {
			if (!shortcut) {
				return;
			}

			const handleKeyDown = (event: KeyboardEvent) => {
				if (
					event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
					(event.metaKey || event.ctrlKey) &&
					// The same keys make text bold in a rich-text editor: leave them to
					// an editor that has handled them, and to the browser's own bold in
					// a contenteditable.
					!event.defaultPrevented &&
					!(event.target instanceof HTMLElement && event.target.isContentEditable)
				) {
					event.preventDefault();
					toggleSidebar();
				}
			};

			window.addEventListener('keydown', handleKeyDown);

			return () => window.removeEventListener('keydown', handleKeyDown);
		});
	});
	const stateValue = $derived(open ? 'expanded' : 'collapsed');
	const contextValue = $derived.by<SidebarContextProps>(() => ({
		dir,
		isMobile,
		open,
		openMobile,
		setOpen,
		setOpenMobile,
		state: stateValue,
		toggleSidebar
	}));
	const cssText = (
		...styles: (
			| Record<string, string | number | boolean | null | undefined>
			| string
			| null
			| undefined
		)[]
	) => {
		const parts = styles.map((style) =>
			typeof style === 'object' && style !== null
				? Object.entries(style)
						.filter(([, value]) => value != null && value !== false)
						.map(([key, value]) => {
							const name = key.startsWith('--')
								? key
								: key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
							const unitless =
								key.startsWith('--') ||
								/^(aspectRatio|flex|flexGrow|flexShrink|fontWeight|lineHeight|opacity|order|scale|zIndex|zoom)$/.test(
									key
								);
							return `${name}: ${typeof value === 'number' && !unitless ? `${value}px` : value}`;
						})
						.join('; ')
				: style
		);
		// Later parts win, as later keys of a style object do.
		return parts.length === 1 ? parts[0] : parts.filter(Boolean).join('; ');
	};
</script>

<SidebarContext value={contextValue}
	><Ark
		as="div"
		class={cn(
			'group/sidebar-wrapper',
			'relative flex',
			'min-h-svh w-full',
			'md:has-data-[variant=inset]:bg-sidebar',
			className
		)}
		data-slot="sidebar-wrapper"
		bind:ref={wrapperRef}
		style={cssText(
			{ '--sidebar-width': SIDEBAR_WIDTH, '--sidebar-width-icon': SIDEBAR_WIDTH_ICON },
			style
		)}
		{...rest}>{@render children?.()}</Ark
	></SidebarContext
>
