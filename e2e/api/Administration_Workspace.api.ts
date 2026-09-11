import { expect, type Locator, type Page, type Response } from '@playwright/test';

import * as administrationLocators from '../locator/Administration_Workspace_locator.js';
import { createLogger } from '../utils/logger.js';
import * as menuPageApi from './menu_page.api.js';

type WorkspaceMember = {
	name: string;
	role?: string;
};

/** Optional hard limits appended to Workspace YAML on the create wizard final step. */
export type WorkspaceYamlResourceQuota = {
	pvcCountQuota?: string;
	storageQuota?: string;
};

/** Short pause so comboboxes and re-renders settle between actions. */
const NEXT_IDLE_MS = 100;
/** Probe briefly for optional dialog close controls before falling back. */
const DIALOG_CLOSE_PROBE_MS = 500;
/** Avoid long default action timeout when close/cancel controls are absent. */
const DIALOG_CLOSE_ACTION_MS = 3000;
const logger = createLogger('administration_workspace_api');

async function selectMemberBySearch(page: Page, memberRow: Locator, username: string): Promise<void> {
	const nameCombobox = await $unique(
		administrationLocators.getWorkspaceMemberNameCombobox(memberRow),
		`member name combobox: ${username}`
	);
	await nameCombobox.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const searchInput = administrationLocators.getCommandComboboxSearchInput(page);
	await expect(searchInput).toBeVisible();
	await searchInput.fill(username);

	const memberOption = await $unique(
		page.getByRole('option', { name: new RegExp(escapeRegExp(username), 'i') }),
		`member option: ${username}`
	);
	await memberOption.click();
}

async function selectMemberRole(page: Page, memberRow: Locator, role: string): Promise<void> {
	const rolePattern = new RegExp(`^${escapeRegExp(role)}$`, 'i');
	const roleDisplayPattern = new RegExp(`^\\s*${escapeRegExp(role)}\\s*$`, 'i');
	const roleCombobox = await $unique(
		administrationLocators.getWorkspaceMemberRoleCombobox(memberRow),
		`member role combobox: ${role}`
	);
	await roleCombobox.click();

	const roleOption = page.getByRole('option', { name: rolePattern });
	if ((await roleOption.count()) === 1) {
		await roleOption.click();
	} else {
		const menuOption = await $unique(page.getByRole('menuitem', { name: rolePattern }), `role menuitem: ${role}`);
		await menuOption.click();
	}

	await expect(roleCombobox).toContainText(roleDisplayPattern);
}

/** Fills allowed-namespace rows: add row, set name, then enable the matching switch or checkbox. */
async function fillNamespacesStep(page: Page, dialog: Locator, namespaces: string[]): Promise<void> {
	const namespaceInputs = administrationLocators.getNamespaceInputs(dialog);

	for (const namespace of namespaces) {
		const currentInputCount = await namespaceInputs.count();

		await dialog.getByRole('button', { name: /Add Namespace/i }).click();
		await expect(namespaceInputs).toHaveCount(currentInputCount + 1);
		await namespaceInputs.nth(currentInputCount).fill(namespace);
		await page.waitForTimeout(NEXT_IDLE_MS);

		const enabledSwitch = dialog.getByRole('switch', { name: /Enabled/i });
		if ((await enabledSwitch.count()) > currentInputCount) {
			await enabledSwitch.nth(currentInputCount).click();
			continue;
		}

		const enabledCheckbox = dialog.getByRole('checkbox', { name: /Enabled/i });
		if ((await enabledCheckbox.count()) > currentInputCount) {
			await enabledCheckbox.nth(currentInputCount).check();
		}
	}
}

/** Step 3 default quotas: one value per field in `RESOURCE_QUOTA_FIELD_NAMES` order, with a name fallback. */
async function fillResourceQuotaFields(page: Page, dialog: Locator, resource_quotas: string[]): Promise<void> {
	// New UI primarily exposes quota inputs by labels; keep legacy name-based fallback.
	const labelByQuotaIndex: Array<string | null> = [
		'CPU Request',
		'Memory Request',
		'GPU Request',
		'GPU Memory Request',
		'CPU Limit',
		'Memory Limit',
		'GPU Limit',
		'GPU Memory Limit'
	];

	const n = Math.min(resource_quotas.length, labelByQuotaIndex.length);
	for (let i = 0; i < n; i++) {
		const value = resource_quotas[i];
		if (value == null || value === '') continue;

		const label = labelByQuotaIndex[i];
		if (label) {
			const labelPattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'i');
			const labeledField = dialog.getByLabel(labelPattern).first();
			if ((await labeledField.count()) > 0) {
				await labeledField.fill(value);
				await page.waitForTimeout(NEXT_IDLE_MS);
				continue;
			}
		}

		// Legacy fallback: generated schema "name" attributes.
		const name = administrationLocators.RESOURCE_QUOTA_FIELD_NAMES[i];
		let field = administrationLocators.getResourceQuotaInputByName(dialog, name);
		if ((await field.count()) === 0) {
			const altSuffix = name.replace(/^root_/, '').replace(/\./g, '_');
			field = dialog.locator(`input[name$="_${altSuffix}"]`);
		}
		if ((await field.count()) === 0) continue;
		await field.first().fill(value);
		await page.waitForTimeout(NEXT_IDLE_MS);
	}
}

async function isLicenseInjectionEnabled(dialog: Locator): Promise<boolean> {
	const checkbox = administrationLocators.getWorkspaceLicenseInjectionCheckbox(dialog);
	const ariaChecked = (await checkbox.getAttribute('aria-checked')) ?? 'false';
	const dataState = (await checkbox.getAttribute('data-state')) ?? 'unchecked';
	return ariaChecked === 'true' || dataState === 'checked';
}

/** License injection step after members: optionally enable, then advance wizard. */
async function setLicenseInjectionEnabled(dialog: Locator, enabled: boolean): Promise<void> {
	const checkbox = administrationLocators.getWorkspaceLicenseInjectionCheckbox(dialog);
	await expect(checkbox).toBeVisible();

	if (enabled !== (await isLicenseInjectionEnabled(dialog))) {
		await checkbox.click();
	}

	await expect(checkbox).toHaveAttribute('aria-checked', enabled ? 'true' : 'false');
}

async function completeLicenseInjectionStep(
	dialog: Locator,
	page: Page,
	licenseInjectionEnabled: boolean
): Promise<void> {
	await setLicenseInjectionEnabled(dialog, licenseInjectionEnabled);
	await clickWorkspaceCreateNextButton(dialog, page, 'after license injection');
}

/** Edit / update flow: use the first visible Next in the dialog footer. */
async function clickWorkspaceWizardNext(dialog: Locator, page: Page): Promise<void> {
	const nextBtn = dialog.getByRole('button', { name: /^Next/i }).first();
	await expect(nextBtn).toBeVisible({ timeout: 30000 });
	await nextBtn.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
}

async function clickWorkspaceUpdateOrEditMenuItem(page: Page): Promise<void> {
	const updateMenu = administrationLocators.getWorkspaceActionsMenuItemByName(page, /^\s*Update\s*$/i);
	if ((await updateMenu.count()) > 0) {
		const updateMenuItem = await $unique(updateMenu, 'workspace update menu item');
		await updateMenuItem.click();
		return;
	}

	const legacyUpdateMenu = administrationLocators.getUpdateWorkspaceMenuItem(page);
	if ((await legacyUpdateMenu.count()) > 0) {
		const legacyUpdateMenuItem = await $unique(legacyUpdateMenu, 'legacy workspace update menu item');
		await legacyUpdateMenuItem.click();
		return;
	}

	const editMenu = administrationLocators.getWorkspaceActionsMenuItemByName(page, /^\s*Edit\s*$/i);
	const editMenuItem = await $unique(editMenu, 'workspace edit menu item');
	await editMenuItem.click();
}

async function openWorkspaceMembersOrEditDialog(page: Page, workspace_name: string): Promise<Locator> {
	const row = await $row(page, workspace_name, 20000);
	const actionButton = await $unique(administrationLocators.getRowActionsButton(row), 'workspace row actions button (members)');
	await actionButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const membersMenu = administrationLocators.getWorkspaceMembersMenuItem(page);
	if ((await membersMenu.count()) === 1) {
		await membersMenu.click();
	} else {
		await clickWorkspaceUpdateOrEditMenuItem(page);
	}
	await page.waitForTimeout(NEXT_IDLE_MS);

	return $dialog(page, 'update', 20000);
}

async function isRoleOptionDisabled(option: Locator): Promise<boolean> {
	const ariaDisabled = await option.getAttribute('aria-disabled');
	if (ariaDisabled === 'true') return true;
	const className = (await option.getAttribute('class')) ?? '';
	return /\b(disabled|opacity-50|pointer-events-none)\b/i.test(className);
}

async function verifyRoleGuardAndSelectNonAdmin(
	page: Page,
	memberRow: Locator,
	selectedRole: 'edit' | 'view'
): Promise<void> {
	const roleCombobox = await $unique(administrationLocators.getWorkspaceMemberRoleCombobox(memberRow), 'new member role combobox');
	await roleCombobox.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const adminOption = await $unique(administrationLocators.getWorkspaceMemberRoleOption(page, 'admin'), 'admin role option');
	const editOption = await $unique(administrationLocators.getWorkspaceMemberRoleOption(page, 'edit'), 'edit role option');
	const viewOption = await $unique(administrationLocators.getWorkspaceMemberRoleOption(page, 'view'), 'view role option');

	expect(await isRoleOptionDisabled(adminOption)).toBeTruthy();
	expect(await isRoleOptionDisabled(editOption)).toBeFalsy();
	expect(await isRoleOptionDisabled(viewOption)).toBeFalsy();

	const targetOption = selectedRole === 'edit' ? editOption : viewOption;
	await targetOption.click();
	await expect(roleCombobox).toContainText(new RegExp(`^\\s*${selectedRole}\\s*$`, 'i'));
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function $unique(locator: Locator, locatorName: string, timeout = 15000): Promise<Locator> {
	await expect(locator, `[${locatorName}] should be unique`).toHaveCount(1, { timeout });
	await expect(locator, `[${locatorName}] should be visible`).toBeVisible({ timeout });
	return locator;
}

async function $row(page: Page, workspace_name: string, timeout = 15000): Promise<Locator> {
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const row = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);
	return $unique(row, `workspace row: ${workspace_name}`, timeout);
}

async function $dialog(page: Page, dialogName: 'create' | 'delete' | 'update', timeout = 15000): Promise<Locator> {
	if (dialogName === 'create') {
		return $unique(administrationLocators.getCreateWorkspaceDialog(page), 'create workspace dialog', timeout);
	}
	if (dialogName === 'update') {
		return $unique(administrationLocators.getUpdateWorkspaceDialog(page), 'update workspace dialog', timeout);
	}
	return $unique(administrationLocators.getDeleteWorkspaceConfirmDialog(page), 'delete workspace dialog', timeout);
}

