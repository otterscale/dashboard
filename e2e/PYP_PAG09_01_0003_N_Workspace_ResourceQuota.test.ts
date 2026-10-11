/* PATTERN_METADATA_START
feature=Administration - Workspace
group_rep_tc_id=6094
group_members=1260,1294,1299,1302,1958,1989,1992,2021,2025,2026,2039,2045,2049,2058,2065,2067,2081,2083,2093,6047,6048,6049,6052,6061,6062,6067,6075,6080,6088,6090,6094
factor_type=Boundary,Effect,Error,Normal
group_id=PYP_PAG09_01_0003
generated_at=2026-07-02T09:41:19+0800
PATTERN_METADATA_END */

import { test, type Page } from '@playwright/test';
import * as loginApi from './api/login.api';
import * as menuPageApi from './api/menu_page.api';
import * as administrationApi from './api/Administration_Workspace.api';
import { createLogger } from './utils/logger';
import * as rapidgenResults from './utils/rapidgen_results';
import * as utils from './utils/utils';

const patternName = utils.getPatternNameFromModuleUrl(import.meta.url);
const JIRA_Key = 'SYSTCAI-1959'; // TODO: 由 coding 人員填寫對應 JIRA Key
const logger = createLogger(patternName);

test.use({
	headless: utils.BROWSER_HEADLESS,
	viewport: null,
	video: utils.ENABLE_E2E_VIDEO ? 'on' : 'off',
	launchOptions: {
		args: ['--start-maximized']
	}
});

test.afterEach(async ({}, testInfo) => {
	await rapidgenResults.submitPatternResults(testInfo, import.meta.url);
});

async function openWorkspacePage(page: Page) {
	logger.normal('Step 1.1: Navigate to Dashboard home page');
	await page.goto(utils.DASHBOARD_BASE_URL);
	logger.normal('Navigated to home page', page.url());

	logger.normal('Step 1.2: Login with admin account');
	await loginApi.loginWithUsernameAndPassword(page, 'admin', 'pps8299');
	logger.normal('Login flow finished');

	logger.normal('Step 1.3: Go to Platform -> Administration -> Workspace');
	const menuPath = ['Platform', 'Administration', 'Workspace'] as const;
	await menuPageApi.clickMenuPathByNames(page, menuPath[0], menuPath[1], menuPath[2]);
	logger.normal('Workspace page opened');
}

