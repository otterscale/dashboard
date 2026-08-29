import { expect, test, type Locator, type Page } from '@playwright/test';
import * as administrationApi from './api/Administration_Workspace.api';
import * as loginApi from './api/login.api';
import * as objectStorageApi from './api/Storage_ObjectStorage.api';
import * as pvcApi from './api/Storage_PersistentVolumeClaim.api';
import * as storageClassApi from './api/Storage_StorageClass.api';
import * as deploymentApi from './api/Workloads_Deployment.api';
import * as statefulSetApi from './api/Workloads_StatefulSet.api';
import * as daemonSetApi from './api/Workloads_DaemonSet.api';
import * as cronJobApi from './api/Workloads_CronJob.api';
import * as jobApi from './api/Workloads_Job.api';
import * as podApi from './api/Workloads_Pod.api';
import * as configMapApi from './api/Configuration_ConfigMap.api';
import * as objectStorageLocators from './locator/Storage_ObjectStorage_locator';
import * as storageClassLocators from './locator/Storage_StorageClass_locator';
import { createLogger } from './utils/logger';
import * as utils from './utils/utils';
import * as videoRecord from './utils/video_record';

const logger = createLogger('test_pattern');
/** Short timeout for Init table existence probes when resources may already exist. */
const INIT_TABLE_PROBE_TIMEOUT_MS = 3000;
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'pps8299';
const WORKSPACE_NAME = 'test-role';
const OBJECT_STORAGE_NAME = 'test-role-obc';
const STORAGE_CLASS_NAME = 'test-role-sc';
const PVC_NAME = pvcApi.ROLE_PVC_NAME;
const DEPLOYMENT_NAME = deploymentApi.ROLE_DEPLOYMENT_NAME;
const STATEFULSET_NAME = statefulSetApi.ROLE_STATEFULSET_NAME;
const DAEMONSET_NAME = daemonSetApi.ROLE_DAEMONSET_NAME;
const CRONJOB_NAME = cronJobApi.ROLE_CRONJOB_NAME;
const JOB_NAME = jobApi.ROLE_JOB_NAME;
const POD_NAME = podApi.ROLE_POD_NAME;
const CONFIGMAP_NAME = configMapApi.ROLE_CONFIGMAP_NAME;
const DEFAULT_RESOURCE_QUOTAS = ['8', '16Gi', '0', '0', '16', '32Gi', '0', '0'];
/** Namespace ResourceQuota hard limits written into Workspace YAML on create. */
const WORKSPACE_YAML_RESOURCE_QUOTA: administrationApi.WorkspaceYamlResourceQuota = {
	pvcCountQuota: '8',
	storageQuota: '16Gi'
};

type RegisterUser = {
	username: string;
	password: string;
	email: string;
	firstName: string;
	lastName: string;
};

const registerUsers: RegisterUser[] = [
	'test1',
	'test2',
	'test3',
	'test4',
	'test_admin_role',
	'test_edit_role',
	'test_view_role'
].map((username) => ({
	username,
	password: username,
	email: `${username}@phison.com`,
	firstName: username,
	lastName: username
}));

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertInitTableRowVisible(row: Locator, timeoutMs = INIT_TABLE_PROBE_TIMEOUT_MS): Promise<void> {
	await expect(row).toHaveCount(1, { timeout: timeoutMs });
	await expect(row).toBeVisible({ timeout: timeoutMs });
}

async function isInitTableRowVisible(row: Locator, timeoutMs = INIT_TABLE_PROBE_TIMEOUT_MS): Promise<boolean> {
	try {
		await assertInitTableRowVisible(row, timeoutMs);
		return true;
	} catch {
		return false;
	}
}

async function registerDefaultUsers(page: Page) {
	for (const user of registerUsers) {
		logger.normal('Registering user', user.username);
		await loginApi.register_user(
			page,
			user.username,
			user.password,
			user.email,
			user.firstName,
			user.lastName
		);
	}
}