/** Create flow: every step should expose exactly one enabled Next button. */
async function clickWorkspaceCreateNextButton(dialog: Locator, page: Page, context: string): Promise<void> {
	const nextButton = administrationLocators.getWorkspaceWizardNextButton(dialog);
	await expect(nextButton, `[${context}] Expected a unique enabled Next button`).toHaveCount(1);
	await nextButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
}

/** Visible Next button in create wizard footer (may be disabled when validation fails). */
function getWorkspaceWizardNextButtonAnyState(dialog: Locator): Locator {
	return dialog.locator(':scope div.mt-auto.w-full button[type="submit"]:visible').filter({
		hasText: /^\s*Next\s*$/i
	});
}

async function assertNegativeCreateBlockedAtNamespaceStep(
	page: Page,
	dialog: Locator,
	workspaceNamePattern: RegExp
): Promise<void> {
	const nextButton = getWorkspaceWizardNextButtonAnyState(dialog);
	if ((await nextButton.count()) > 0) {
		await nextButton.first().click();
		await page.waitForTimeout(NEXT_IDLE_MS);
	}

	const validationMessages = administrationLocators.getWorkspaceCreateValidationMessages(dialog);
	const validationErrorMessages = validationMessages.filter({
		hasText: /(invalid|name|kubernetes|dns-1123|must|lowercase|alphanumeric|start|end|match pattern|allowedNamespaces)/i
	});
	const errorToasts = administrationLocators.getWorkspaceCreateErrorToasts(page);
	const enabledNext = administrationLocators.getWorkspaceWizardNextButton(dialog);
	const hasValidationError = (await validationErrorMessages.count()) > 0;
	const hasErrorToast = (await errorToasts.count()) > 0;
	const nextStillDisabled = (await enabledNext.count()) === 0;

	logger.normal('[createWorkspace] Negative namespace step validation result', {
		hasValidationError,
		hasErrorToast,
		nextStillDisabled
	});

	expect(hasValidationError || hasErrorToast || nextStillDisabled).toBeTruthy();

	const createdRow = administrationLocators.getCreatedWorkspaceTableRow(page, workspaceNamePattern);
	await expect(createdRow).toHaveCount(0);
	await closeCreateWorkspaceDialogIfOpen(page, dialog);
}

async function openCreateWorkspaceDialog(page: Page, dialog: Locator): Promise<void> {
	// Required path: top-left workspace switcher dropdown -> Create.
	const switchButton = administrationLocators.getWorkspaceSwitchDropdownTrigger(page);
	await expect(switchButton).toHaveCount(1);
	await expect(switchButton).toBeVisible();
	await switchButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const createMenuItem = administrationLocators.getWorkspaceSwitchCreateMenuItem(page);
	await expect(createMenuItem).toHaveCount(1);
	await expect(createMenuItem).toBeVisible();
	await createMenuItem.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await expect(dialog).toBeVisible({ timeout: 30000 });
}

async function closeCreateWorkspaceDialogIfOpen(page: Page, dialog: Locator): Promise<void> {
	if (!(await dialog.isVisible({ timeout: 0 }).catch(() => false))) return;

	logger.normal('[createWorkspace] Closing create workspace dialog');

	const closeButton = administrationLocators.getUpdateWorkspaceDialogCloseButton(dialog).first();
	if (await closeButton.isVisible({ timeout: DIALOG_CLOSE_PROBE_MS }).catch(() => false)) {
		await closeButton.click({ force: true, timeout: DIALOG_CLOSE_ACTION_MS }).catch(() => undefined);
		await page.waitForTimeout(NEXT_IDLE_MS);
	}

	if (await dialog.isVisible({ timeout: 0 }).catch(() => false)) {
		const cancelButton = dialog.getByRole('button', { name: /^\s*(Cancel|Close)\s*$/i }).first();
		if (await cancelButton.isVisible({ timeout: DIALOG_CLOSE_PROBE_MS }).catch(() => false)) {
			await cancelButton.click({ timeout: DIALOG_CLOSE_ACTION_MS }).catch(() => undefined);
			await page.waitForTimeout(NEXT_IDLE_MS);
		}
	}

	for (let attempt = 0; attempt < 3 && (await dialog.isVisible().catch(() => false)); attempt++) {
		await page.keyboard.press('Escape');
		await page.waitForTimeout(NEXT_IDLE_MS);
	}

	if (await dialog.isVisible().catch(() => false)) {
		throw new Error('[createWorkspace] Unable to close create workspace dialog before starting a new create flow');
	}

	logger.normal('[createWorkspace] Create workspace dialog closed');
}

async function ensureCreateWorkspaceDialogReady(page: Page, dialog: Locator): Promise<void> {
	await closeCreateWorkspaceDialogIfOpen(page, dialog);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(NEXT_IDLE_MS);
	await openCreateWorkspaceDialog(page, dialog);
}

async function assertWorkspaceResourceQuotaColumns(
	row: Locator,
	resource_quotas: string[]
): Promise<void> {
	const cells = row.locator('td[data-slot="table-cell"]');
	const cellCount = await cells.count();
	const table = row.locator('xpath=ancestor::table[1]');
	const headerCells = table.locator('thead th, tr[data-slot="table-header-row"] th');
	const headerCount = await headerCells.count();
	const headerValues = await Promise.all(
		Array.from({ length: headerCount }, async (_, i) => (await headerCells.nth(i).innerText()).trim())
	);

	const findColumnIndex = (headerPattern: RegExp): number =>
		headerValues.findIndex((header) => headerPattern.test(header));

	const getCellTextByColumn = async (headerPattern: RegExp): Promise<string | null> => {
		const index = findColumnIndex(headerPattern);
		if (index < 0 || index >= cellCount) return null;
		return (await cells.nth(index).innerText()).trim();
	};

	const normalizeQuota = (value: string) => value.replace(/\s+/g, '');
	const assertQuotaColumnIfPresent = async (
		headerPattern: RegExp,
		expectedValue: string | undefined
	): Promise<void> => {
		if (expectedValue == null || expectedValue === '') return;
		const cell = await getCellTextByColumn(headerPattern);
		// Some environments hide selected quota columns; only assert when the column exists.
		if (!cell) return;
		expect(normalizeQuota(cell)).toContain(normalizeQuota(expectedValue));
	};

	await assertQuotaColumnIfPresent(/^cpu\s*request$/i, resource_quotas[0]);
	await assertQuotaColumnIfPresent(/^memory\s*request$/i, resource_quotas[1]);
	await assertQuotaColumnIfPresent(/^cpu\s*limit$/i, resource_quotas[4]);
	await assertQuotaColumnIfPresent(/^memory\s*limit$/i, resource_quotas[5]);
	await assertQuotaColumnIfPresent(/^gpu\s*memory\s*limit$/i, resource_quotas[7]);
}

export async function verifyWorkspaceResourceQuotaInTable(
	page: Page,
	workspace_name: string,
	resource_quotas: string[]
): Promise<void> {
	logger.normal('[Administration_Workspace.api] verifyWorkspaceResourceQuotaInTable', { workspace_name });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const row = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);

	await expect(row).toBeVisible({ timeout: 10000 });
	await assertWorkspaceResourceQuotaColumns(row, resource_quotas);
}

