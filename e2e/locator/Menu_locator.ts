import { type Locator, type Page } from '@playwright/test';

/**
 * Reusable locators for the left sidebar and menu.
 *
 * Use them to open pages or switch sections (e.g. Platform vs Kubernetes) without hard-coding one feature's markup.
 * Text on screen may be translated; prefer elements with stable `data-*` attributes when possible.
 */

/** Platform sidebar inventory — use href hints when menu labels collide. */
export type MenuGroup = 'Platform' | 'Kubernetes';

export type MenuLeaf = {
	label: string;
	hrefHint?: string;
};

export type MenuSection = {
	label: string;
	children: MenuLeaf[];
};

export type MenuNode = {
	group: MenuGroup;
	path: readonly string[];
	hrefHint?: string;
};

export const PLATFORM_MENU_TREE: MenuSection[] = [
	{
		label: 'Dashboard',
		children: [
			{ label: 'Cluster', hrefHint: '/dashboard/cluster' },
			{ label: 'Model', hrefHint: '/dashboard/model' },
			{ label: 'Compute', hrefHint: '/dashboard/compute' },
			{ label: 'Storage', hrefHint: '/dashboard/storage' }
		]
	},
	{
		label: 'AI Studio',
		children: [
			{ label: 'Model', hrefHint: 'kind=LLMInferenceService' },
			{ label: 'Configuration', hrefHint: 'kind=LLMInferenceServiceConfig' },
			{ label: 'Template', hrefHint: '/model-templates' }
		]
	},
	{
		label: 'Apps',
		children: [
			{ label: 'Hub', hrefHint: '/hub' },
			{ label: 'Release', hrefHint: 'kind=HelmRelease' },
			{ label: 'Repository', hrefHint: 'kind=HelmRepository' },
			{ label: 'Application', hrefHint: 'kind=Application' },
			{ label: 'Schedule', hrefHint: 'kind=Schedule' },
			{ label: 'Task', hrefHint: 'kind=Task' }
		]
	},
	{
		label: 'Compute',
		children: [
			{ label: 'Virtual Machine', hrefHint: 'kind=VirtualMachine' },
			{ label: 'Data Volume', hrefHint: 'kind=DataVolume' },
			{ label: 'Instance Type', hrefHint: 'kind=VirtualMachineInstancetype' }
		]
	},
	{
		label: 'Storage',
		children: [{ label: 'Object Storage', hrefHint: 'kind=ObjectBucketClaim' }]
	},
	{
		label: 'Administration',
		children: [
			{ label: 'Workspace', hrefHint: 'kind=Workspace' },
			{ label: 'Module', hrefHint: '/modules' },
			{ label: 'License', hrefHint: '/license' }
		]
	}
];

export const PLATFORM_TOP_LEVEL_LINKS: MenuLeaf[] = [
	{ label: 'Overview', hrefHint: '/dashboard/overview' }
];

export const KUBERNETES_MENU_TREE: MenuSection[] = [
	{
		label: 'Networking',
		children: [
			{ label: 'Service', hrefHint: 'kind=Service' },
			{ label: 'HTTP Route', hrefHint: 'kind=HTTPRoute' },
			{ label: 'Gateway', hrefHint: 'kind=Gateway' },
			{ label: 'Network Policy', hrefHint: 'kind=NetworkPolicy' }
		]
	}
];

export const SIDEBAR_FOOTER_LINKS: MenuLeaf[] = [
	{ label: 'Documentation', hrefHint: 'https://otterscale.io' },
	{ label: 'Registry' }
];

export const NAV = {
	overview: { group: 'Platform', path: ['Overview'] } satisfies MenuNode,
	workspaceList: { group: 'Platform', path: ['Administration', 'Workspace'], hrefHint: 'kind=Workspace' },
	modulePage: { group: 'Platform', path: ['Administration', 'Module'], hrefHint: '/modules' },
	modelList: {
		group: 'Platform',
		path: ['AI Studio', 'Model'],
		hrefHint: 'kind=LLMInferenceService'
	},
	configList: {
		group: 'Platform',
		path: ['AI Studio', 'Configuration'],
		hrefHint: 'kind=LLMInferenceServiceConfig'
	},
	clusterDashboard: { group: 'Platform', path: ['Dashboard', 'Cluster'], hrefHint: '/dashboard/cluster' },
	networkingServiceList: {
		group: 'Kubernetes',
		path: ['Networking', 'Service'],
		hrefHint: 'kind=Service'
	},
	networkingHttpRouteList: {
		group: 'Kubernetes',
		path: ['Networking', 'HTTP Route'],
		hrefHint: 'kind=HTTPRoute'
	},
	networkingGatewayList: {
		group: 'Kubernetes',
		path: ['Networking', 'Gateway'],
		hrefHint: 'kind=Gateway'
	},
	networkingNetworkPolicyList: {
		group: 'Kubernetes',
		path: ['Networking', 'Network Policy'],
		hrefHint: 'kind=NetworkPolicy'
	}
} as const;

/** Menu row: a `span` whose text equals the given string (after trim). */
export function getMenuSpanByName(page: Page, pageName: string): Locator {
	const exactTextPattern = new RegExp(`^\\s*${escapeRegExp(pageName)}\\s*$`);
	return page.locator('span', { hasText: exactTextPattern }).first();
}

/** Sidebar tab trigger for Platform or Kubernetes. */
export function getSidebarMenuTabByName(page: Page, groupName: MenuGroup | string): Locator {
	const exactTextPattern = new RegExp(`^\\s*${escapeRegExp(groupName)}\\s*$`);
	return page
		.locator('div[data-slot="sidebar-group"] button[data-slot="tabs-trigger"][role="tab"]', {
			hasText: exactTextPattern
		})
		.first();
}

/** Currently active Platform / Kubernetes tab in the sidebar. */
export function getActiveSidebarMenuTab(page: Page): Locator {
	return page
		.locator(
			'div[data-slot="sidebar-group"] button[data-slot="tabs-trigger"][role="tab"][data-state="active"]'
		)
		.first();
}

/** Active sidebar tab with exact visible text (e.g. after switching menu group). */
export function getActiveSidebarMenuTabByName(page: Page, groupName: MenuGroup | string): Locator {
	const exactTextPattern = new RegExp(`^\\s*${escapeRegExp(groupName)}\\s*$`);
	return page
		.locator(
			'div[data-slot="sidebar-group"] button[data-slot="tabs-trigger"][role="tab"][data-state="active"]',
			{ hasText: exactTextPattern }
		)
		.first();
}

/** @deprecated Use getSidebarMenuTabByName */
export function getSidebarGroupLabelByName(page: Page, groupName: string): Locator {
	return getSidebarMenuTabByName(page, groupName);
}

/** @deprecated Use getActiveSidebarMenuTab */
export function getSidebarGroupLabelToggle(page: Page): Locator {
	return getActiveSidebarMenuTab(page);
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