async function ensureWorkspaceForRoleValidation(page: Page): Promise<void> {
	logger.normal('Open Workspace page');
	await administrationApi.openWorkspacePage(page);

	const hasWorkspace = await administrationApi.workspaceExists(page, WORKSPACE_NAME);
	logger.normal('Check workspace exists', { workspace: WORKSPACE_NAME, hasWorkspace });

	if (!hasWorkspace) {
		logger.normal('Create workspace with role members and YAML ResourceQuota', {
			workspace: WORKSPACE_NAME,
			yamlResourceQuota: WORKSPACE_YAML_RESOURCE_QUOTA
		});
		await administrationApi.createWorkspace(
			page,
			WORKSPACE_NAME,
			[
				{ name: 'test_admin_role', role: 'admin' },
				{ name: 'test_edit_role', role: 'edit' },
				{ name: 'test_view_role', role: 'view' }
			],
			[],
			DEFAULT_RESOURCE_QUOTAS,
			true,
			WORKSPACE_YAML_RESOURCE_QUOTA
		);
	}

	await administrationApi.assertWorkspaceVisibleInTable(page, WORKSPACE_NAME, INIT_TABLE_PROBE_TIMEOUT_MS);
	logger.normal('Workspace visible in table', { workspace: WORKSPACE_NAME });
}

async function ensureObjectStorageForRoleValidation(page: Page): Promise<void> {
	logger.normal('Open Object Storage page');
	await objectStorageApi.openObjectStoragePage(page);

	const objectStorageRow = objectStorageLocators.getObjectStorageTableRowByExactName(page, OBJECT_STORAGE_NAME);
	const hasObjectStorage = await isInitTableRowVisible(objectStorageRow);
	logger.normal('Check object storage exists', { objectStorageName: OBJECT_STORAGE_NAME, hasObjectStorage });

	if (!hasObjectStorage) {
		logger.normal('Create object storage', { objectStorageName: OBJECT_STORAGE_NAME });
		await objectStorageApi.createObjectStorageNameOnly(page, OBJECT_STORAGE_NAME);
	}

	await assertInitTableRowVisible(objectStorageRow);
	logger.normal('Object storage visible in table', { objectStorageName: OBJECT_STORAGE_NAME });
}

async function ensureStorageClassForRoleValidation(page: Page): Promise<void> {
	logger.normal('Open Storage Class page');
	await storageClassApi.openStorageClassPage(page);

	const storageClassNamePattern = new RegExp(`^\\s*${escapeRegExp(STORAGE_CLASS_NAME)}\\s*$`, 'i');
	const storageClassRow = storageClassLocators.getStorageClassTableRowByName(page, storageClassNamePattern);
	const hasStorageClass = await isInitTableRowVisible(storageClassRow);
	logger.normal('Check storage class exists', { storageClassName: STORAGE_CLASS_NAME, hasStorageClass });

	if (!hasStorageClass) {
		logger.normal('Create storage class', { storageClassName: STORAGE_CLASS_NAME });
		await storageClassApi.ensureStorageClassWithNfsProvisioner(page, STORAGE_CLASS_NAME);
	}

	await assertInitTableRowVisible(storageClassRow);
	logger.normal('Storage class visible in table', { storageClassName: STORAGE_CLASS_NAME });
}

async function ensurePersistentVolumeClaimForRoleValidation(page: Page): Promise<void> {
	logger.normal('Switch to test-role workspace before PVC setup');
	await administrationApi.switchWorkspace(page, WORKSPACE_NAME);

	logger.normal('Open PersistentVolumeClaim page');
	await pvcApi.openPersistentVolumeClaimPage(page);
	const hasPersistentVolumeClaim = await pvcApi.isPersistentVolumeClaimPresentAfterNameFilter(
		page,
		PVC_NAME,
		INIT_TABLE_PROBE_TIMEOUT_MS
	);
	logger.normal('Check PVC exists', { persistentVolumeClaimName: PVC_NAME, hasPersistentVolumeClaim });

	if (!hasPersistentVolumeClaim) {
		logger.normal('Create PVC', {
			persistentVolumeClaimName: PVC_NAME,
			storageClassName: pvcApi.ROLE_PVC_STORAGE_CLASS
		});
		await pvcApi.ensureBasicPersistentVolumeClaim(
			page,
			PVC_NAME,
			pvcApi.BASIC_PVC_STORAGE,
			pvcApi.ROLE_PVC_STORAGE_CLASS
		);
	}

	await pvcApi.searchPersistentVolumeClaimByName(page, PVC_NAME, INIT_TABLE_PROBE_TIMEOUT_MS);
	await pvcApi.assertPersistentVolumeClaimRowVisible(page, PVC_NAME, {
		pollTimeoutMs: INIT_TABLE_PROBE_TIMEOUT_MS
	});
	logger.normal('PVC visible in table', { persistentVolumeClaimName: PVC_NAME });
}