export async function createWorkspace(
	page: Page,
	workspace_name: string,
	members: WorkspaceMember[] = [],
	namespaces: string[] = [],
	resource_quotas: string[] = [],
	exist_table = true,
	yamlResourceQuota?: WorkspaceYamlResourceQuota,
	licenseInjectionEnabled = false
): Promise<void> {
	logger.normal('[createWorkspace] Start', { workspace_name, exist_table, yamlResourceQuota, licenseInjectionEnabled });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const createdRow = administrationLocators.getCreatedWorkspaceTableRow(page, workspaceNamePattern);

	// 檢查 Create Workspace dialog 是否已經打開（由 Init.api.ts 打開）
	const dialog = administrationLocators.getCreateWorkspaceDialog(page);
	await ensureCreateWorkspaceDialogReady(page, dialog);

	const workspaceNameInput = administrationLocators.getWorkspaceNameInputInCreateDialog(dialog);
	await workspaceNameInput.fill(workspace_name);
	await expect(workspaceNameInput).toHaveValue(workspace_name);

	await clickWorkspaceCreateNextButton(dialog, page, 'after workspace');

	if (members.length > 0) {
		const memberRows = administrationLocators.getMemberArrayItems(dialog);
		for (let i = 0; i < members.length; i++) {
			const member = members[i];
			const currentCount = await memberRows.count();
			await dialog.getByRole('button', { name: /Add Member/i }).click();
			await expect(memberRows).toHaveCount(currentCount + 1);
			const currentMemberRow = memberRows.nth(currentCount);
			await selectMemberBySearch(page, currentMemberRow, member.name);
			if (member.role) {
				await selectMemberRole(page, currentMemberRow, member.role);
			}
		}
	}
	await clickWorkspaceCreateNextButton(dialog, page, 'after members');
	await completeLicenseInjectionStep(dialog, page, licenseInjectionEnabled);

	if (namespaces.length > 0) {
		await fillNamespacesStep(page, dialog, namespaces);
	}
	if (!exist_table && namespaces.length > 0) {
		await assertNegativeCreateBlockedAtNamespaceStep(page, dialog, workspaceNamePattern);
		return;
	}
	await clickWorkspaceCreateNextButton(dialog, page, 'after namespaces');

	if (resource_quotas.length > 0) {
		await page.waitForTimeout(NEXT_IDLE_MS);
		await fillResourceQuotaFields(page, dialog, resource_quotas);
		const n = Math.min(resource_quotas.length, administrationLocators.RESOURCE_QUOTA_FIELD_NAMES.length);
		for (let i = n - 1; i >= 0; i--) {
			const field = administrationLocators.getResourceQuotaInputByName(dialog, administrationLocators.RESOURCE_QUOTA_FIELD_NAMES[i]);
			if ((await field.count()) > 0) {
				await expect(field.first()).toHaveValue(resource_quotas[i]);
				break;
			}
		}
	}

	if (!exist_table && resource_quotas.length > 0) {
		const nextButton = getWorkspaceWizardNextButtonAnyState(dialog);
		if ((await nextButton.count()) > 0) {
			await nextButton.first().click();
			await page.waitForTimeout(NEXT_IDLE_MS);
		}
	} else {
		await clickWorkspaceCreateNextButton(dialog, page, 'after resource quotas');
	}

	const createSubmitButton = administrationLocators.getWorkspaceCreateSubmitButton(dialog);
	await page.waitForTimeout(NEXT_IDLE_MS);

	if (yamlResourceQuota && exist_table) {
		await expect
			.poll(async () => createSubmitButton.isVisible().catch(() => false), {
				timeout: 30000,
				message: '[create workspace yaml step] Create button must be visible on YAML preview step'
			})
			.toBeTruthy();

		if (yamlResourceQuota.pvcCountQuota) {
			await appendPersistentVolumeClaimsCountToWorkspaceYaml(
				page,
				dialog,
				yamlResourceQuota.pvcCountQuota
			);
		}
		if (yamlResourceQuota.storageQuota) {
			await appendRequestsStorageToWorkspaceYaml(page, dialog, yamlResourceQuota.storageQuota);
		}
	}

	const rowCountBeforeSubmit = !exist_table ? await createdRow.count() : 0;
	if (await createSubmitButton.isVisible().catch(() => false)) {
		logger.normal('[createWorkspace] Submit create clicked');
		await createSubmitButton.click();
		await page.waitForTimeout(NEXT_IDLE_MS);
	}

	if (!exist_table) {
		// Negative create path should either keep validation errors in dialog or emit an error toast.
		const validationMessages = administrationLocators.getWorkspaceCreateValidationMessages(dialog);
		const validationErrorMessages = validationMessages.filter({
			hasText: /(invalid|name|kubernetes|dns-1123|must|lowercase|alphanumeric|start|end)/i
		});
		const errorToasts = administrationLocators.getWorkspaceCreateErrorToasts(page);
		const hasValidationError = (await validationErrorMessages.count()) > 0;
		const hasErrorToast = (await errorToasts.count()) > 0;

		logger.normal('[createWorkspace] Negative path validation result', {
			hasValidationError,
			hasErrorToast,
			rowCountBeforeSubmit
		});

		if (!hasValidationError && !hasErrorToast) {
			// Final fallback: if dialog is still open after submit, creation is blocked.
			await expect(dialog).toBeVisible();
		}

		logger.normal('[createWorkspace] Skip positive table verification (exist_table=false)');
		await expect(createdRow).toHaveCount(rowCountBeforeSubmit);
		await closeCreateWorkspaceDialogIfOpen(page, dialog);
		return;
	}
	const menuPath = ['Platform', 'Administration', 'Workspace'] as const;
	logger.normal('[createWorkspace] Back to Workspace page via menu path', { menuPath });

	// Non-admin accounts (e.g. test_view_role) have no Administration menu; use workspace switcher.
	const adminMenuVisible = await page.locator('[data-sidebar="menu-button"]:has-text("Administration")').isVisible().catch(() => false);

	if (!adminMenuVisible) {
		// Non-admin account: switch to new workspace via switcher.
		logger.normal('[createWorkspace] Using workspace switcher for non-admin account');
		const switcherTrigger = page.locator('[data-sidebar="menu-button"]').first();
		await switcherTrigger.waitFor({ state: 'visible', timeout: 10000 });
		await switcherTrigger.click();
		await page.waitForTimeout(1000);

		// 在 switcher 選單中點擊新創建的 workspace
		const newWorkspaceItem = page.locator(`[role="menuitem"]:has-text("${workspace_name}")`);
		const isNewWorkspaceVisible = await newWorkspaceItem.isVisible().catch(() => false);

		if (isNewWorkspaceVisible) {
			logger.normal(`[createWorkspace] Switching to new workspace: ${workspace_name}`);
			await newWorkspaceItem.click();
			await page.waitForTimeout(2000);
		}

		// Non-admin account has no Workspace table; skip row verification.
		logger.normal('[createWorkspace] non-admin account: skip table row verification');
		return;
	} else {
		await menuPageApi.clickMenuPathByNames(page, menuPath[0], menuPath[1], menuPath[2]);
		await page.waitForTimeout(NEXT_IDLE_MS);
	}

	// Filter by workspace name first, then wait for the row to appear in the table.
	await searchWorkspaceByName(page, workspace_name);
	await expect(createdRow).toBeVisible({ timeout: 10000 });

	const cells = createdRow.locator('td[data-slot="table-cell"]');
	const cellCount = await cells.count();
	const rowValues = await Promise.all(Array.from({ length: cellCount }, async (_, i) => (await cells.nth(i).innerText()).trim()));
	const table = createdRow.locator('xpath=ancestor::table[1]');
	const headerCells = table.locator('thead th, tr[data-slot="table-header-row"] th');
	const headerCount = await headerCells.count();
	const headerValues = await Promise.all(Array.from({ length: headerCount }, async (_, i) => (await headerCells.nth(i).innerText()).trim()));

	const findColumnIndex = (headerPattern: RegExp): number =>
		headerValues.findIndex((header) => headerPattern.test(header));

	const getCellTextByColumn = async (headerPattern: RegExp): Promise<string | null> => {
		const index = findColumnIndex(headerPattern);
		if (index < 0 || index >= cellCount) return null;
		return (await cells.nth(index).innerText()).trim();
	};

	logger.normal('[createWorkspace] Created row values:', { headers: headerValues, rowValues });

	const nameCell = await getCellTextByColumn(/^name$/i);
	if (nameCell) {
		expect(nameCell).toMatch(workspaceNamePattern);
	} else {
		// Fallback for layouts where table headers are dynamic/unavailable.
		expect(rowValues.some((value) => workspaceNamePattern.test(value))).toBeTruthy();
	}

	await assertWorkspaceResourceQuotaColumns(createdRow, resource_quotas);
}

async function appendRequestsStorageToWorkspaceYaml(
	page: Page,
	dialog: Locator,
	storageQuota: string
): Promise<void> {
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					type MonacoWindow = Window &
						typeof globalThis & {
							monaco?: {
								editor?: {
									getModels?: () => Array<{ getValue: () => string }>;
								};
							};
						};
					const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
					return models.some((model) => /kind:\s*Workspace/i.test(model.getValue()));
				}),
			{
				timeout: 30000,
				message: '[create-workspace-yaml-editor] Workspace monaco model must be ready'
			}
		)
		.toBeTruthy();

	await page.evaluate((quota) => {
		type MonacoWindow = Window &
			typeof globalThis & {
				monaco?: {
					editor?: {
						getModels?: () => Array<{ getValue: () => string; setValue: (value: string) => void }>;
					};
				};
			};

		const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
		const targetModel =
			models.find((model) => /kind:\s*Workspace/i.test(model.getValue())) ?? models[models.length - 1];
		if (!targetModel) {
			throw new Error('[create-workspace-yaml-editor] Expected at least 1 monaco model');
		}

		let yaml = targetModel.getValue();
		const storageLine = `      requests.storage: ${quota}`;

		if (/^\s*requests\.storage:/im.test(yaml)) {
			yaml = yaml.replace(/^\s*requests\.storage:\s*\S*/im, `      requests.storage: ${quota}`);
		} else if (/\n\s+hard:\n/.test(yaml)) {
			yaml = yaml.replace(/(\n\s+hard:\n)/, `$1${storageLine}\n`);
		} else if (/resourceQuota:/i.test(yaml)) {
			yaml = yaml.replace(/(resourceQuota:\n\s+hard:\n)/i, `$1${storageLine}\n`);
		} else {
			yaml = yaml.replace(
				/(spec:\n(?: {2}.+\n)*?)(\n\S|\s*$)/,
				`$1  resourceQuota:\n    hard:\n${storageLine}\n$2`
			);
		}

		targetModel.setValue(yaml);
	}, storageQuota);

	logger.normal('[appendRequestsStorageToWorkspaceYaml] Appended requests.storage to workspace YAML', {
		storageQuota
	});
}

async function appendPersistentVolumeClaimsCountToWorkspaceYaml(
	page: Page,
	dialog: Locator,
	pvcCountQuota: string
): Promise<void> {
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					type MonacoWindow = Window &
						typeof globalThis & {
							monaco?: {
								editor?: {
									getModels?: () => Array<{ getValue: () => string }>;
								};
							};
						};
					const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
					return models.some((model) => /kind:\s*Workspace/i.test(model.getValue()));
				}),
			{
				timeout: 30000,
				message: '[create-workspace-yaml-editor] Workspace monaco model must be ready'
			}
		)
		.toBeTruthy();

	await page.evaluate((quota) => {
		type MonacoWindow = Window &
			typeof globalThis & {
				monaco?: {
					editor?: {
						getModels?: () => Array<{ getValue: () => string; setValue: (value: string) => void }>;
					};
				};
			};

		const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
		const targetModel =
			models.find((model) => /kind:\s*Workspace/i.test(model.getValue())) ?? models[models.length - 1];
		if (!targetModel) {
			throw new Error('[create-workspace-yaml-editor] Expected at least 1 monaco model');
		}

		let yaml = targetModel.getValue();
		const pvcCountLine = `      persistentvolumeclaims: ${quota}`;

		if (/^\s*persistentvolumeclaims:/im.test(yaml)) {
			yaml = yaml.replace(/^\s*persistentvolumeclaims:\s*\S*/im, `      persistentvolumeclaims: ${quota}`);
		} else if (/\n\s+hard:\n/.test(yaml)) {
			yaml = yaml.replace(/(\n\s+hard:\n)/, `$1${pvcCountLine}\n`);
		} else if (/resourceQuota:/i.test(yaml)) {
			yaml = yaml.replace(/(resourceQuota:\n\s+hard:\n)/i, `$1${pvcCountLine}\n`);
		} else {
			yaml = yaml.replace(
				/(spec:\n(?: {2}.+\n)*?)(\n\S|\s*$)/,
				`$1  resourceQuota:\n    hard:\n${pvcCountLine}\n$2`
			);
		}

		targetModel.setValue(yaml);
	}, pvcCountQuota);

	logger.normal('[appendPersistentVolumeClaimsCountToWorkspaceYaml] Appended persistentvolumeclaims to workspace YAML', {
		pvcCountQuota
	});
}

async function appendPodsCountToWorkspaceYaml(
	page: Page,
	dialog: Locator,
	podsQuota: string
): Promise<void> {
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					type MonacoWindow = Window &
						typeof globalThis & {
							monaco?: {
								editor?: {
									getModels?: () => Array<{ getValue: () => string }>;
								};
							};
						};
					const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
					return models.some((model) => /kind:\s*Workspace/i.test(model.getValue()));
				}),
			{
				timeout: 30000,
				message: '[create-workspace-yaml-editor] Workspace monaco model must be ready'
			}
		)
		.toBeTruthy();

	await page.evaluate((quota) => {
		type MonacoWindow = Window &
			typeof globalThis & {
				monaco?: {
					editor?: {
						getModels?: () => Array<{ getValue: () => string; setValue: (value: string) => void }>;
					};
				};
			};

		const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
		const targetModel =
			models.find((model) => /kind:\s*Workspace/i.test(model.getValue())) ?? models[models.length - 1];
		if (!targetModel) {
			throw new Error('[create-workspace-yaml-editor] Expected at least 1 monaco model');
		}

		let yaml = targetModel.getValue();
		const podsLine = `      pods: ${quota}`;

		if (/^\s*pods:/im.test(yaml)) {
			yaml = yaml.replace(/^\s*pods:\s*\S*/im, `      pods: ${quota}`);
		} else if (/\n\s+hard:\n/.test(yaml)) {
			yaml = yaml.replace(/(\n\s+hard:\n)/, `$1${podsLine}\n`);
		} else if (/resourceQuota:/i.test(yaml)) {
			yaml = yaml.replace(/(resourceQuota:\n\s+hard:\n)/i, `$1${podsLine}\n`);
		} else {
			yaml = yaml.replace(
				/(spec:\n(?: {2}.+\n)*?)(\n\S|\s*$)/,
				`$1  resourceQuota:\n    hard:\n${podsLine}\n$2`
			);
		}

		targetModel.setValue(yaml);
	}, podsQuota);

	logger.normal('[appendPodsCountToWorkspaceYaml] Appended pods to workspace YAML', { podsQuota });
}

