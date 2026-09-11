/* PATTERN_METADATA_START
feature=Administration - Workspace
group_rep_tc_id=1287
group_members=1255,1287,1955,1960,1961,1970,1972,1973,2084,2086,6025,6026,6027,6028,6090
factor_type=Stress
group_id=PYP_PAG09_01_0005
generated_at=2026-07-02T09:41:19+0800
PATTERN_METADATA_END */

import { expect, test } from '@playwright/test';
import * as administrationApi from './api/Administration_Workspace.api';
import * as loginApi from './api/login.api';
import { createLogger } from './utils/logger';
import * as rapidgenResults from './utils/rapidgen_results';
import * as utils from './utils/utils';
import * as videoRecord from './utils/video_record';

const patternName = utils.getPatternNameFromModuleUrl(import.meta.url);
const JIRA_Key = 'SYSTCAI-1962'; // TODO: 由 coding 人員填寫對應 JIRA Key
const logger = createLogger(patternName);

const ADMIN_ACCOUNT = { username: 'admin', password: 'pps8299' };
const TEST1_ACCOUNT = { username: 'test1', password: 'test1' };
const TEST2_ACCOUNT = { username: 'test2', password: 'test2' };
const TEST3_ACCOUNT = { username: 'test3', password: 'test3' };
const WORKSPACE_NAME = 'workspace-shared-test';

test.use({
	headless: utils.BROWSER_HEADLESS,
	viewport: null,
	video: utils.ENABLE_E2E_VIDEO ? 'on' : 'off',
	launchOptions: {
		args: ['--start-maximized']
	}
});

test.afterEach(async ({ page }, testInfo) => {
	await videoRecord.saveTestVideoToPatternLogDir(page, testInfo, import.meta.url);
	await rapidgenResults.submitPatternResults(testInfo, import.meta.url);
});

async function loginAndOpenWorkspace(page: import('@playwright/test').Page, username: string, password: string): Promise<void> {
	await page.goto(utils.DASHBOARD_BASE_URL);
	await loginApi.loginWithUsernameAndPassword(page, username, password);
	await administrationApi.openWorkspacePage(page);
}

async function loginAndGotoWorkspaceList(
	page: import('@playwright/test').Page,
	username: string,
	password: string,
	workspaceListUrl: string
): Promise<void> {
	await page.goto(utils.DASHBOARD_BASE_URL);
	await loginApi.loginWithUsernameAndPassword(page, username, password);
	await page.goto(workspaceListUrl);
}

test('PYP_PAG09_01_0005: shared workspace multi-user read stress', async ({ browser }) => {
	const adminContext = await browser.newContext({ viewport: null });
	const test1Context = await browser.newContext({ viewport: null });
	const test2Context = await browser.newContext({ viewport: null });
	const test3Context = await browser.newContext({ viewport: null });
	const adminPage = await adminContext.newPage();
	const test1Page = await test1Context.newPage();
	const test2Page = await test2Context.newPage();
	const test3Page = await test3Context.newPage();
	const reloadDurations: number[] = [];
	let workspaceListUrl = '';

	try {
		logger.normal('=== Test start ===', { pattern: patternName, jiraKey: JIRA_Key, baseUrl: utils.DASHBOARD_BASE_URL });
		logger.normal('Step 1-2: admin 登入並前往 Workspace');
		await loginAndOpenWorkspace(adminPage, ADMIN_ACCOUNT.username, ADMIN_ACCOUNT.password);
		workspaceListUrl = adminPage.url();
		await administrationApi.ensureWorkspaceDeleted(adminPage, WORKSPACE_NAME);

		logger.normal('Step 3: 建立 workspace-shared-test');
		await administrationApi.createWorkspace(
			adminPage,
			WORKSPACE_NAME,
			[
				{ name: TEST1_ACCOUNT.username, role: 'edit' },
				{ name: TEST2_ACCOUNT.username, role: 'edit' },
				{ name: TEST3_ACCOUNT.username, role: 'edit' }
			],
			[],
			[]
		);

		logger.normal('Step 4-6: 驗證建立時已加入 test1/test2/test3');
		const adminRow = await administrationApi.assertWorkspaceVisibleInTable(adminPage, WORKSPACE_NAME);
		await expect(adminRow).toContainText(WORKSPACE_NAME);
		await expect(adminRow).toContainText(/\b(3|4)\b/);

		logger.normal('Step 7-9: test1 登入後停留在 Workspace 列表');
		await loginAndGotoWorkspaceList(test1Page, TEST1_ACCOUNT.username, TEST1_ACCOUNT.password, workspaceListUrl);
		await administrationApi.assertWorkspaceVisibleInTable(test1Page, WORKSPACE_NAME);

		logger.normal('Step 10-14: test2 View + manifest 驗證 (<=5s)');
		await loginAndGotoWorkspaceList(test2Page, TEST2_ACCOUNT.username, TEST2_ACCOUNT.password, workspaceListUrl);
		await administrationApi.assertWorkspaceVisibleInTable(test2Page, WORKSPACE_NAME);
		const viewStart = Date.now();
		await administrationApi.openWorkspaceTableAction(test2Page, WORKSPACE_NAME, 'View');
		await administrationApi.assertWorkspaceManifestVisible(test2Page, 5000);
		const viewLatency = Date.now() - viewStart;
		expect(viewLatency).toBeLessThanOrEqual(5000);
		await test2Context.close();

		logger.normal('Step 15-19: test3 Describe + 詳細資訊驗證 (<=5s)');
		await loginAndGotoWorkspaceList(test3Page, TEST3_ACCOUNT.username, TEST3_ACCOUNT.password, workspaceListUrl);
		await administrationApi.assertWorkspaceVisibleInTable(test3Page, WORKSPACE_NAME);
		const describeStart = Date.now();
		await administrationApi.openWorkspaceTableAction(test3Page, WORKSPACE_NAME, 'Describe');
		await administrationApi.assertWorkspaceDescribeVisible(test3Page, WORKSPACE_NAME, 5000);
		const describeLatency = Date.now() - describeStart;
		expect(describeLatency).toBeLessThanOrEqual(5000);
		await test3Context.close();

		logger.normal('Step 20-24: 回到 test1 連續 reload/refresh 3 次並檢查資料');
		for (let i = 0; i < 3; i++) {
			const startedAt = Date.now();
			await test1Page.reload();
			await administrationApi.assertWorkspaceVisibleInTable(test1Page, WORKSPACE_NAME, 10000);
			const elapsed = Date.now() - startedAt;
			reloadDurations.push(elapsed);
			logger.normal(`Reload cycle ${i + 1}`, { actionType: 'page-reload', elapsedMs: elapsed });
		}

		const finalRow = await administrationApi.assertWorkspaceVisibleInTable(test1Page, WORKSPACE_NAME);
		await expect(finalRow).toContainText(WORKSPACE_NAME);
		await expect(finalRow).toContainText(/\b(3|4)\b/);
		logger.normal('Step 25: 三個帳號讀取操作皆成功', {
			viewLatencyMs: viewLatency,
			describeLatencyMs: describeLatency,
			reloadDurationsMs: reloadDurations
		});

		logger.normal('清理測試資料: 由 admin 刪除 workspace');
		await administrationApi.openWorkspacePage(adminPage);
		await administrationApi.ensureWorkspaceDeleted(adminPage, WORKSPACE_NAME);
	} finally {
		await adminContext.close();
		await test1Context.close();
		await test2Context.close();
		await test3Context.close();
	}
});