test.describe('PYP_PAG09_01_0003_N_Workspace_ResourceQuota', () => {
	test.beforeEach(async ({}, testInfo) => {
		logger.normal('=== Before test start ===', {
			pattern: patternName,
			jiraKey: JIRA_Key,
			testTitle: testInfo.title
		});
	});

	test('TC1: Error Case - invalid resource quota values should not create workspace rows', async ({ page }) => {
		const cases = [
			{
				id: 'TC1-1',
				workspaceName: 'rq-invalid-cpu-req',
				stepMessage: 'Create workspace with CPU Request = 888',
				resourceQuotas: ['888', '16Gi', '0', '0', '16', '32Gi', '0', '0']
			},
			{
				id: 'TC1-2',
				workspaceName: 'rq-invalid-gpu-req',
				stepMessage: 'Create workspace with GPU Request = 888',
				resourceQuotas: ['8', '16Gi', '888', '0', '16', '32Gi', '0', '0']
			},
			{
				id: 'TC1-3',
				workspaceName: 'rq-invalid-cpu-req-abc',
				stepMessage: 'Create workspace with CPU Request = abc (non-numeric text)',
				resourceQuotas: ['abc', '16Gi', '0', '0', '16', '32Gi', '0', '0']
			},
			{
				id: 'TC1-4',
				workspaceName: 'rq-invalid-memory-req-negative',
				stepMessage: 'Create workspace with Memory Request = -16Gi (negative value)',
				resourceQuotas: ['8', '-16Gi', '0', '0', '16', '32Gi', '0', '0']
			},
			{
				id: 'TC1-5',
				workspaceName: 'rq-invalid-cpu-req-limit-extreme',
				stepMessage: 'Create workspace with CPU Request = 999999 and CPU Limit = 999999 (extremely large values)',
				resourceQuotas: ['999999', '16Gi', '0', '0', '999999', '32Gi', '0', '0']
			}
		];

		logger.normal('Step 1: Open Workspace page');
		await openWorkspacePage(page);

		for (const tc of cases) {
			try {
				logger.normal(`${tc.id} started`, {
					workspaceName: tc.workspaceName,
					resourceQuotas: tc.resourceQuotas
				});

				logger.normal(`Step 2: ${tc.stepMessage}`);
				await administrationApi.createWorkspace(
					page,
					tc.workspaceName,
					[],
					[],
					tc.resourceQuotas,
					false
				);

				logger.normal('Step 3: Verify workspace does not appear in table');
				logger.normal(`${tc.id} passed: workspace is not present in table`);
			} catch (error) {
				logger.error(`${tc.id} failed`, error instanceof Error ? error.message : String(error));
				throw error;
			} finally {
				logger.normal(`${tc.id} cleanup: ensure workspace deleted if created`, {
					workspaceName: tc.workspaceName
				});
				await administrationApi.ensureWorkspaceDeleted(page, tc.workspaceName);
			}
		}
	});

	test('TC2: Normal Case - valid limit values should create workspace rows', async ({ page }) => {
		const cases = [
			{
				id: 'TC2-1',
				workspaceNamePrefix: 'rq-valid-cpu-limit-888',
				stepMessage: 'Create workspace with CPU Limit = 888',
				resourceQuotas: ['8', '16Gi', '0', '0', '888', '32Gi', '0', '0']
			},
			{
				id: 'TC2-2',
				workspaceNamePrefix: 'rq-valid-gpu-limit-888',
				stepMessage: 'Create workspace with GPU Limit = 888',
				resourceQuotas: ['8', '16Gi', '0', '0', '16', '32Gi', '888', '0']
			}
		];

		logger.normal('Step 1: Open Workspace page');
		await openWorkspacePage(page);

		for (const tc of cases) {
			const workspaceName = `${tc.workspaceNamePrefix}-${Date.now()}`;

			try {
				logger.normal(`${tc.id} started`, { workspaceName, resourceQuotas: tc.resourceQuotas });

				logger.normal(`Step 2: ${tc.stepMessage}`);
				await administrationApi.createWorkspace(
					page,
					workspaceName,
					[],
					[],
					tc.resourceQuotas,
					true
				);

				logger.normal('Step 3: Verify workspace appears in table');
				logger.normal(`${tc.id} passed: workspace is present in table`);
			} catch (error) {
				logger.error(`${tc.id} failed`, error instanceof Error ? error.message : String(error));
				throw error;
			} finally {
				logger.normal(`${tc.id} cleanup: ensure workspace deleted`, { workspaceName });
				await administrationApi.ensureWorkspaceDeleted(page, workspaceName);
			}
		}
	});

	test('TC3: Normal Case - update resource quota values should reflect in table', async ({ page }) => {
		const workspaceName = `rq-update-quota-${Date.now()}`;
		const initialQuotas = ['8', '16Gi', '0', '0', '8', '16Gi', '0', '88888Gi'];
		const updatedQuotas = ['8', '16Gi', '0', '0', '16', '32Gi', '0', '88888Gi'];

		try {
			logger.normal('TC3 started', { workspaceName, initialQuotas, updatedQuotas });

			logger.normal('Step 1: Open Workspace page');
			await openWorkspacePage(page);

			logger.normal('Step 2: Create workspace with initial resource quotas');
			await administrationApi.createWorkspace(page, workspaceName, [], [], initialQuotas, true);

			logger.normal('Step 3: Update workspace resource quotas');
			await administrationApi.updateWorkspace(page, workspaceName, [], [], updatedQuotas);

			logger.normal('Step 4: Verify updated resource quotas in table');
			await administrationApi.verifyWorkspaceResourceQuotaInTable(page, workspaceName, updatedQuotas);
			logger.normal('TC3 passed: updated resource quotas are present in table');
		} catch (error) {
			logger.error('TC3 failed', error instanceof Error ? error.message : String(error));
			throw error;
		} finally {
			logger.normal('TC3 cleanup: ensure workspace deleted', { workspaceName });
			await administrationApi.ensureWorkspaceDeleted(page, workspaceName);
		}
	});
});