async function appendConfigMapsCountToWorkspaceYaml(
	page: Page,
	dialog: Locator,
	configMapsQuota: string
): Promise<void> {
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					type MonacoWindow = Window &
						typeof globalThis & {
							monaco?: {
								editor?: {
									getModels?: () => Array<{ getValue: () => string }>;
								};
							};
						};
					const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
					return models.some((model) => /kind:\s*Workspace/i.test(model.getValue()));
				}),
			{
				timeout: 30000,
				message: '[create-workspace-yaml-editor] Workspace monaco model must be ready'
			}
		)
		.toBeTruthy();

	await page.evaluate((quota) => {
		type MonacoWindow = Window &
			typeof globalThis & {
				monaco?: {
					editor?: {
						getModels?: () => Array<{ getValue: () => string; setValue: (value: string) => void }>;
					};
				};
			};

		const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
		const targetModel =
			models.find((model) => /kind:\s*Workspace/i.test(model.getValue())) ?? models[models.length - 1];
		if (!targetModel) {
			throw new Error('[create-workspace-yaml-editor] Expected at least 1 monaco model');
		}

		let yaml = targetModel.getValue();
		const configMapsLine = `      configmaps: ${quota}`;

		if (/^\s*configmaps:/im.test(yaml)) {
			yaml = yaml.replace(/^\s*configmaps:\s*\S*/im, `      configmaps: ${quota}`);
		} else if (/\n\s+hard:\n/.test(yaml)) {
			yaml = yaml.replace(/(\n\s+hard:\n)/, `$1${configMapsLine}\n`);
		} else if (/resourceQuota:/i.test(yaml)) {
			yaml = yaml.replace(/(resourceQuota:\n\s+hard:\n)/i, `$1${configMapsLine}\n`);
		} else {
			yaml = yaml.replace(
				/(spec:\n(?: {2}.+\n)*?)(\n\S|\s*$)/,
				`$1  resourceQuota:\n    hard:\n${configMapsLine}\n$2`
			);
		}

		targetModel.setValue(yaml);
	}, configMapsQuota);

	logger.normal('[appendConfigMapsCountToWorkspaceYaml] Appended configmaps to workspace YAML', {
		configMapsQuota
	});
}

async function appendCronJobsCountToWorkspaceYaml(
	page: Page,
	dialog: Locator,
	cronJobsQuota: string
): Promise<void> {
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					type MonacoWindow = Window &
						typeof globalThis & {
							monaco?: {
								editor?: {
									getModels?: () => Array<{ getValue: () => string }>;
								};
							};
						};
					const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
					return models.some((model) => /kind:\s*Workspace/i.test(model.getValue()));
				}),
			{
				timeout: 30000,
				message: '[create-workspace-yaml-editor] Workspace monaco model must be ready'
			}
		)
		.toBeTruthy();

	await page.evaluate((quota) => {
		type MonacoWindow = Window &
			typeof globalThis & {
				monaco?: {
					editor?: {
						getModels?: () => Array<{ getValue: () => string; setValue: (value: string) => void }>;
					};
				};
			};

		const models = (window as MonacoWindow).monaco?.editor?.getModels?.() ?? [];
		const targetModel =
			models.find((model) => /kind:\s*Workspace/i.test(model.getValue())) ?? models[models.length - 1];
		if (!targetModel) {
			throw new Error('[create-workspace-yaml-editor] Expected at least 1 monaco model');
		}

		let yaml = targetModel.getValue();
		const cronJobsLine = `      count/cronjobs.batch: "${quota}"`;

		if (/^\s*count\/cronjobs\.batch:/im.test(yaml)) {
			yaml = yaml.replace(/^\s*count\/cronjobs\.batch:\s*.*/im, cronJobsLine);
		} else if (/^\s*cronjobs\.batch:/im.test(yaml)) {
			yaml = yaml.replace(/^\s*cronjobs\.batch:\s*.*/im, cronJobsLine);
		} else if (/\n\s+hard:\n/.test(yaml)) {
			yaml = yaml.replace(/(\n\s+hard:\n)/, `$1${cronJobsLine}\n`);
		} else if (/resourceQuota:/i.test(yaml)) {
			yaml = yaml.replace(/(resourceQuota:\n\s+hard:\n)/i, `$1${cronJobsLine}\n`);
		} else {
			yaml = yaml.replace(
				/(spec:\n(?: {2}.+\n)*?)(\n\S|\s*$)/,
				`$1  resourceQuota:\n    hard:\n${cronJobsLine}\n$2`
			);
		}

		targetModel.setValue(yaml);
	}, cronJobsQuota);

	logger.normal('[appendCronJobsCountToWorkspaceYaml] Appended count/cronjobs.batch to workspace YAML', {
		cronJobsQuota
	});
}

export async function createWorkspaceWithStorageQuotaHardLimit(
	page: Page,
	workspace_name: string,
	storageQuota: string = '10Gi'
): Promise<void> {
	logger.normal('[createWorkspaceWithStorageQuotaHardLimit] Start', { workspace_name, storageQuota });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const createdRow = administrationLocators.getCreatedWorkspaceTableRow(page, workspaceNamePattern);

	await openWorkspacePage(page);
	await ensureWorkspaceDeleted(page, workspace_name);

	const dialog = administrationLocators.getCreateWorkspaceDialog(page);
	await ensureCreateWorkspaceDialogReady(page, dialog);

	const workspaceNameInput = administrationLocators.getWorkspaceNameInputInCreateDialog(dialog);
	await workspaceNameInput.fill(workspace_name);
	await expect(workspaceNameInput).toHaveValue(workspace_name);

	await clickWorkspaceCreateNextButton(dialog, page, 'after workspace name');
	await clickWorkspaceCreateNextButton(dialog, page, 'after members');
	await completeLicenseInjectionStep(dialog, page, false);
	await clickWorkspaceCreateNextButton(dialog, page, 'after network isolation');
	await clickWorkspaceCreateNextButton(dialog, page, 'after resource quotas');

	const createSubmitButton = administrationLocators.getWorkspaceCreateSubmitButton(dialog);
	await expect
		.poll(async () => createSubmitButton.isVisible().catch(() => false), {
			timeout: 30000,
			message: '[create workspace yaml step] Create button must be visible on YAML preview step'
		})
		.toBeTruthy();

	await appendRequestsStorageToWorkspaceYaml(page, dialog, storageQuota);

	const createButton = await $unique(createSubmitButton, 'create workspace yaml create button');
	await createButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await openWorkspacePage(page);
	await searchWorkspaceByName(page, workspace_name);
	await expect(createdRow).toBeVisible({ timeout: 30000 });
	logger.normal('[createWorkspaceWithStorageQuotaHardLimit] Workspace created', { workspace_name, storageQuota });
}

export async function createWorkspaceWithPersistentVolumeClaimsQuotaHardLimit(
	page: Page,
	workspace_name: string,
	pvcCountQuota: string = '5'
): Promise<void> {
	logger.normal('[createWorkspaceWithPersistentVolumeClaimsQuotaHardLimit] Start', {
		workspace_name,
		pvcCountQuota
	});
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const createdRow = administrationLocators.getCreatedWorkspaceTableRow(page, workspaceNamePattern);

	await openWorkspacePage(page);
	await ensureWorkspaceDeleted(page, workspace_name);

	const dialog = administrationLocators.getCreateWorkspaceDialog(page);
	await ensureCreateWorkspaceDialogReady(page, dialog);

	const workspaceNameInput = administrationLocators.getWorkspaceNameInputInCreateDialog(dialog);
	await workspaceNameInput.fill(workspace_name);
	await expect(workspaceNameInput).toHaveValue(workspace_name);

	await clickWorkspaceCreateNextButton(dialog, page, 'after workspace name');
	await clickWorkspaceCreateNextButton(dialog, page, 'after members');
	await completeLicenseInjectionStep(dialog, page, false);
	await clickWorkspaceCreateNextButton(dialog, page, 'after network isolation');
	await clickWorkspaceCreateNextButton(dialog, page, 'after resource quotas');

	const createSubmitButton = administrationLocators.getWorkspaceCreateSubmitButton(dialog);
	await expect
		.poll(async () => createSubmitButton.isVisible().catch(() => false), {
			timeout: 30000,
			message: '[create workspace yaml step] Create button must be visible on YAML preview step'
		})
		.toBeTruthy();

	await appendPersistentVolumeClaimsCountToWorkspaceYaml(page, dialog, pvcCountQuota);

	const createButton = await $unique(createSubmitButton, 'create workspace yaml create button');
	await createButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await openWorkspacePage(page);
	await searchWorkspaceByName(page, workspace_name);
	await expect(createdRow).toBeVisible({ timeout: 30000 });
	logger.normal('[createWorkspaceWithPersistentVolumeClaimsQuotaHardLimit] Workspace created', {
		workspace_name,
		pvcCountQuota
	});
}

export async function createWorkspaceWithPodsQuotaHardLimit(
	page: Page,
	workspace_name: string,
	podsQuota: string = '3'
): Promise<void> {
	logger.normal('[createWorkspaceWithPodsQuotaHardLimit] Start', { workspace_name, podsQuota });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const createdRow = administrationLocators.getCreatedWorkspaceTableRow(page, workspaceNamePattern);

	await openWorkspacePage(page);
	await ensureWorkspaceDeleted(page, workspace_name);

	const dialog = administrationLocators.getCreateWorkspaceDialog(page);
	await ensureCreateWorkspaceDialogReady(page, dialog);

	const workspaceNameInput = administrationLocators.getWorkspaceNameInputInCreateDialog(dialog);
	await workspaceNameInput.fill(workspace_name);
	await expect(workspaceNameInput).toHaveValue(workspace_name);

	await clickWorkspaceCreateNextButton(dialog, page, 'after workspace name');
	await clickWorkspaceCreateNextButton(dialog, page, 'after members');
	await completeLicenseInjectionStep(dialog, page, false);
	await clickWorkspaceCreateNextButton(dialog, page, 'after network isolation');
	await clickWorkspaceCreateNextButton(dialog, page, 'after resource quotas');

	const createSubmitButton = administrationLocators.getWorkspaceCreateSubmitButton(dialog);
	await expect
		.poll(async () => createSubmitButton.isVisible().catch(() => false), {
			timeout: 30000,
			message: '[create workspace yaml step] Create button must be visible on YAML preview step'
		})
		.toBeTruthy();

	await appendPodsCountToWorkspaceYaml(page, dialog, podsQuota);

	const createButton = await $unique(createSubmitButton, 'create workspace yaml create button');
	await createButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await openWorkspacePage(page);
	await searchWorkspaceByName(page, workspace_name);
	await expect(createdRow).toBeVisible({ timeout: 30000 });
	logger.normal('[createWorkspaceWithPodsQuotaHardLimit] Workspace created', { workspace_name, podsQuota });
}

