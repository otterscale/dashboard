/* PATTERN_METADATA_START
feature=Administration - Workspace
group_rep_tc_id=6094
group_members=6045,6028,6026,6025,6094,1246,1262,2066,2013,2012,2016,2067
factor_type=Error,Normal
group_id=PYP_PAG09_01_0004
generated_at=2026-07-14T15:02:08+0800
PATTERN_METADATA_END */

import { expect, test, type Page } from '@playwright/test';
import * as administrationApi from './api/Administration_Workspace.api';
import * as loginApi from './api/login.api';
import * as menuPageApi from './api/menu_page.api';
import { createLogger } from './utils/logger';
import * as rapidgenResults from './utils/rapidgen_results';
import * as utils from './utils/utils';

const logger = createLogger('multiuser_template');
const JIRA_Key = 'SYSTCAI-1960'; // TODO: 由 coding 人員填寫對應 JIRA Key

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'pps8299';
const TEST_VIEW_USERNAME = 'test_view_role';
const TEST_VIEW_PASSWORD = 'test_view_role';
const TEST_EDIT_USERNAME = 'test_edit_role';
const TEST_EDIT_PASSWORD = 'test_edit_role';
const WORKSPACE_NAME_PREFIX = 'workspace-roles';
const WORKSPACE_EDIT_ROLE_NAME = 'workspace-edit-role';
const DEFAULT_RESOURCE_QUOTAS = ['8', '16Gi', '0', '0', '16', '32Gi', '0', '0'];

async function detectPermissionDeniedError(page: Page, workspaceName: string): Promise<void> {
	const errorPattern = new RegExp(
		`Failed to update Workspace\\s+${workspaceName}:[\\s\\S]*\\[permission_denied\\][\\s\\S]*only users with the 'admin' role`,
		'i'
	);

	const errorMessage = page
		.locator('div[data-content] div[data-title]')
		.filter({ hasText: errorPattern })
		.first();

	await expect(errorMessage).toBeVisible({ timeout: 30000 });
}

async function loginAndGotoWorkspaceList(
	page: Page,
	username: string,
	password: string,
	workspaceListUrl: string
): Promise<void> {
	await page.goto(utils.DASHBOARD_BASE_URL);
	await loginApi.loginWithUsernameAndPassword(page, username, password);
	await page.goto(workspaceListUrl);
}

async function dismissOpenWorkspaceDialog(page: Page): Promise<void> {
	await administrationApi.dismissWorkspaceOverlays(page);
}

async function cleanupWorkspaceAsAdmin(adminPage: Page, workspaceName: string): Promise<void> {
	logger.normal('Cleanup: admin delete workspace if exists', { workspace: workspaceName });
	await administrationApi.openWorkspacePage(adminPage);
	if (await administrationApi.workspaceExists(adminPage, workspaceName)) {
		await administrationApi.deleteWorkspace(adminPage, workspaceName, workspaceName);
		logger.normal('Cleanup done: workspace deleted by admin', { workspace: workspaceName });
	}
}

test.use({
	headless: utils.BROWSER_HEADLESS,
	viewport: null,
	launchOptions: {
		args: ['--start-maximized']
	}
});

test.afterEach(async ({}, testInfo) => {
	await rapidgenResults.submitPatternResults(testInfo, import.meta.url);
});

