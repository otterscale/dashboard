/* PATTERN_METADATA_START
feature=Administration - Workspace
group_rep_tc_id=2054
group_members=1258,1262,1263,1266,1276,1969,2000,2001,2002,2008,2013,2014,2046,2054,2072,6033,6043,6044
factor_type=Normal,Stability,Stress
group_id=PYP_PAG09_01_0001
generated_at=2026-07-02T09:41:19+0800
PATTERN_METADATA_END */

import { test } from '@playwright/test';
import * as loginApi from './api/login.api';
import * as menuPageApi from './api/menu_page.api';
import * as administrationApi from './api/Administration_Workspace.api';
import { createLogger } from './utils/logger';
import * as rapidgenResults from './utils/rapidgen_results';
import * as utils from './utils/utils';
import * as videoRecord from './utils/video_record';

const patternName = utils.getPatternNameFromModuleUrl(import.meta.url);
const JIRA_Key = 'SYSTCAI-1957'; // TODO: 由 coding 人員填寫對應 JIRA Key
const logger = createLogger(patternName);

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

test('PYP_PAG09_01_0001_N_Workspace_Basic', async ({ page }) => {
	const workspaceName = 'workspace-rapid-test';

	try {
		logger.normal('=== Test start ===', { pattern: patternName, jiraKey: JIRA_Key, baseUrl: utils.DASHBOARD_BASE_URL });

		const members = [{ name: 'test1', role: 'edit' }];
		const resourceQuotas = ['8', '16Gi', '0', '0', '16', '32Gi', '0', '0'];
		const menuPath = ['Platform', 'Administration', 'Workspace'] as const;

		logger.normal('Step 1: Navigate to Dashboard home page');
		await page.goto(utils.DASHBOARD_BASE_URL);
		logger.normal('Step 1 done: Home page opened', { currentUrl: page.url() });

		logger.normal('Step 2: Login with admin account');
		await loginApi.loginWithUsernameAndPassword(page, 'admin', 'pps8299');
		logger.normal('Step 2 done: Login completed');

		logger.normal('Step 3: Open Workspace page from sidebar', {
			depth: menuPath.length,
			menuPath
		});
		await menuPageApi.clickMenuPathByNames(page, menuPath[0], menuPath[1], menuPath[2]);
		logger.normal('Step 3 done: Workspace page opened');

		logger.normal('Step 4-17: Rapid create/delete/recreate with same workspace name', {
			workspaceName,
			members,
			resourceQuotas
		});
		await administrationApi.rapidCreateDeleteRecreateWorkspace(page, workspaceName, members, resourceQuotas);
		logger.normal('Step 4-17 done: Workspace create/delete/recreate flow passed');

		logger.normal('TEST RESULT: PASS');
	} catch (error) {
		logger.error(
			'TEST RESULT: FAIL',
			error instanceof Error ? error.message : String(error)
		);
		throw error;
	} finally {
		logger.normal('Cleanup: remove workspace for idempotent rerun', { workspaceName });
		await administrationApi.ensureWorkspaceDeleted(page, workspaceName);
	}
});