export async function createWorkspaceWithConfigMapsQuotaHardLimit(
	page: Page,
	workspace_name: string,
	configMapsQuota: string = '3'
): Promise<void> {
	logger.normal('[createWorkspaceWithConfigMapsQuotaHardLimit] Start', { workspace_name, configMapsQuota });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const createdRow = administrationLocators.getCreatedWorkspaceTableRow(page, workspaceNamePattern);

	await openWorkspacePage(page);
	await ensureWorkspaceDeleted(page, workspace_name);

	const dialog = administrationLocators.getCreateWorkspaceDialog(page);
	await ensureCreateWorkspaceDialogReady(page, dialog);

	const workspaceNameInput = administrationLocators.getWorkspaceNameInputInCreateDialog(dialog);
	await workspaceNameInput.fill(workspace_name);
	await expect(workspaceNameInput).toHaveValue(workspace_name);

	await clickWorkspaceCreateNextButton(dialog, page, 'after workspace name');
	await clickWorkspaceCreateNextButton(dialog, page, 'after members');
	await completeLicenseInjectionStep(dialog, page, false);
	await clickWorkspaceCreateNextButton(dialog, page, 'after network isolation');
	await clickWorkspaceCreateNextButton(dialog, page, 'after resource quotas');

	const createSubmitButton = administrationLocators.getWorkspaceCreateSubmitButton(dialog);
	await expect
		.poll(async () => createSubmitButton.isVisible().catch(() => false), {
			timeout: 30000,
			message: '[create workspace yaml step] Create button must be visible on YAML preview step'
		})
		.toBeTruthy();

	await appendConfigMapsCountToWorkspaceYaml(page, dialog, configMapsQuota);

	const createButton = await $unique(createSubmitButton, 'create workspace yaml create button');
	await createButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await openWorkspacePage(page);
	await searchWorkspaceByName(page, workspace_name);
	await expect(createdRow).toBeVisible({ timeout: 30000 });
	logger.normal('[createWorkspaceWithConfigMapsQuotaHardLimit] Workspace created', {
		workspace_name,
		configMapsQuota
	});
}

export async function createWorkspaceWithCronJobsQuotaHardLimit(
	page: Page,
	workspace_name: string,
	cronJobsQuota: string = '5'
): Promise<void> {
	logger.normal('[createWorkspaceWithCronJobsQuotaHardLimit] Start', { workspace_name, cronJobsQuota });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const createdRow = administrationLocators.getCreatedWorkspaceTableRow(page, workspaceNamePattern);

	await openWorkspacePage(page);
	await ensureWorkspaceDeleted(page, workspace_name);

	const dialog = administrationLocators.getCreateWorkspaceDialog(page);
	await ensureCreateWorkspaceDialogReady(page, dialog);

	const workspaceNameInput = administrationLocators.getWorkspaceNameInputInCreateDialog(dialog);
	await workspaceNameInput.fill(workspace_name);
	await expect(workspaceNameInput).toHaveValue(workspace_name);

	await clickWorkspaceCreateNextButton(dialog, page, 'after workspace name');
	await clickWorkspaceCreateNextButton(dialog, page, 'after members');
	await completeLicenseInjectionStep(dialog, page, false);
	await clickWorkspaceCreateNextButton(dialog, page, 'after network isolation');
	await clickWorkspaceCreateNextButton(dialog, page, 'after resource quotas');

	const createSubmitButton = administrationLocators.getWorkspaceCreateSubmitButton(dialog);
	await expect
		.poll(async () => createSubmitButton.isVisible().catch(() => false), {
			timeout: 30000,
			message: '[create workspace yaml step] Create button must be visible on YAML preview step'
		})
		.toBeTruthy();

	await appendCronJobsCountToWorkspaceYaml(page, dialog, cronJobsQuota);

	const createButton = await $unique(createSubmitButton, 'create workspace yaml create button');
	await createButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await openWorkspacePage(page);
	await searchWorkspaceByName(page, workspace_name);
	await expect(createdRow).toBeVisible({ timeout: 30000 });
	logger.normal('[createWorkspaceWithCronJobsQuotaHardLimit] Workspace created', {
		workspace_name,
		cronJobsQuota
	});
}

/** Raise persistentvolumeclaims / requests.storage hard limits via Update YAML step. */
export async function ensureWorkspaceResourceQuotaForStatefulSetScale(
	page: Page,
	workspace_name: string,
	options?: { pvcCountQuota?: string; storageQuota?: string; reconcileWaitMs?: number }
): Promise<void> {
	const pvcCountQuota = options?.pvcCountQuota ?? '8';
	const storageQuota = options?.storageQuota ?? '16Gi';
	const reconcileWaitMs = options?.reconcileWaitMs ?? 45000;

	logger.normal('[ensureWorkspaceResourceQuotaForStatefulSetScale] Start', {
		workspace_name,
		pvcCountQuota,
		storageQuota,
		reconcileWaitMs
	});

	await openWorkspacePage(page);
	await searchWorkspaceByName(page, workspace_name);

	const workspaceRow = await $row(page, workspace_name);
	const actionButton = administrationLocators.getRowActionsButton(workspaceRow);
	await expect(actionButton).toBeVisible();
	await actionButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await clickWorkspaceUpdateOrEditMenuItem(page);
	await page.waitForTimeout(NEXT_IDLE_MS);

	const dialog = administrationLocators.getUpdateWorkspaceDialog(page);
	await expect(dialog).toBeVisible();

	await clickWorkspaceWizardNext(dialog, page);
	await clickWorkspaceWizardNext(dialog, page);
	await clickWorkspaceWizardNext(dialog, page);

	const updateButton = administrationLocators.getUpdateWorkspaceSubmitButton(dialog);
	await expect
		.poll(async () => updateButton.isVisible().catch(() => false), {
			timeout: 30000,
			message: '[update workspace yaml step] Update button must be visible on YAML preview step'
		})
		.toBeTruthy();

	await appendPersistentVolumeClaimsCountToWorkspaceYaml(page, dialog, pvcCountQuota);
	await appendRequestsStorageToWorkspaceYaml(page, dialog, storageQuota);

	await updateButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
	await page.waitForTimeout(reconcileWaitMs);

	logger.normal('[ensureWorkspaceResourceQuotaForStatefulSetScale] Done', {
		workspace_name,
		pvcCountQuota,
		storageQuota
	});
}

/** @deprecated Use ensureWorkspaceResourceQuotaForStatefulSetScale */
export async function ensureWorkspacePersistentVolumeClaimsQuota(
	page: Page,
	workspace_name: string,
	pvcCountQuota: string = '8'
): Promise<void> {
	await ensureWorkspaceResourceQuotaForStatefulSetScale(page, workspace_name, { pvcCountQuota });
}

export async function updateWorkspace(
	page: Page,
	workspace_name: string,
	members: WorkspaceMember[],
	namespaces: string[],
	resource_quotas: string[]
): Promise<void> {
	logger.normal('[Administration_Workspace.api] updateWorkspace', { workspace_name });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const workspaceRow = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);

	await expect(workspaceRow).toHaveCount(1);
	await expect(workspaceRow.first()).toBeVisible();

	const actionButton = administrationLocators.getRowActionsButton(workspaceRow);
	await expect(actionButton).toBeVisible();
	await actionButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await clickWorkspaceUpdateOrEditMenuItem(page);
	await page.waitForTimeout(NEXT_IDLE_MS);

	const dialog = administrationLocators.getUpdateWorkspaceDialog(page);
	await expect(dialog).toBeVisible();

	await fillAndSubmitUpdateWorkspaceDialog(page, dialog, members, namespaces, resource_quotas);
}

export async function verifyAdminMemberProtectionInUpdateDialog(
	page: Page,
	workspace_name: string
): Promise<void> {
	logger.normal('[Administration_Workspace.api] verifyAdminMemberProtectionInUpdateDialog', { workspace_name });

	const workspaceRow = await $row(page, workspace_name, 20000);
	const actionButton = await $unique(administrationLocators.getRowActionsButton(workspaceRow), 'workspace row actions button');
	await actionButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await clickWorkspaceUpdateOrEditMenuItem(page);
	await page.waitForTimeout(NEXT_IDLE_MS);

	const dialog = await $dialog(page, 'update', 20000);
	const membersStep = administrationLocators.getUpdateWorkspaceStepLegend(dialog, /^\s*Members\s*$/i);
	await expect(membersStep, '[update step Members] should be unique').toHaveCount(1);
	await expect(membersStep, '[update step Members] should be visible').toBeVisible();

	const networkIsolationStep = administrationLocators.getUpdateWorkspaceStepLegend(
		dialog,
		/^\s*Network Isolation\s*$/i
	);
	await expect(networkIsolationStep, '[update step Network Isolation] should be unique').toHaveCount(1);

	const resourceQuotaStep = administrationLocators.getUpdateWorkspaceStepLegend(dialog, /^\s*Resource Quota\s*$/i);
	await expect(resourceQuotaStep, '[update step Resource Quota] should be unique').toHaveCount(1);

	await expect(
		administrationLocators.getUpdateWorkspaceYamlPreviewPanel(dialog),
		'[update step YAML preview] should be present'
	).toHaveCount(1);

	const creatorAdminRow = await $unique(
		administrationLocators.getUpdateWorkspaceCreatorAdminMemberRow(dialog),
		'creator admin member row'
	);

	const creatorNameInput = await $unique(
		administrationLocators.getUpdateWorkspaceMemberNameReadonlyInput(creatorAdminRow),
		'creator admin readonly name input'
	);
	await expect(creatorNameInput).toHaveJSProperty('readOnly', true);

	const creatorRoleCombobox = await $unique(
		administrationLocators.getUpdateWorkspaceMemberAdminRoleCombobox(creatorAdminRow),
		'creator admin role combobox'
	);
	const roleBefore = (await creatorRoleCombobox.innerText()).trim();
	await creatorRoleCombobox.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
	// If role options are opened, it means role is mutable and this violates the guardrail.
	await expect(page.getByRole('option', { name: /^\s*(admin|edit|view)\s*$/i })).toHaveCount(0);
	await expect(creatorRoleCombobox).toContainText(new RegExp(`^\\s*${escapeRegExp(roleBefore)}\\s*$`, 'i'));

	const removeButton = await $unique(
		administrationLocators.getUpdateWorkspaceMemberRemoveButton(creatorAdminRow),
		'creator admin remove button'
	);

	if (await removeButton.isDisabled()) {
		logger.normal('[verifyAdminMemberProtectionInUpdateDialog] remove button is disabled as expected');
	} else {
		logger.normal('[verifyAdminMemberProtectionInUpdateDialog] remove button is enabled, verify backend/UI blocks update');
		await removeButton.click();
		await page.waitForTimeout(NEXT_IDLE_MS);

		await clickWorkspaceWizardNext(dialog, page);
		await clickWorkspaceWizardNext(dialog, page);
		await clickWorkspaceWizardNext(dialog, page);

		const updateButton = await $unique(administrationLocators.getUpdateWorkspaceSubmitButton(dialog), 'update submit button');
		await updateButton.click();
		await page.waitForTimeout(NEXT_IDLE_MS);

		const protectionError = administrationLocators.getUpdateWorkspaceAdminProtectionError(page);
		if ((await protectionError.count()) === 0) {
			throw new Error('Admin member removal was not blocked: no protection error was shown after Update submit.');
		}
		await expect(protectionError.first()).toBeVisible();
	}

	const closeButton = await $unique(administrationLocators.getUpdateWorkspaceDialogCloseButton(dialog), 'update dialog close button');
	await closeButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	// Re-open update dialog and ensure creator admin row still exists.
	const rowAfter = await $row(page, workspace_name, 20000);
	const actionButtonAfter = await $unique(
		administrationLocators.getRowActionsButton(rowAfter),
		'workspace row actions button (reopen)'
	);
	await actionButtonAfter.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await clickWorkspaceUpdateOrEditMenuItem(page);
	await page.waitForTimeout(NEXT_IDLE_MS);

	const reopenDialog = await $dialog(page, 'update', 20000);
	await $unique(
		administrationLocators.getUpdateWorkspaceCreatorAdminMemberRow(reopenDialog),
		'creator admin member row after reopen'
	);

	const reopenCloseButton = await $unique(
		administrationLocators.getUpdateWorkspaceDialogCloseButton(reopenDialog),
		'update dialog close button (reopen)'
	);
	await reopenCloseButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
}

