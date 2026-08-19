import type { Page } from '@playwright/test';
import * as menuLocators from '../locator/Menu_locator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('menu_page_api');

export async function clickMenuPathByNames(
	page: Page,
	currentMenu: 'Platform' | 'Kubernetes',
	parentName: string,
	childName: string
): Promise<void> {
	logger.normal('[menu_page.api] clickMenuPathByNames', { currentMenu, parentName, childName });
	// 1) Ensure current sidebar menu group by reading the active Platform / Kubernetes tab.
	const activeTab = menuLocators.getActiveSidebarMenuTab(page);
	await activeTab.waitFor({ state: 'visible' });
	const currentGroupText = (await activeTab.innerText()).trim().toLowerCase();
	const expectedGroupText = currentMenu.trim().toLowerCase();

	if (currentGroupText !== expectedGroupText) {
		await menuLocators.getSidebarMenuTabByName(page, currentMenu).click();
		await menuLocators.getActiveSidebarMenuTabByName(page, currentMenu).waitFor({ state: 'visible' });
	}

	// 2) parentName always points to parent menu button.
	const parentButton = page
		.locator('[data-sidebar="menu-button"]', {
			has: page.locator('span', { hasText: new RegExp(`^\\s*${escapeRegExp(parentName)}\\s*$`) })
		})
		.first();

	// 3) childName always points to child menu sub button.
	const childButton = page
		.locator('[data-sidebar="menu-sub-button"]', {
			has: page.locator('span', { hasText: new RegExp(`^\\s*${escapeRegExp(childName)}\\s*$`) })
		})
		.first();
	const isChildVisible = await childButton.isVisible();

	if (!isChildVisible) {
		await parentButton.click();
		await childButton.waitFor({ state: 'visible' });
	}

	await childButton.click();
}

export async function clickMenuPageByName(
	page: Page,
	page_name: string
): Promise<void> {
	logger.normal('[menu_page.api] clickMenuPageByName', { page_name });
	const targetSpan = menuLocators.getMenuSpanByName(page, page_name);
	await targetSpan.click();
}

export async function clickWorkspaceOverviewPage(page: Page): Promise<void> {
	logger.normal('[menu_page.api] clickWorkspaceOverviewPage');
	const workspaceOverviewLink = page
		.locator('a[data-slot="button"][href*="kind=Workspace"][href*="resource=workspaces"]')
		.first();

	await workspaceOverviewLink.waitFor({ state: 'visible' });
	await workspaceOverviewLink.click();
}

export async function clickAdministrationModulePage(page: Page): Promise<void> {
	logger.normal('[menu_page.api] clickAdministrationModulePage');
	await clickMenuPathByNames(page, 'Platform', 'Administration', 'Module');
}

export async function clickNetworkingServicePage(page: Page): Promise<void> {
	logger.normal('[menu_page.api] clickNetworkingServicePage');
	await clickMenuPathByNames(page, 'Kubernetes', 'Networking', 'Service');
}

export async function clickNetworkingHttpRoutePage(page: Page): Promise<void> {
	logger.normal('[menu_page.api] clickNetworkingHttpRoutePage');
	await clickMenuPathByNames(page, 'Kubernetes', 'Networking', 'HTTP Route');
}

export async function clickNetworkingGatewayPage(page: Page): Promise<void> {
	logger.normal('[menu_page.api] clickNetworkingGatewayPage');
	await clickMenuPathByNames(page, 'Kubernetes', 'Networking', 'Gateway');
}

export async function clickNetworkingNetworkPolicyPage(page: Page): Promise<void> {
	logger.normal('[menu_page.api] clickNetworkingNetworkPolicyPage');
	await clickMenuPathByNames(page, 'Kubernetes', 'Networking', 'Network Policy');
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