async function ensureStatefulSetForRoleValidation(page: Page): Promise<void> {
	logger.normal('Switch to test-role workspace before StatefulSet setup');
	await administrationApi.switchWorkspace(page, WORKSPACE_NAME);

	logger.normal('Open StatefulSet page and search by name');
	const hasStatefulSet = await statefulSetApi.isStatefulSetPresentAfterNameFilter(
		page,
		STATEFULSET_NAME,
		WORKSPACE_NAME,
		INIT_TABLE_PROBE_TIMEOUT_MS
	);
	logger.normal('Check statefulSet exists', { statefulSetName: STATEFULSET_NAME, hasStatefulSet });

	if (!hasStatefulSet) {
		logger.normal('Create statefulSet', { statefulSetName: STATEFULSET_NAME });
		await statefulSetApi.ensureBasicRoleStatefulSet(page, STATEFULSET_NAME, WORKSPACE_NAME);
	}

	logger.normal('StatefulSet visible in table', { statefulSetName: STATEFULSET_NAME });
}

async function ensureDeploymentForRoleValidation(page: Page): Promise<void> {
	logger.normal('Switch to test-role workspace before Deployment setup');
	await administrationApi.switchWorkspace(page, WORKSPACE_NAME);

	logger.normal('Open Deployment page and search by name');
	const hasDeployment = await deploymentApi.isDeploymentPresentAfterNameFilter(
		page,
		DEPLOYMENT_NAME,
		WORKSPACE_NAME,
		INIT_TABLE_PROBE_TIMEOUT_MS
	);
	logger.normal('Check deployment exists', { deploymentName: DEPLOYMENT_NAME, hasDeployment });

	if (!hasDeployment) {
		logger.normal('Create deployment', { deploymentName: DEPLOYMENT_NAME });
		await deploymentApi.ensureBasicRoleDeployment(page, DEPLOYMENT_NAME, WORKSPACE_NAME);
	}

	logger.normal('Deployment visible in table', { deploymentName: DEPLOYMENT_NAME });
}

async function ensureDaemonSetForRoleValidation(page: Page): Promise<void> {
	logger.normal('Switch to test-role workspace before DaemonSet setup');
	await administrationApi.switchWorkspace(page, WORKSPACE_NAME);

	logger.normal('Open DaemonSet page and search by name');
	const hasDaemonSet = await daemonSetApi.isDaemonSetPresentAfterNameFilter(
		page,
		DAEMONSET_NAME,
		WORKSPACE_NAME,
		INIT_TABLE_PROBE_TIMEOUT_MS
	);
	logger.normal('Check daemonSet exists', { daemonSetName: DAEMONSET_NAME, hasDaemonSet });

	if (!hasDaemonSet) {
		logger.normal('Create daemonSet', { daemonSetName: DAEMONSET_NAME });
		await daemonSetApi.ensureBasicRoleDaemonSet(page, DAEMONSET_NAME, WORKSPACE_NAME);
	}

	logger.normal('DaemonSet visible in table', { daemonSetName: DAEMONSET_NAME });
}

async function ensureCronJobForRoleValidation(page: Page): Promise<void> {
	logger.normal('Switch to test-role workspace before CronJob setup');
	await administrationApi.switchWorkspace(page, WORKSPACE_NAME);

	logger.normal('Open CronJob page and search by name');
	const hasCronJob = await cronJobApi.isCronJobPresentAfterNameFilter(
		page,
		CRONJOB_NAME,
		WORKSPACE_NAME,
		INIT_TABLE_PROBE_TIMEOUT_MS
	);
	logger.normal('Check cronJob exists', { cronJobName: CRONJOB_NAME, hasCronJob });

	if (!hasCronJob) {
		logger.normal('Create cronJob', { cronJobName: CRONJOB_NAME });
		await cronJobApi.ensureBasicRoleCronJob(page, CRONJOB_NAME, WORKSPACE_NAME);
	}

	logger.normal('CronJob visible in table', { cronJobName: CRONJOB_NAME });
}