export async function addMemberWithAdminRoleGuard(
	page: Page,
	workspace_name: string,
	username: string,
	selectedRole: 'edit' | 'view' = 'edit'
): Promise<void> {
	logger.normal('[Administration_Workspace.api] addMemberWithAdminRoleGuard', {
		workspace_name,
		username,
		selectedRole
	});

	const dialog = await openWorkspaceMembersOrEditDialog(page, workspace_name);
	const membersStep = administrationLocators.getUpdateWorkspaceStepLegend(dialog, /^\s*Members\s*$/i);
	await expect(membersStep, '[members step] should be unique').toHaveCount(1);
	await expect(membersStep).toBeVisible();

	const memberRows = administrationLocators.getMemberArrayItems(dialog);
	const beforeCount = await memberRows.count();
	const addMemberButton = await $unique(administrationLocators.getWorkspaceAddMemberButton(dialog), 'add member button');
	await addMemberButton.click();
	await expect(memberRows).toHaveCount(beforeCount + 1);

	const newMemberRow = await $unique(memberRows.last(), `new member row (${username})`);
	await selectMemberBySearch(page, newMemberRow, username);
	await verifyRoleGuardAndSelectNonAdmin(page, newMemberRow, selectedRole);

	await clickWorkspaceWizardNext(dialog, page);
	await clickWorkspaceWizardNext(dialog, page);
	await clickWorkspaceWizardNext(dialog, page);

	const saveButton = await $unique(administrationLocators.getWorkspaceMembersSaveButton(dialog), 'members save button');
	await saveButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const successToast = administrationLocators.getWorkspaceMemberAddSuccessToasts(page);
	await expect(successToast, 'member add success toast').toHaveCount(1, { timeout: 15000 });
	await expect(successToast).toBeVisible({ timeout: 15000 });

	const reopenDialog = await openWorkspaceMembersOrEditDialog(page, workspace_name);
	const memberIdentity = new RegExp(`\\b${escapeRegExp(username)}\\b`, 'i');
	const addedMemberRow = await $unique(
		administrationLocators.getWorkspaceMemberArrayItemByText(reopenDialog, memberIdentity),
		`added member row: ${username}`
	);
	const addedRoleCombobox = await $unique(
		administrationLocators.getWorkspaceMemberRoleCombobox(addedMemberRow),
		`added member role combobox: ${selectedRole}`
	);
	await expect(addedRoleCombobox).toContainText(new RegExp(`^\\s*${selectedRole}\\s*$`, 'i'));

	const closeButton = await $unique(
		administrationLocators.getUpdateWorkspaceDialogCloseButton(reopenDialog),
		'update dialog close button (members)'
	);
	await closeButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
}

export async function editWorkspace_overviewpage(
	page: Page,
	workspace_name: string,
	members: WorkspaceMember[],
	namespaces: string[],
	resource_quotas: string[]
): Promise<void> {
	logger.normal('[Administration_Workspace.api] editWorkspace_overviewpage', { workspace_name });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');

	const detailTitle = administrationLocators.getWorkspaceDetailResourceTitle(page, workspaceNamePattern);
	if ((await detailTitle.count()) > 0) {
		await expect(detailTitle).toBeVisible();
	}

	const editButton = administrationLocators.getWorkspaceOverviewEditButton(page);
	if ((await editButton.count()) > 0) {
		await expect(editButton).toBeVisible();
		await editButton.click();
	} else {
		const editMenuItem = administrationLocators.getWorkspaceOverviewEditButton(page);
		await expect(editMenuItem).toBeVisible();
		await editMenuItem.click();
	}
	await page.waitForTimeout(NEXT_IDLE_MS);

	const dialog = administrationLocators.getUpdateWorkspaceDialog(page);
	await expect(dialog).toBeVisible();

	await fillAndSubmitUpdateWorkspaceDialog(page, dialog, members, namespaces, resource_quotas);
}

async function fillAndSubmitUpdateWorkspaceDialog(
	page: Page,
	dialog: Locator,
	members: WorkspaceMember[],
	namespaces: string[],
	resource_quotas: string[]
): Promise<void> {

	// Step 1: Workspace & Members
	if (members.length > 0) {
		const memberRows = administrationLocators.getMemberArrayItems(dialog);
		for (let i = 0; i < members.length; i++) {
			const member = members[i];
			const currentCount = await memberRows.count();
			await dialog.getByRole('button', { name: /Add Member/i }).click();
			await expect(memberRows).toHaveCount(currentCount + 1);
			const currentMemberRow = memberRows.nth(currentCount);
			await selectMemberBySearch(page, currentMemberRow, member.name);
			if (member.role) {
				await selectMemberRole(page, currentMemberRow, member.role);
			}
		}
	}
	await clickWorkspaceWizardNext(dialog, page);

	// Step 2: Network Isolation (allowed namespaces)
	if (namespaces.length > 0) {
		await fillNamespacesStep(page, dialog, namespaces);
	}
	await clickWorkspaceWizardNext(dialog, page);

	// Step 3: Default Resource Settings
	if (resource_quotas.length > 0) {
		await page.waitForTimeout(NEXT_IDLE_MS);
		await fillResourceQuotaFields(page, dialog, resource_quotas);
	}
	await clickWorkspaceWizardNext(dialog, page);

	const updateButton = administrationLocators.getUpdateWorkspaceSubmitButton(dialog);
	await expect(updateButton).toBeVisible();
	await updateButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
}

export async function switchWorkspace(page: Page, workspace_name: string): Promise<void> {
	logger.normal('[Administration_Workspace.api] switchWorkspace', { workspace_name });
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');

	// Open the workspace switcher (not the user profile / sidebar menu).
	const switchButton = administrationLocators.getWorkspaceSwitchDropdownTrigger(page);
	await expect(switchButton).toBeVisible({ timeout: 30000 });
	await switchButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	// Select the workspace from the menu.
	const workspaceMenuItem = administrationLocators.getWorkspaceSwitchMenuItem(page, workspaceNamePattern);
	await expect(workspaceMenuItem).toBeVisible({ timeout: 30000 });
	await workspaceMenuItem.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
}

function extractNamespaceFromUrl(url: string): string | null {
	const match = url.match(/[?&]namespace=([a-z0-9]([-a-z0-9]*[a-z0-9])?)/i);
	return match?.[1] ?? null;
}

async function resolveNamespaceFromResourceLinks(page: Page): Promise<string | null> {
	const links = page.locator('a[href*="namespace="]');
	const count = await links.count();
	for (let i = 0; i < count; i++) {
		const href = await links.nth(i).getAttribute('href');
		if (!href) continue;
		const candidate = extractNamespaceFromUrl(href);
		if (candidate && !['kserve', 'otterscale-system', 'kube-system'].includes(candidate)) {
			return candidate;
		}
	}
	return null;
}

function extractNamespaceCandidate(text: string): string | null {
	const namespaceLine = text.match(/namespace(?:\s*name)?\s*[:：]\s*([a-z0-9]([-a-z0-9]*[a-z0-9])?)/i);
	if (namespaceLine?.[1]) return namespaceLine[1];
	return null;
}

export type NamespaceResolutionEvidence = {
	namespace: string;
	source: 'switch-hint' | 'menu-item' | 'page-source' | 'workspace-settings';
};

/** Open current workspace settings (hexagon) and read K8s namespace from item-title index 2. */
export async function resolveWorkspaceNamespaceFromSettings(page: Page): Promise<string> {
	logger.normal('[Administration_Workspace.api] resolveWorkspaceNamespaceFromSettings');

	const hexagonButton = page.locator(
		'a[data-slot="button"][href*="kind=Workspace"][href*="resource=workspaces"]'
	);
	await expect(hexagonButton).toBeVisible({ timeout: 30000 });
	await hexagonButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const namespaceLocator = page.locator('[data-slot="item-title"]').nth(2);
	await expect(namespaceLocator).toBeVisible({ timeout: 30000 });
	const namespace = (await namespaceLocator.textContent())?.trim();
	if (!namespace) {
		throw new Error(
			'[resolveWorkspaceNamespaceFromSettings] Failed to extract namespace from workspace settings page'
		);
	}

	logger.normal('[Administration_Workspace.api] namespace from workspace settings', { namespace });
	return namespace;
}

