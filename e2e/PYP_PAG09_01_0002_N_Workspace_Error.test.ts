/* PATTERN_METADATA_START
feature=Administration - Workspace
group_rep_tc_id=6085
group_members=1246,1280,1285,1984,2015,2016,2029,2042,2053,2061,2062,2069,6038,6052,6055,6060,6062,6079,6083,6085,6091
factor_type=Effect,Error,Normal
group_id=PYP_PAG09_01_0002
generated_at=2026-07-02T09:41:19+0800
PATTERN_METADATA_END */

import { expect, test, type Page } from '@playwright/test';
import * as loginApi from './api/login.api';
import * as menuPageApi from './api/menu_page.api';
import * as administrationApi from './api/Administration_Workspace.api';
import * as administrationLocators from './locator/Administration_Workspace_locator';
import { createLogger } from './utils/logger';
import * as rapidgenResults from './utils/rapidgen_results';
import * as utils from './utils/utils';

const patternName = utils.getPatternNameFromModuleUrl(import.meta.url);
const JIRA_Key = 'SYSTCAI-1958'; // TODO: 由 coding 人員填寫對應 JIRA Key
const DEFAULT_WORKSPACE = 'test-role';
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

test.describe.serial('PYP_PAG09_01_0002_N_Workspace_Error', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		const context = await browser.newContext({ viewport: null });
		page = await context.newPage();
		await openWorkspacePage(page);
	});

	test.afterAll(async () => {
		await page?.context().close();
	});

	test.beforeEach(async ({}, testInfo) => {
		logger.normal('=== Before test start ===', {
			pattern: patternName,
			jiraKey: JIRA_Key,
			testTitle: testInfo.title
		});
	});

	test('tc1: invalid workspace name should not create workspace', async () => {
		const invalidWorkspaceNames = [
			'1 invalid@#$',
			'has space',
			'bad@name',
			'a'.repeat(255)
		];

		try {
			logger.normal('TC1 started', { baseUrl: utils.DASHBOARD_BASE_URL, invalidWorkspaceNames });

			for (const invalidWorkspaceName of invalidWorkspaceNames) {
				logger.normal('Step 2: Call createWorkspace API with invalid workspace name (exist_table=false)', {
					invalidWorkspaceName
				});
				await administrationApi.createWorkspace(page, invalidWorkspaceName, [], [], [], false);

				logger.normal('Step 3: createWorkspace API completed "workspace must not exist in table" validation', {
					invalidWorkspaceName
				});
			}

			logger.normal('TC1 passed: invalid workspace name is blocked and no workspace row is created');
		} catch (error) {
			logger.error('TC1 failed', error instanceof Error ? error.message : String(error));
			throw error;
		}
	});

	test('tc2: invalid namespace name should not create workspace', async () => {
		const validWorkspaceName = 'ws-valid-for-ns-error';
		const invalidNamespaceNames = [
			'1 invalid@#$',
			'has space',
			'bad@name'
		];

		try {
			logger.normal('TC2 started', {
				baseUrl: utils.DASHBOARD_BASE_URL,
				validWorkspaceName,
				invalidNamespaceNames
			});

			for (const invalidNamespaceName of invalidNamespaceNames) {
				logger.normal('Step 2: Call createWorkspace API with invalid namespace name (exist_table=false)', {
					validWorkspaceName,
					invalidNamespaceName
				});
				await administrationApi.createWorkspace(page, validWorkspaceName, [], [invalidNamespaceName], [], false);

				logger.normal('Step 3: createWorkspace API completed "workspace must not exist in table" validation', {
					validWorkspaceName,
					invalidNamespaceName
				});
			}

			logger.normal('TC2 passed: invalid namespace name is blocked and no workspace row is created');
		} catch (error) {
			logger.error('TC2 failed', error instanceof Error ? error.message : String(error));
			throw error;
		}
	});

	test('tc3: duplicate workspace name should show error toast', async () => {
		const workspaceName = 'ws-duplicate-name-error';

		try {
			logger.normal('TC3 started', { baseUrl: utils.DASHBOARD_BASE_URL, workspaceName });

			logger.normal('Step 1: Ensure clean state and create workspace', { workspaceName });
			await administrationApi.ensureWorkspaceDeleted(page, workspaceName);
			await administrationApi.createWorkspace(page, workspaceName, [], [], [], true);

			logger.normal('Step 1.1: Reload page after first create to clear success toast');
			await page.reload({ waitUntil: 'domcontentloaded' });
			await administrationApi.openWorkspacePage(page);

			logger.normal('Step 2: Attempt to create workspace with duplicate name (exist_table=false)', {
				workspaceName
			});
			await administrationApi.createWorkspace(page, workspaceName, [], [], [], false);

			logger.normal('Step 3: Verify error toast is displayed for duplicate workspace name');
			const nameConflictToast = administrationLocators.getWorkspaceNameConflictToasts(page);
			const createErrorToast = administrationLocators.getWorkspaceCreateErrorToasts(page);
			await expect(nameConflictToast.or(createErrorToast)).toBeVisible({ timeout: 15000 });

			logger.normal('TC3 passed: duplicate workspace name shows error toast');
		} catch (error) {
			logger.error('TC3 failed', error instanceof Error ? error.message : String(error));
			throw error;
		} finally {
			logger.normal('TC3 cleanup: search workspace in filter and delete to restore environment', { workspaceName });
			await administrationApi.ensureWorkspaceDeleted(page, workspaceName);
			logger.normal('TC3 cleanup: switch workspace to test-role', { workspace: DEFAULT_WORKSPACE });
			await administrationApi.switchWorkspace(page, DEFAULT_WORKSPACE);
		}
	});

	test('tc4: wrong workspace name should not delete workspace', async () => {
		const workspaceName = 'ws-delete-name-error';
		const wrongWorkspaceNames = [
			`${workspaceName}-wrong`,
			'wrong-workspace-name',
			workspaceName.slice(0, -1),
			'錯誤工作區名稱'
		];

		try {
			logger.normal('TC4 started', { baseUrl: utils.DASHBOARD_BASE_URL, workspaceName, wrongWorkspaceNames });

			logger.normal('Step 0: Reload page to clear leftover toasts from previous tests');
			await page.reload({ waitUntil: 'domcontentloaded' });
			await administrationApi.openWorkspacePage(page);

			logger.normal('Step 1: Ensure clean state and create workspace', { workspaceName });
			await administrationApi.ensureWorkspaceDeleted(page, workspaceName);
			await administrationApi.createWorkspace(page, workspaceName, [], [], [], true);

			for (const wrongWorkspaceName of wrongWorkspaceNames) {
				logger.normal('Step 2: Attempt delete with wrong confirm name', { workspaceName, wrongWorkspaceName });
				await administrationApi.submitDeleteWorkspaceWithMismatchedNameAndAssertBlocked(
					page,
					workspaceName,
					wrongWorkspaceName
				);

				logger.normal('Step 3: Delete blocked and workspace still exists', { workspaceName, wrongWorkspaceName });
			}

			logger.normal('TC4 passed: wrong workspace name cannot delete workspace');
		} catch (error) {
			logger.error('TC4 failed', error instanceof Error ? error.message : String(error));
			throw error;
		} finally {
			logger.normal('TC4 cleanup: delete workspace to restore environment', { workspaceName });
			await administrationApi.ensureWorkspaceDeleted(page, workspaceName);
		}
	});

	test('tc5: invalid GPU Request or GPU Limit format should not create workspace', async () => {
		const invalidGpuCases = [
			{
				workspaceName: 'ws-invalid-gpu-req-text',
				field: 'GPU Request',
				invalidValue: 'two',
				resourceQuotas: ['8', '16Gi', 'two', '0', '16', '32Gi', '0', '0']
			},
			{
				workspaceName: 'ws-invalid-gpu-req-abcgpu',
				field: 'GPU Request',
				invalidValue: 'abcGPU',
				resourceQuotas: ['8', '16Gi', 'abcGPU', '0', '16', '32Gi', '0', '0']
			},
			{
				workspaceName: 'ws-invalid-gpu-lim-text',
				field: 'GPU Limit',
				invalidValue: 'two',
				resourceQuotas: ['8', '16Gi', '0', '0', '16', '32Gi', 'two', '0']
			}
		];

		try {
			logger.normal('TC5 started', { baseUrl: utils.DASHBOARD_BASE_URL, invalidGpuCases });

			for (const { workspaceName, field, invalidValue, resourceQuotas } of invalidGpuCases) {
				logger.normal('Step 2: Call createWorkspace API with invalid GPU quota (exist_table=false)', {
					workspaceName,
					field,
					invalidValue
				});
				await administrationApi.createWorkspace(page, workspaceName, [], [], resourceQuotas, false);

				logger.normal('Step 3: createWorkspace API completed "workspace must not exist in table" validation', {
					workspaceName,
					field,
					invalidValue
				});
			}

			logger.normal('TC5 passed: invalid GPU Request/Limit format is blocked and no workspace row is created');
		} catch (error) {
			logger.error('TC5 failed', error instanceof Error ? error.message : String(error));
			throw error;
		}
	});
});