async function ensureJobForRoleValidation(page: Page): Promise<void> {
	logger.normal('Switch to test-role workspace before Job setup');
	await administrationApi.switchWorkspace(page, WORKSPACE_NAME);

	logger.normal('Open Job page and search by name');
	const hasJob = await jobApi.isJobPresentAfterNameFilter(
		page,
		JOB_NAME,
		WORKSPACE_NAME,
		INIT_TABLE_PROBE_TIMEOUT_MS
	);
	logger.normal('Check job exists', { jobName: JOB_NAME, hasJob });

	if (!hasJob) {
		logger.normal('Create job', { jobName: JOB_NAME });
		await jobApi.ensureBasicRoleJob(page, JOB_NAME, WORKSPACE_NAME);
	}

	logger.normal('Job visible in table', { jobName: JOB_NAME });
}

async function ensurePodForRoleValidation(page: Page): Promise<void> {
	logger.normal('Switch to test-role workspace before Pod setup');
	await administrationApi.switchWorkspace(page, WORKSPACE_NAME);

	logger.normal('Open Pod page and search by name');
	const hasPod = await podApi.isPodPresentAfterNameFilter(
		page,
		POD_NAME,
		WORKSPACE_NAME,
		INIT_TABLE_PROBE_TIMEOUT_MS
	);
	logger.normal('Check pod exists', { podName: POD_NAME, hasPod });

	if (!hasPod) {
		logger.normal('Create pod', { podName: POD_NAME });
		await podApi.ensureBasicRolePod(page, POD_NAME, WORKSPACE_NAME);
	}

	logger.normal('Pod visible in table', { podName: POD_NAME });
}

async function ensureConfigMapForRoleValidation(page: Page): Promise<void> {
	logger.normal('Switch to test-role workspace before ConfigMap setup');
	await administrationApi.switchWorkspace(page, WORKSPACE_NAME);

	logger.normal('Open ConfigMap page and search by name');
	const hasConfigMap = await configMapApi.isConfigMapPresentAfterNameFilter(
		page,
		CONFIGMAP_NAME,
		WORKSPACE_NAME,
		INIT_TABLE_PROBE_TIMEOUT_MS
	);
	logger.normal('Check configMap exists', { configMapName: CONFIGMAP_NAME, hasConfigMap });

	if (!hasConfigMap) {
		logger.normal('Create configMap', { configMapName: CONFIGMAP_NAME });
		await configMapApi.ensureBasicRoleConfigMap(page, CONFIGMAP_NAME, WORKSPACE_NAME);
	}

	logger.normal('ConfigMap visible in table', { configMapName: CONFIGMAP_NAME });
}

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
});

test('home page has login button', async ({ page }) => {
	try {
		logger.normal('Test started', { baseUrl: utils.DASHBOARD_BASE_URL });
		await page.goto(utils.DASHBOARD_BASE_URL);
		logger.normal('Navigated to home page', page.url());
		await registerDefaultUsers(page);
		logger.normal('Register flow finished');

		await loginApi.loginWithUsernameAndPassword(page, ADMIN_USERNAME, ADMIN_PASSWORD);
		logger.normal('Admin login finished');

		await ensureWorkspaceForRoleValidation(page);
		logger.normal('Workspace role flow finished');
		await ensureObjectStorageForRoleValidation(page);
		logger.normal('Object Storage flow finished');
		await ensureStorageClassForRoleValidation(page);
		logger.normal('Storage Class flow finished');
		await ensurePersistentVolumeClaimForRoleValidation(page);
		logger.normal('PersistentVolumeClaim flow finished');
		await ensureDeploymentForRoleValidation(page);
		logger.normal('Deployment flow finished');
		await ensureStatefulSetForRoleValidation(page);
		logger.normal('StatefulSet flow finished');
		await ensureDaemonSetForRoleValidation(page);
		logger.normal('DaemonSet flow finished');
		await ensureCronJobForRoleValidation(page);
		logger.normal('CronJob flow finished');
		await ensureJobForRoleValidation(page);
		logger.normal('Job flow finished');
		await ensurePodForRoleValidation(page);
		logger.normal('Pod flow finished');
		await ensureConfigMapForRoleValidation(page);
		logger.normal('ConfigMap flow finished');

		logger.normal('TEST RESULT: PASS');
	} catch (error) {
		logger.error('TEST RESULT: FAIL', error instanceof Error ? error.message : String(error));
		throw error;
	}
});