export async function resolveCurrentWorkspaceNamespaceWithEvidence(page: Page): Promise<NamespaceResolutionEvidence> {
	logger.normal('[Administration_Workspace.api] resolveCurrentWorkspaceNamespaceWithEvidence');

	const fromLinks = await resolveNamespaceFromResourceLinks(page);
	if (fromLinks) {
		return { namespace: fromLinks, source: 'page-source' };
	}

	const switchButton = administrationLocators.getWorkspaceSwitchDropdownTrigger(page);
	await expect(switchButton).toBeVisible({ timeout: 30000 });
	await switchButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const hints = administrationLocators.getWorkspaceSwitchNamespaceHints(page);
	const hintCount = await hints.count();
	for (let i = 0; i < hintCount; i++) {
		const text = (await hints.nth(i).innerText()).trim();
		const candidate = extractNamespaceCandidate(text);
		if (candidate) {
			await page.keyboard.press('Escape');
			return { namespace: candidate, source: 'switch-hint' };
		}
	}

	const menuItems = administrationLocators.getWorkspaceSwitchDropdownMenuItems(page);
	const menuCount = await menuItems.count();
	for (let i = 0; i < menuCount; i++) {
		const text = (await menuItems.nth(i).innerText()).trim();
		const candidate = extractNamespaceCandidate(text);
		if (candidate) {
			await page.keyboard.press('Escape');
			return { namespace: candidate, source: 'menu-item' };
		}
	}

	await page.keyboard.press('Escape');

	const html = await page.content();
	const sourceMatch = html.match(/"namespace"\s*:\s*"([a-z0-9]([-a-z0-9]*[a-z0-9])?)"/i);
	if (sourceMatch?.[1]) {
		return { namespace: sourceMatch[1], source: 'page-source' };
	}

	try {
		const namespace = await resolveWorkspaceNamespaceFromSettings(page);
		return { namespace, source: 'workspace-settings' };
	} catch (error) {
		logger.normal('[Administration_Workspace.api] workspace settings namespace fallback failed', {
			error: error instanceof Error ? error.message : String(error)
		});
	}

	throw new Error('namespace-resolve: unable to resolve workspace namespace from account context or page source.');
}

export async function resolveCurrentWorkspaceNamespace(page: Page): Promise<string> {
	const result = await resolveCurrentWorkspaceNamespaceWithEvidence(page);
	logger.normal('[Administration_Workspace.api] namespace resolved', result);
	return result.namespace;
}

async function openDeleteWorkspaceDialog(page: Page, workspace_name: string): Promise<Locator> {
	await filterWorkspaceByName(page, workspace_name);
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const workspaceRow = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);

	await expect(workspaceRow).toHaveCount(1);
	await expect(workspaceRow.first()).toBeVisible();

	const actionButton = administrationLocators.getRowActionsButton(workspaceRow);
	await expect(actionButton).toBeVisible();
	await actionButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const deleteMenuItem = administrationLocators.getDeleteWorkspaceMenuItem(page);
	await expect(deleteMenuItem).toBeVisible();
	await deleteMenuItem.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const confirmDialog = administrationLocators.getDeleteWorkspaceConfirmDialog(page);
	await expect(confirmDialog).toBeVisible();
	return confirmDialog;
}

export async function submitDeleteWorkspaceWithMismatchedNameAndAssertBlocked(
	page: Page,
	workspace_name: string,
	wrongName: string
): Promise<void> {
	logger.normal('[Administration_Workspace.api] submitDeleteWorkspaceWithMismatchedNameAndAssertBlocked', {
		workspace_name,
		wrongName
	});

	const confirmDialog = await openDeleteWorkspaceDialog(page, workspace_name);
	const workspaceNameInput = administrationLocators.getDeleteConfirmWorkspaceNameInput(confirmDialog);
	await expect(workspaceNameInput).toBeVisible();
	await workspaceNameInput.fill(wrongName);
	await expect(workspaceNameInput).toHaveValue(wrongName);

	const deleteRequestUrls: string[] = [];
	const onRequest = (request: { method: () => string; url: () => string }) => {
		if (request.method().toUpperCase() !== 'DELETE') return;
		if (/workspaces?/i.test(request.url())) {
			deleteRequestUrls.push(request.url());
		}
	};
	page.on('request', onRequest);

	try {
		const submitButton = administrationLocators.getDeleteConfirmSubmitButton(confirmDialog);
		await expect(submitButton).toBeVisible();
		const isSubmitDisabled = await submitButton.isDisabled();
		if (!isSubmitDisabled) {
			await submitButton.click();
			await page.waitForTimeout(NEXT_IDLE_MS);
		}
	} finally {
		page.off('request', onRequest);
	}

	const mismatchMessage = administrationLocators.getDeleteConfirmNameMismatchMessages(confirmDialog);
	const hasMismatchMessage = (await mismatchMessage.count()) > 0;
	const submitButton = administrationLocators.getDeleteConfirmSubmitButton(confirmDialog);
	const isSubmitDisabled = await submitButton.isDisabled();

	expect(
		hasMismatchMessage || isSubmitDisabled,
		'[delete workspace mismatch] must show validation message or keep submit disabled'
	).toBeTruthy();
	if (hasMismatchMessage) {
		await expect(mismatchMessage.first()).toBeVisible();
	}
	await expect(confirmDialog, '[delete workspace dialog] must remain visible').toBeVisible();
	expect(deleteRequestUrls, '[delete workspace request] must not be sent when name mismatches').toHaveLength(0);
	await expect
		.poll(async () => workspaceExists(page, workspace_name), {
			timeout: 10000,
			message: `[workspace-delete-blocked:${workspace_name}] workspace row must remain in table`
		})
		.toBeTruthy();

	const closeButton = administrationLocators.getDeleteWorkspaceDialogCloseButton(confirmDialog);
	if ((await closeButton.count()) > 0) {
		await closeButton.first().click();
		await expect(confirmDialog).toBeHidden({ timeout: 10000 });
	}
}

export async function deleteWorkspace(
	page: Page,
	workspace_name: string,
	input_workspace_name: string
): Promise<void> {
	logger.normal('[Administration_Workspace.api] deleteWorkspace', { workspace_name, input_workspace_name });
	await filterWorkspaceByName(page, workspace_name);
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const workspaceRow = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);

	await expect(workspaceRow).toHaveCount(1);
	await expect(workspaceRow.first()).toBeVisible();

	const actionButton = administrationLocators.getRowActionsButton(workspaceRow);
	await expect(actionButton).toBeVisible();
	await actionButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const deleteMenuItem = administrationLocators.getDeleteWorkspaceMenuItem(page);
	await expect(deleteMenuItem).toBeVisible();
	await deleteMenuItem.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const confirmDialog = administrationLocators.getDeleteWorkspaceConfirmDialog(page);

	await expect(confirmDialog).toBeVisible();

	const workspaceNameInput = administrationLocators.getDeleteConfirmWorkspaceNameInput(confirmDialog);
	await expect(workspaceNameInput).toBeVisible();
	await workspaceNameInput.fill(input_workspace_name);
	await page.waitForTimeout(NEXT_IDLE_MS);

	const submitButton = administrationLocators.getDeleteConfirmSubmitButton(confirmDialog);
	await expect(submitButton).toBeVisible();
	await submitButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
}

export async function rapidCreateDeleteRecreateWorkspace(
	page: Page,
	workspace_name: string,
	members: WorkspaceMember[],
	resource_quotas: string[]
): Promise<void> {
	await ensureWorkspaceDeleted(page, workspace_name);

	await createWorkspace(page, workspace_name, members, [], resource_quotas, true);
	await $row(page, workspace_name, 20000);

	const firstRow = await $row(page, workspace_name);
	const actionButton = await $unique(administrationLocators.getRowActionsButton(firstRow), 'workspace row actions button');
	await actionButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const deleteMenuItem = await $unique(
		administrationLocators.getWorkspaceActionsMenuItemByName(page, /^\s*Delete\s*$/i),
		'workspace delete menu item'
	);
	await deleteMenuItem.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const confirmDialog = await $dialog(page, 'delete');
	const confirmInput = await $unique(
		administrationLocators.getDeleteConfirmWorkspaceNameInput(confirmDialog),
		'delete confirm workspace name input'
	);
	await confirmInput.fill(workspace_name);

	const confirmSubmit = await $unique(
		administrationLocators.getDeleteConfirmSubmitButton(confirmDialog),
		'delete confirm submit button'
	);
	await confirmSubmit.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
	await expect.poll(async () => workspaceExists(page, workspace_name), { timeout: 30000 }).toBeFalsy();

	await createWorkspace(page, workspace_name, members, [], resource_quotas, true);
	await $row(page, workspace_name, 20000);
	await expect(administrationLocators.getWorkspaceNameConflictToasts(page)).toHaveCount(0);
}

export async function openWorkspacePage(page: Page): Promise<void> {
	const menuPath = ['Platform', 'Administration', 'Workspace'] as const;
	logger.normal('[Administration_Workspace.api] openWorkspacePage', { menuPath });
	await menuPageApi.clickMenuPathByNames(page, menuPath[0], menuPath[1], menuPath[2]);
	await page.waitForTimeout(NEXT_IDLE_MS);
}

export async function filterWorkspaceByName(page: Page, workspace_name: string): Promise<void> {
	const searchInput = await $unique(
		administrationLocators.getWorkspaceGlobalFilterInput(page),
		'workspace-global-filter-input'
	);
	await searchInput.fill(`Name ~= "${workspace_name}"`);
	await searchInput.press('Control+Enter');
	await page.waitForTimeout(500);
}

export async function searchWorkspaceByName(page: Page, workspace_name: string): Promise<void> {
	await filterWorkspaceByName(page, workspace_name);
	await expect
		.poll(async () => workspaceExists(page, workspace_name), {
			timeout: 30000,
			message: `[workspace-search:${workspace_name}] filtered row must appear`
		})
		.toBeTruthy();
}

export async function workspaceExists(page: Page, workspace_name: string): Promise<boolean> {
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const row = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);
	return (await row.count()) > 0;
}

export async function ensureWorkspaceDeleted(page: Page, workspace_name: string): Promise<void> {
	await openWorkspacePage(page);
	await filterWorkspaceByName(page, workspace_name);
	if (!(await workspaceExists(page, workspace_name))) return;
	await deleteWorkspace(page, workspace_name, workspace_name);
	await expect.poll(async () => workspaceExists(page, workspace_name), { timeout: 30000 }).toBeFalsy();
}

export async function assertWorkspaceVisibleInTable(
	page: Page,
	workspace_name: string,
	timeout = 15000
): Promise<Locator> {
	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const row = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);
	await expect(row).toHaveCount(1, { timeout });
	await expect(row).toBeVisible({ timeout });
	return row;
}

/** Close open Workspace dialogs and row action dropdowns before the next table action. */
export async function dismissWorkspaceOverlays(page: Page): Promise<void> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const dialogCount = await page
			.locator('[role="dialog"]:visible, [role="alertdialog"]:visible')
			.count();
		const menuCount = await administrationLocators.getWorkspaceOpenActionsMenu(page).count();
		if (dialogCount === 0 && menuCount === 0) {
			return;
		}
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	}
}