test('PYP_PAG09_01_0004_N_Workspace_Roles', async ({ browser }) => {
	const workspaceName = `${WORKSPACE_NAME_PREFIX}`;
	const adminContext = await browser.newContext({ viewport: null });
	const adminPage = await adminContext.newPage();
	let testViewContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
	let testViewPage: Page | null = null;
	let created = false;

	try {
		logger.normal('Step 1: Open admin browser and login', { jiraKey: JIRA_Key, baseUrl: utils.DASHBOARD_BASE_URL });

		await adminPage.goto(utils.DASHBOARD_BASE_URL);
		await loginApi.loginWithUsernameAndPassword(adminPage, ADMIN_USERNAME, ADMIN_PASSWORD);
		logger.normal('Step 1 done: Admin logged in', { adminUser: ADMIN_USERNAME });

		logger.normal('Step 2: Admin creates workspace and adds view-role member');
		await menuPageApi.clickMenuPathByNames(adminPage, 'Platform', 'Administration', 'Workspace');
		await administrationApi.createWorkspace(adminPage, workspaceName, [{ name: TEST_VIEW_USERNAME, role: 'view' }], [], ['8', '16Gi', '0', '0', '16', '32Gi', '0', '0']);
		created = true;
		logger.normal('Step 2 done: Workspace created by admin with view role member', {
			workspace: workspaceName,
			member: TEST_VIEW_USERNAME
		});

		logger.normal('Step 3: Open view-role browser, login, switch workspace, and submit edit from overview');
		testViewContext = await browser.newContext({ viewport: null });
		testViewPage = await testViewContext.newPage();
		await testViewPage.goto(utils.DASHBOARD_BASE_URL);
		await loginApi.loginWithUsernameAndPassword(testViewPage, TEST_VIEW_USERNAME, TEST_VIEW_PASSWORD);
		await administrationApi.switchWorkspace(testViewPage, workspaceName);
		await menuPageApi.clickWorkspaceOverviewPage(testViewPage);
		logger.normal('Click edit button from workspace overview page');
		await administrationApi.editWorkspace_overviewpage(testViewPage, workspaceName, [], [], []);
		logger.normal('Step 3 done: view-role edit flow submitted from workspace overview', {
			viewUser: TEST_VIEW_USERNAME
		});

		logger.normal('Step 4: Detect permission denied error');
		await detectPermissionDeniedError(testViewPage, workspaceName);
		logger.normal('Step 4 done: permission denied error is shown for non-admin edit');

		logger.normal('Step 5: Navigate back to Workspace page');
		await menuPageApi.clickMenuPathByNames(adminPage, 'Platform', 'Administration', 'Workspace');
		logger.normal('Step 5 done: Workspace page opened');

		logger.normal('TEST RESULT: PASS');
	} catch (error) {
		logger.error('TEST RESULT: FAIL', error instanceof Error ? error.message : String(error));
		throw error;
	} finally {
		if (created) {
			await cleanupWorkspaceAsAdmin(adminPage, workspaceName);
		}
		if (testViewContext) {
			await testViewContext.close();
		}
		await adminContext.close();
	}
});

test('PYP_PAG09_01_0004_N_Workspace_EditRole_Actions', async ({ browser }) => {
	const adminContext = await browser.newContext({ viewport: null });
	const adminPage = await adminContext.newPage();
	let roleContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
	let workspaceListUrl = '';
	let created = false;

	try {
		logger.normal('Step 1: Admin prepares workspace with test_edit_role member', {
			jiraKey: JIRA_Key,
			workspaceName: WORKSPACE_EDIT_ROLE_NAME,
			editUser: TEST_EDIT_USERNAME
		});
		await adminPage.goto(utils.DASHBOARD_BASE_URL);
		await loginApi.loginWithUsernameAndPassword(adminPage, ADMIN_USERNAME, ADMIN_PASSWORD);
		await administrationApi.openWorkspacePage(adminPage);
		await administrationApi.ensureWorkspaceDeleted(adminPage, WORKSPACE_EDIT_ROLE_NAME);
		await administrationApi.createWorkspace(
			adminPage,
			WORKSPACE_EDIT_ROLE_NAME,
			[{ name: TEST_EDIT_USERNAME, role: 'edit' }],
			[],
			DEFAULT_RESOURCE_QUOTAS,
			true
		);
		created = true;
		workspaceListUrl = adminPage.url();

		logger.normal('Step 2: Login as test_edit_role and open Workspace list');
		roleContext = await browser.newContext({ viewport: null });
		const rolePage = await roleContext.newPage();
		await loginAndGotoWorkspaceList(rolePage, TEST_EDIT_USERNAME, TEST_EDIT_PASSWORD, workspaceListUrl);
		await administrationApi.assertWorkspaceVisibleInTable(rolePage, WORKSPACE_EDIT_ROLE_NAME);

		logger.normal('Step 3: Verify View action shows workspace manifest');
		await administrationApi.openWorkspaceTableAction(rolePage, WORKSPACE_EDIT_ROLE_NAME, 'View');
		await administrationApi.assertWorkspaceManifestVisible(rolePage, 5000);
		await dismissOpenWorkspaceDialog(rolePage);

		logger.normal('Step 4: Verify Describe action shows workspace details');
		await administrationApi.openWorkspaceTableAction(rolePage, WORKSPACE_EDIT_ROLE_NAME, 'Describe');
		await administrationApi.assertWorkspaceDescribeVisible(rolePage, WORKSPACE_EDIT_ROLE_NAME, 5000);
		await dismissOpenWorkspaceDialog(rolePage);

		logger.normal('TEST RESULT: PASS');
	} catch (error) {
		logger.error('TEST RESULT: FAIL', error instanceof Error ? error.message : String(error));
		throw error;
	} finally {
		if (created) {
			await cleanupWorkspaceAsAdmin(adminPage, WORKSPACE_EDIT_ROLE_NAME);
		}
		if (roleContext) {
			await roleContext.close();
		}
		await adminContext.close();
	}
});