export async function openWorkspaceTableAction(
	page: Page,
	workspace_name: string,
	action: 'View' | 'Describe' | 'Edit' | 'Delete' | 'Update'
): Promise<void> {
	await dismissWorkspaceOverlays(page);

	const row = await assertWorkspaceVisibleInTable(page, workspace_name);
	await row.scrollIntoViewIfNeeded();
	const actionButton = administrationLocators.getRowActionsButton(row);
	await expect(actionButton).toBeVisible();

	const openMenu = administrationLocators.getWorkspaceOpenActionsMenu(page);
	if ((await openMenu.count()) === 0) {
		await actionButton.click();
		await page.waitForTimeout(NEXT_IDLE_MS);
	}

	await expect(openMenu, '[workspace-actions-menu] must be open').toBeVisible();

	const actionPattern = new RegExp(`^\\s*${escapeRegExp(action)}\\s*$`, 'i');
	const actionTrigger = administrationLocators.getWorkspaceActionMenuTrigger(page, actionPattern);
	await expect(actionTrigger, `[workspace-action:${action}] trigger must exist`).toHaveCount(1);
	await expect(actionTrigger).toBeVisible();
	await actionTrigger.click({ force: true });
	await page.waitForTimeout(NEXT_IDLE_MS);
}

export async function assertWorkspaceManifestVisible(page: Page, timeout = 5000): Promise<void> {
	const manifestBlock = page
		.locator('pre.shiki, pre code, code')
		.filter({ hasText: /(apiVersion|kind|metadata)/i });
	await expect(manifestBlock.first()).toBeVisible({ timeout });
}

export async function assertWorkspaceDescribeVisible(
	page: Page,
	workspace_name: string,
	timeout = 5000
): Promise<void> {
	const workspaceNamePattern = new RegExp(escapeRegExp(workspace_name), 'i');
	const describeDialog = page
		.getByRole('dialog')
		.filter({ hasText: new RegExp(`Describe\\s*[—-]\\s*${escapeRegExp(workspace_name)}`, 'i') });
	await expect(describeDialog.first()).toBeVisible({ timeout });

	const detailContent = describeDialog
		.first()
		.locator('[role="tabpanel"], [data-slot="dialog-content"], pre, code')
		.filter({ hasText: workspaceNamePattern })
		.first();
	await expect(detailContent).toBeVisible({ timeout });
}

async function assertWorkspaceCreateBlockedInToolbar(page: Page): Promise<void> {
	const createTrigger = administrationLocators.getWorkspaceCreateButton(page);
	if ((await createTrigger.count()) > 0) {
		await expect(createTrigger).toBeVisible();
		await expect(createTrigger).toBeDisabled();
		logger.normal('[assertWorkspaceCreateBlockedInToolbar] Create dialog trigger is disabled');
		return;
	}

	const disabledCreateButton = administrationLocators.getWorkspaceToolbarDisabledCreateButton(page);
	await expect(disabledCreateButton).toBeVisible();
	await expect(disabledCreateButton).toBeDisabled();
	logger.normal('[assertWorkspaceCreateBlockedInToolbar] Toolbar create button is disabled');
}

export async function createWorkspaceAndAssertBlockedForViewRole(
	page: Page,
	workspace_name: string
): Promise<void> {
	logger.normal('[createWorkspaceAndAssertBlockedForViewRole] Start', { workspace_name });

	await assertWorkspaceCreateBlockedInToolbar(page);

	const createDialog = administrationLocators.getCreateWorkspaceDialog(page);
	await expect(createDialog).toHaveCount(0);

	await filterWorkspaceByName(page, workspace_name);
	expect(await workspaceExists(page, workspace_name)).toBeFalsy();

	logger.normal('[createWorkspaceAndAssertBlockedForViewRole] Blocked as expected', { workspace_name });
}

export async function verifyDeleteWorkspaceBlockedForViewRole(
	page: Page,
	workspace_name: string
): Promise<void> {
	logger.normal('[verifyDeleteWorkspaceBlockedForViewRole] Start', { workspace_name });
	await dismissWorkspaceOverlays(page);
	await filterWorkspaceByName(page, workspace_name);
	await assertWorkspaceVisibleInTable(page, workspace_name);

	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const workspaceRow = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);
	const actionButton = administrationLocators.getRowActionsButton(workspaceRow);
	await expect(actionButton).toBeVisible();
	await actionButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const deleteMenuItem = administrationLocators.getDeleteWorkspaceMenuItem(page);
	await expect(deleteMenuItem).toBeVisible();
	await deleteMenuItem.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const confirmDialog = administrationLocators.getDeleteWorkspaceConfirmDialog(page);
	await expect(confirmDialog).toBeVisible();

	const workspaceNameInput = administrationLocators.getDeleteConfirmWorkspaceNameInput(confirmDialog);
	await expect(workspaceNameInput).toBeVisible();
	await workspaceNameInput.fill(workspace_name);
	await expect(workspaceNameInput).toHaveValue(workspace_name);

	const submitButton = administrationLocators.getDeleteConfirmSubmitButton(confirmDialog);
	await expect(submitButton).toBeVisible();
	await submitButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	await assertWorkspaceVisibleInTable(page, workspace_name);

	const closeButton = administrationLocators.getDeleteWorkspaceDialogCloseButton(confirmDialog);
	if ((await closeButton.count()) > 0) {
		await closeButton.first().click();
		await expect(confirmDialog).toBeHidden({ timeout: 10000 }).catch(() => undefined);
	} else {
		await page.keyboard.press('Escape');
	}

	logger.normal('[verifyDeleteWorkspaceBlockedForViewRole] Blocked as expected', { workspace_name });
}

async function getWorkspaceTableHeaderValues(page: Page): Promise<string[]> {
	const table = page.locator('table').first();
	await expect(table).toBeVisible({ timeout: 15000 });
	const headerCells = table.locator('thead th, tr[data-slot="table-header-row"] th');
	const headerCount = await headerCells.count();
	return Promise.all(
		Array.from({ length: headerCount }, async (_, index) => (await headerCells.nth(index).innerText()).trim())
	);
}

async function isWorkspaceNamespaceColumnVisible(page: Page): Promise<boolean> {
	const headerValues = await getWorkspaceTableHeaderValues(page);
	return headerValues.some((header) => /^namespace$/i.test(header));
}

export async function ensureWorkspaceTableListView(page: Page): Promise<void> {
	const listViewButton = administrationLocators.getWorkspaceTableViewButton(page);
	if ((await listViewButton.count()) === 0) {
		logger.normal('[ensureWorkspaceTableListView] Table view toggle not present, skip');
		return;
	}

	const button = await $unique(listViewButton, 'workspace-table-view-button');
	const isPressed = await button.getAttribute('aria-pressed');
	if (isPressed === 'true') {
		logger.normal('[ensureWorkspaceTableListView] Workspace list is already in table view');
		return;
	}

	await button.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
	await expect(button).toHaveAttribute('aria-pressed', 'true');
	logger.normal('[ensureWorkspaceTableListView] Switched workspace list to table view');
}

function getWorkspaceDataTableRows(page: Page): Locator {
	return administrationLocators.getWorkspaceTableRows(page).filter({
		has: page.locator('td')
	});
}

async function getFirstWorkspaceDataTableRow(page: Page): Promise<Locator> {
	const rows = getWorkspaceDataTableRows(page);
	await expect
		.poll(async () => rows.count(), {
			timeout: 30000,
			message: '[workspace-table] data rows must be visible'
		})
		.toBeGreaterThan(0);
	return rows.first();
}

export async function ensureWorkspaceTableNamespaceColumnVisible(page: Page): Promise<void> {
	await ensureWorkspaceTableListView(page);

	if (await isWorkspaceNamespaceColumnVisible(page)) {
		logger.normal('[ensureWorkspaceTableNamespaceColumnVisible] Namespace column already visible');
		return;
	}

	const toggleButton = await $unique(
		administrationLocators.getWorkspaceToggleColumnsButton(page),
		'workspace-toggle-columns-button'
	);
	await toggleButton.click();
	await page.waitForTimeout(NEXT_IDLE_MS);

	const namespaceMenuItem = administrationLocators.getWorkspaceToggleColumnsNamespaceMenuItem(page);
	await expect(namespaceMenuItem).toBeVisible();
	await namespaceMenuItem.click();
	await page.waitForTimeout(NEXT_IDLE_MS);
	await page.keyboard.press('Escape');

	await expect
		.poll(async () => isWorkspaceNamespaceColumnVisible(page), {
			timeout: 5000,
			message: '[workspace-namespace-column] must become visible after toggle'
		})
		.toBeTruthy();

	logger.normal('[ensureWorkspaceTableNamespaceColumnVisible] Namespace column is visible');
}

async function getWorkspaceNamespaceFromTableRow(page: Page, row: Locator): Promise<string> {
	const headerValues = await getWorkspaceTableHeaderValues(page);
	const namespaceIndex = headerValues.findIndex((header) => /^namespace$/i.test(header));
	if (namespaceIndex < 0) {
		throw new Error(
			'[getWorkspaceNamespaceFromTableRow] Namespace column is not visible; call ensureWorkspaceTableNamespaceColumnVisible first'
		);
	}

	const cells = row.locator('td');
	await expect
		.poll(async () => cells.count(), {
			timeout: 5000,
			message: '[getWorkspaceNamespaceFromTableRow] table row cells must include namespace column'
		})
		.toBeGreaterThan(namespaceIndex);

	const namespace = (await cells.nth(namespaceIndex).innerText()).trim();
	if (!namespace) {
		throw new Error('[getWorkspaceNamespaceFromTableRow] Workspace row has an empty namespace cell');
	}

	return namespace;
}

/** Toggle Namespace column, filter by workspace name, and return the namespace cell value. */
export async function resolveWorkspaceNamespaceFromTable(
	page: Page,
	workspace_name: string
): Promise<string> {
	logger.normal('[resolveWorkspaceNamespaceFromTable] Start', { workspace_name });
	await openWorkspacePage(page);
	await searchWorkspaceByName(page, workspace_name);
	await ensureWorkspaceTableNamespaceColumnVisible(page);

	const workspaceNamePattern = new RegExp(`^\\s*${escapeRegExp(workspace_name)}\\s*$`, 'i');
	const row = administrationLocators.getWorkspaceTableRowByName(page, workspaceNamePattern);
	await expect(row, `[resolveWorkspaceNamespaceFromTable:${workspace_name}] workspace row must exist`).toHaveCount(1);

	const namespace = await getWorkspaceNamespaceFromTableRow(page, row.first());
	logger.normal('[resolveWorkspaceNamespaceFromTable] Resolved', { workspace_name, namespace });
	return namespace;
}

export async function getFirstWorkspaceNamespaceFromTable(page: Page): Promise<string> {
	await ensureWorkspaceTableListView(page);

	const firstRow = await getFirstWorkspaceDataTableRow(page);
	const namespace = await getWorkspaceNamespaceFromTableRow(page, firstRow);
	const headerValues = await getWorkspaceTableHeaderValues(page);
	const namespaceIndex = headerValues.findIndex((header) => /^namespace$/i.test(header));

	logger.normal('[getFirstWorkspaceNamespaceFromTable] Resolved namespace from first workspace row', {
		namespace,
		namespaceIndex,
		headerValues
	});
	return namespace;
}
