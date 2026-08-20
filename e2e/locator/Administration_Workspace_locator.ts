import { type Locator, type Page } from '@playwright/test';

/**
 * Administration → **Workspace**: navigation, dialogs, and helpers for the create-workspace form.
 *
 * `RESOURCE_QUOTA_FIELD_NAMES` lists generated input `name` values for ResourceQuota “hard” limits (form id prefix `root`).
 */

/**
 * Input `name` attributes for ResourceQuota CPU/memory/GPU limits in the generated form (`root` prefix).
 * Each entry maps to one field under the quota “hard” section.
 */
export const RESOURCE_QUOTA_FIELD_NAMES = [
	'root_hard_requests.cpu',
	'root_hard_requests.memory',
	'root_hard_requests.nvidia.com/gpu',
	'root_hard_requests.nvidia.com/gpumem',
	'root_hard_limits.cpu',
	'root_hard_limits.memory',
	'root_hard_limits.nvidia.com/gpu',
	'root_hard_limits.nvidia.com/gpumem'
] as const;

/** Selector for allowed-namespace text fields (`root_allowedNamespaces_*` ids). */
export const NAMESPACE_INPUT_SELECTOR = 'input[id^="root_allowedNamespaces_"], input[id*="allowedNamespaces_"]';

/** Sidebar label **Workspace** (exact text). */
export function getWorkspaceMenuItem(page: Page): Locator {
	return page.locator('a[href*="kind=Workspace"][href*="resource=workspaces"]', {
		hasText: /^\s*Workspace\s*$/i
	});
}

/** Page header title for this resource kind. */
export function getWorkspacePageTitle(page: Page): Locator {
	return page.locator('h1, h2, h3, [data-slot="item-title"]', { hasText: /^\s*Workspace\s*$/i });
}

/** Rows in the main resource list table. */
export function getWorkspaceTableRows(page: Page): Locator {
	return page.locator('tr[data-slot="table-row"]');
}

/** Global filter search input in the resource list toolbar. */
export function getWorkspaceGlobalFilterInput(page: Page): Locator {
	return page.locator('#global_filter_identifier');
}

/** Toolbar button that opens the "Toggle columns" dropdown on the Workspace list table. */
export function getWorkspaceToggleColumnsButton(page: Page): Locator {
	return page
		.locator('button:visible')
		.filter({ has: page.locator('svg.lucide-columns-3, svg.lucide-columns2, svg.lucide-columns') })
		.first();
}

/** Toolbar button that switches the Workspace list to table/list view. */
export function getWorkspaceTableViewButton(page: Page): Locator {
	return page
		.locator('button:visible')
		.filter({ has: page.locator('svg.lucide-sheet, svg.lucide-list, svg.lucide-layout-list') })
		.first();
}

/** Open "Toggle columns" dropdown menu on the Workspace list table. */
export function getWorkspaceToggleColumnsMenu(page: Page): Locator {
	return page.locator('[data-slot="dropdown-menu-content"]:visible').filter({
		hasText: /Toggle columns/i
	});
}

/** Namespace column toggle item inside the "Toggle columns" dropdown. */
export function getWorkspaceToggleColumnsNamespaceMenuItem(page: Page): Locator {
	return page.getByRole('menuitem', { name: /^Namespace$/i });
}

/** Table row for a workspace by name (truncated link in the name cell). */
export function getWorkspaceTableRowByName(page: Page, workspaceNamePattern: RegExp): Locator {
	return getWorkspaceTableRows(page).filter({
		has: page.locator('td[data-slot="table-cell"] a p.truncate', {
			hasText: workspaceNamePattern
		})
	});
}

/** Workspace name link; opens the detail page. */
export function getWorkspaceNameLink(row: Locator): Locator {
	return row.locator('td[data-slot="table-cell"] a');
}

/** Create-workspace control in list toolbar (dialog trigger with plus icon). */
export function getWorkspaceCreateButton(page: Page): Locator {
	return page
		.locator('button[data-slot="dialog-trigger"][data-dialog-trigger]')
		.filter({ has: page.locator('svg.lucide-plus') })
		.first();
}

/** Disabled create control in list toolbar (plain button or disabled dialog trigger). */
export function getWorkspaceToolbarDisabledCreateButton(page: Page): Locator {
	return page.locator('button[disabled]').filter({ has: page.locator('svg.lucide-plus') }).first();
}

/** Backward-compatible alias for existing tests. */
export function getCreateWorkspaceButton(page: Page): Locator {
	return getWorkspaceCreateButton(page);
}

/** Empty-state "Create" button shown when no workspace is selected/found. */
export function getWorkspaceEmptyStateCreateButton(page: Page): Locator {
	return page.getByRole('button', { name: /^\s*Create\s*$/i });
}

/** Menu item "Create" in workspace switch dropdown. */
export function getWorkspaceSwitchCreateMenuItem(page: Page): Locator {
	return page.getByRole('menuitem', { name: /^\s*Create\s*$/i });
}

/**
 * Create-workspace modal — easiest to find via the `root_name` input inside it.
 */
export function getWorkspaceCreateDialog(page: Page): Locator {
	return page.getByRole('dialog').filter({
		has: page.locator('input#root_name[name="root_name"]')
	});
}

/** Backward-compatible alias for existing tests. */
export function getCreateWorkspaceDialog(page: Page): Locator {
	return getWorkspaceCreateDialog(page);
}

export function getWorkspaceNameInputInCreateDialog(dialog: Locator): Locator {
	return dialog.locator('input#root_name[name="root_name"]');
}

/** Combobox used to search and pick a user in member rows. */
export function getCommandComboboxSearchInput(page: Page): Locator {
	return page.locator('input[data-slot="command-input"][role="combobox"]:visible');
}

export function getNamespaceInputs(dialog: Locator): Locator {
	return dialog.locator(NAMESPACE_INPUT_SELECTOR);
}

export function getResourceQuotaInputByName(
	dialog: Locator,
	name: (typeof RESOURCE_QUOTA_FIELD_NAMES)[number]
): Locator {
	return dialog.locator(`input[name="${name}"]`);
}

/** License injection enable checkbox on create/update workspace wizard. */
export function getWorkspaceLicenseInjectionCheckbox(dialog: Locator): Locator {
	return dialog.locator('button#root_licenseInjection[role="checkbox"]');
}

/** Enabled "Next" buttons in create-workspace wizard footer. */
export function getWorkspaceWizardNextButton(dialog: Locator): Locator {
	return dialog.locator(':scope div.mt-auto.w-full button[type="submit"]:enabled:visible').filter({
		hasText: /^\s*Next\s*$/i
	});
}

/** Generic "Create" submit button inside workspace create dialog. */
export function getWorkspaceCreateSubmitButton(dialog: Locator): Locator {
	return dialog.getByRole('button', { name: /^\s*Create\s*$/i });
}

export function getCreateSubmitButton(page: Page): Locator {
	return page.getByRole('button', { name: /^Create$/i });
}

/** First matching workspace row after create. */
export function getCreatedWorkspaceTableRow(page: Page, workspaceNamePattern: RegExp): Locator {
	return getWorkspaceTableRowByName(page, workspaceNamePattern);
}

/** Row-level action trigger button (ellipsis button with aria-label "Actions"). */
export function getWorkspaceRowActionsButton(row: Locator): Locator {
	return row.locator('button[aria-label="Actions"]');
}

/** Backward-compatible alias for existing tests. */
export function getRowActionsButton(row: Locator): Locator {
	return getWorkspaceRowActionsButton(row);
}

/** Menu item in an open dropdown, matched by its label text. */
export function getWorkspaceActionsMenuItemByName(page: Page, actionNamePattern: RegExp): Locator {
	return page.getByRole('menuitem', { name: actionNamePattern });
}

/** Open row actions dropdown menu surface (most recently opened). */
export function getWorkspaceOpenActionsMenu(page: Page): Locator {
	return page.locator('[data-slot="dropdown-menu-content"]:visible, [role="menu"]:visible').last();
}

/** Dialog trigger for a row action (View / Describe / Update / Delete) in the open menu. */
export function getWorkspaceActionMenuTrigger(page: Page, actionNamePattern: RegExp): Locator {
	const menu = getWorkspaceOpenActionsMenu(page);
	return menu.getByRole('button', { name: actionNamePattern });
}

export function getWorkspaceViewMenuItem(page: Page): Locator {
	return getWorkspaceActionsMenuItemByName(page, /^\s*View\s*$/i);
}

export function getWorkspaceDescribeMenuItem(page: Page): Locator {
	return getWorkspaceActionsMenuItemByName(page, /^\s*Describe\s*$/i);
}

export function getWorkspaceEditMenuItem(page: Page): Locator {
	return getWorkspaceActionsMenuItemByName(page, /^\s*Edit\s*$/i);
}

/** Row actions menu item for member management. */
export function getWorkspaceMembersMenuItem(page: Page): Locator {
	return getWorkspaceActionsMenuItemByName(page, /^\s*(Manage\s+Members|Members)\s*$/i);
}

/** Workspace overview page Edit dialog trigger (pencil icon button). */
export function getWorkspaceOverviewEditButton(page: Page): Locator {
	return page
		.locator('button[data-slot="dialog-trigger"][data-dialog-trigger]', {
			has: page.locator('svg.lucide-pencil, svg.lucide-icon.lucide-pencil')
		});
}

export function getWorkspaceDeleteMenuItem(page: Page): Locator {
	return getWorkspaceActionsMenuItemByName(page, /^\s*Delete\s*$/i);
}

/** "Update" entry in row actions menu (legacy name used by older tests). */
export function getUpdateWorkspaceMenuItem(page: Page): Locator {
	return page
		.locator('[data-slot="alert-dialog-trigger"]')
		.filter({ has: page.locator('[data-slot="item-title"]', { hasText: /^\s*Update\s*$/i }) });
}

/** Edit-workspace flow root dialog. */
export function getUpdateWorkspaceDialog(page: Page): Locator {
	return page
		.locator('[data-slot="dialog-content"], [data-dialog-content], [role="dialog"]')
		.filter({ has: page.locator('[data-slot="item-title"]', { hasText: /^\s*Workspace\s*$/i }) });
}

export function getUpdateWorkspaceSubmitButton(dialog: Locator): Locator {
	return dialog
		.locator('button[data-slot="button"][type="button"]')
		.filter({ hasText: /^\s*Update\s*$/i });
}

/** Field legend in update dialog wizard (Members / Network Isolation / Resource Quota). */
export function getUpdateWorkspaceStepLegend(dialog: Locator, stepNamePattern: RegExp): Locator {
	return dialog.locator('legend[data-slot="field-legend"]', { hasText: stepNamePattern });
}

/** YAML preview panel in update wizard (contains rendered manifest text). */
export function getUpdateWorkspaceYamlPreviewPanel(dialog: Locator): Locator {
	return dialog
		.locator('[role="tabpanel"], pre, code')
		.filter({ hasText: /(apiVersion:\s*tenant\.otterscale\.io|kind:\s*Workspace)/i });
}

/** YAML preview step in create-workspace wizard (final tabpanel with Monaco editor). */
export function getCreateWorkspaceYamlPreviewPanel(dialog: Locator): Locator {
	return dialog.locator('[role="tabpanel"].min-h-\\[77vh\\]');
}

/** Monaco editor textbox on the create-workspace YAML preview step. */
export function getCreateWorkspaceYamlEditorTextbox(dialog: Locator): Locator {
	return getCreateWorkspaceYamlPreviewPanel(dialog).getByRole('textbox', { name: /Editor content/i });
}

/** Create button on the create-workspace YAML preview step. */
export function getCreateWorkspaceYamlCreateButton(dialog: Locator): Locator {
	return getCreateWorkspaceYamlPreviewPanel(dialog).getByRole('button', { name: /^\s*Create\s*$/i });
}

/** Creator-like admin member row: derived name field + admin role (single-member guard tests). */
export function getUpdateWorkspaceCreatorAdminMemberRow(dialog: Locator): Locator {
	return getMemberArrayItems(dialog)
		.filter({
			has: dialog.locator('input[placeholder="Derived by Identifier"]')
		})
		.filter({
			has: dialog.locator('[role="combobox"]', { hasText: /^\s*admin\s*$/i })
		});
}

/** Derived member name input inside one member row (readOnly asserted in API helper). */
export function getUpdateWorkspaceMemberNameReadonlyInput(memberRow: Locator): Locator {
	return memberRow.locator('input[placeholder="Derived by Identifier"]');
}

/** Admin role combobox in one member row. */
export function getUpdateWorkspaceMemberAdminRoleCombobox(memberRow: Locator): Locator {
	return memberRow.locator('[role="combobox"]', { hasText: /^\s*admin\s*$/i });
}

/** Remove button in one member row (trash icon). */
export function getUpdateWorkspaceMemberRemoveButton(memberRow: Locator): Locator {
	return memberRow.locator('button:has(svg.lucide-trash)');
}

/** Close button for workspace update dialog. */
export function getUpdateWorkspaceDialogCloseButton(dialog: Locator): Locator {
	return dialog.locator('button[data-slot="dialog-close"]');
}

/** Error feedback after forbidden admin-member mutation attempts. */
export function getUpdateWorkspaceAdminProtectionError(page: Page): Locator {
	return page.locator('[data-sonner-toast], [data-slot="toast"], [role="alert"], [data-slot="form-message"]').filter({
		hasText:
			/(cannot|failed|forbidden|invalid|at least one admin|admin.*(remove|role)|remove.*admin|permission)/i
	});
}

/** Header control that opens the workspace switcher (excluding sidebar profile trigger). */
export function getWorkspaceSwitchDropdownTrigger(page: Page): Locator {
	return page.locator('button:has(a[href*="kind=Workspace"][href*="resource=workspaces"])');
}

export function getWorkspaceSwitchDropdownMenuItems(page: Page): Locator {
	return page.locator('[data-slot="dropdown-menu-item"][role="menuitem"]');
}

export function getWorkspaceSwitchNamespaceHints(page: Page): Locator {
	return page.locator('[data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-content"]', {
		hasText: /namespace|命名空間/i
	});
}

export function getWorkspaceSwitchMenuItem(page: Page, workspaceNamePattern: RegExp): Locator {
	return page
		.locator('[data-slot="dropdown-menu-item"][role="menuitem"]')
		.filter({ has: page.locator('span.truncate.font-medium', { hasText: workspaceNamePattern }) });
}

/** Validation messages rendered for workspace name and other wizard fields. */
export function getWorkspaceCreateValidationMessages(dialog: Locator): Locator {
	return dialog.locator(
		[
			'[data-slot="form-message"]',
			'[aria-live="polite"]',
			'[aria-live="assertive"]',
			'[role="alert"]',
			'p.text-destructive',
			'span.text-destructive'
		].join(', ')
	);
}

/** Toast/notification area for create failures after submit. */
export function getWorkspaceCreateErrorToasts(page: Page): Locator {
	return page.locator('[data-sonner-toast], [data-slot="toast"], [role="alert"]').filter({
		hasText: /(failed to create workspace|invalid|kubernetes|dns-1123|metadata\.name|match pattern|allowedNamespaces)/i
	});
}

function buildWorkspaceForbiddenToastPattern(action: 'create' | 'delete', workspaceName: string): RegExp {
	const escapedName = workspaceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	if (action === 'delete') {
		return new RegExp(`Failed to delete Workspace\\s+${escapedName}:.*permission_denied`, 'i');
	}
	return new RegExp(`Failed to create Workspace\\s+${escapedName}:.*permission_denied`, 'i');
}

function getWorkspaceActionNotificationTitles(page: Page): Locator {
	return page.locator('[data-sonner-toast], [data-slot="toast"], [role="alert"], div[data-content] div[data-title]');
}

/** Error toast when create Workspace is rejected by RBAC. */
export function getWorkspaceCreateForbiddenErrorToast(page: Page, workspaceName: string): Locator {
	return getWorkspaceActionNotificationTitles(page).filter({
		hasText: buildWorkspaceForbiddenToastPattern('create', workspaceName)
	});
}

/** Error toast when delete Workspace is rejected by RBAC. */
export function getWorkspaceDeleteForbiddenErrorToast(page: Page, workspaceName: string): Locator {
	return getWorkspaceActionNotificationTitles(page).filter({
		hasText: buildWorkspaceForbiddenToastPattern('delete', workspaceName)
	});
}

/** Success toasts when workspace is created/deleted. */
export function getWorkspaceOperationSuccessToasts(page: Page): Locator {
	return page.locator('[data-sonner-toast], [data-slot="toast"], [role="alert"]').filter({
		hasText: /(workspace).*(created|create|deleted|delete|success|successful)/i
	});
}

/** Success toast emitted after creating a workspace. */
export function getWorkspaceCreateSuccessToasts(page: Page): Locator {
	return page.locator('[data-sonner-toast], [data-slot="toast"], [role="alert"]').filter({
		hasText: /(workspace).*(created|create).*(success|successful)?/i
	});
}

/** Success toast emitted after deleting a workspace. */
export function getWorkspaceDeleteSuccessToasts(page: Page): Locator {
	return page.locator('[data-sonner-toast], [data-slot="toast"], [role="alert"]').filter({
		hasText: /(workspace).*(deleted|delete).*(success|successful)?/i
	});
}

/** Conflict/error toasts for duplicate workspace name on create. */
export function getWorkspaceNameConflictToasts(page: Page): Locator {
	return page.locator('[data-sonner-toast], [data-slot="toast"], [role="alert"]').filter({
		hasText: /(already exists|already taken|duplicate|conflict|name.*exists)/i
	});
}

export function getDeleteWorkspaceMenuItem(page: Page): Locator {
	return page
		.locator('[data-slot="dialog-trigger"]')
		.filter({ has: page.locator('[data-slot="item-title"]', { hasText: /^\s*Delete\s*$/i }) });
}

/** Delete confirmation dialog surface that includes Workspace copy. */
export function getDeleteWorkspaceConfirmDialog(page: Page): Locator {
	return page
		.locator('[data-slot="alert-dialog-content"], [role="alertdialog"], [data-slot="dialog-content"]')
		.filter({ hasText: /Workspace/i });
}

export function getDeleteConfirmWorkspaceNameInput(confirmDialog: Locator): Locator {
	return confirmDialog.locator('input#root_name[name="root_name"]');
}

export function getDeleteConfirmSubmitButton(confirmDialog: Locator): Locator {
	return confirmDialog.locator('button[type="submit"]', { hasText: /^\s*Submit\s*$/i });
}

/** Close button in delete confirmation dialog header. */
export function getDeleteWorkspaceDialogCloseButton(confirmDialog: Locator): Locator {
	return confirmDialog.locator('[data-slot="dialog-close"]');
}

/** Validation message shown when typed name does not match workspace name. */
export function getDeleteConfirmNameMismatchMessages(confirmDialog: Locator): Locator {
	return confirmDialog
		.locator('[data-slot="form-message"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]')
		.filter({
			hasText:
				/(name.*(does not match|mismatch)|名稱.*(不符|不一致)|must match|doesn't match|please enter.*to confirm|請輸入.*以確認)/i
		});
}

/** Rows for repeating form sections (e.g. workspace members list). */
export function getMemberArrayItems(dialog: Locator): Locator {
	return dialog.locator('[data-layout="array-item"]');
}

/** Add-member button in workspace members management area. */
export function getWorkspaceAddMemberButton(dialog: Locator): Locator {
	return dialog.getByRole('button', { name: /^\s*Add Member\s*$/i });
}

/** Role combobox candidates inside one member array row. */
export function getWorkspaceMemberRoleCombobox(memberRow: Locator): Locator {
	return memberRow.getByRole('combobox').last();
}

/** Name/member picker combobox inside one member array row. */
export function getWorkspaceMemberNameCombobox(memberRow: Locator): Locator {
	return memberRow.getByRole('combobox').first();
}

/** Role option entry when role dropdown is expanded. */
export function getWorkspaceMemberRoleOption(page: Page, role: 'admin' | 'edit' | 'view'): Locator {
	return page.getByRole('option', { name: new RegExp(`^\\s*${role}\\s*$`, 'i') });
}

/** Save/update action in members management/update dialog footer. */
export function getWorkspaceMembersSaveButton(dialog: Locator): Locator {
	return dialog
		.getByRole('button', { name: /^\s*(Save|Update|Submit|Confirm)\s*$/i })
		.filter({ hasNotText: /^\s*Delete\s*$/i });
}

/** Success toast emitted after adding workspace member. */
export function getWorkspaceMemberAddSuccessToasts(page: Page): Locator {
	return page.locator('[data-sonner-toast], [data-slot="toast"], [role="alert"]').filter({
		hasText: /(member).*(added|add).*(success|successful)?/i
	});
}

/** Member row in dialog matched by username/email text. */
export function getWorkspaceMemberArrayItemByText(dialog: Locator, identityPattern: RegExp): Locator {
	return getMemberArrayItems(dialog).filter({ hasText: identityPattern });
}

/** Detail page kind badge/text should contain Workspace. */
export function getWorkspaceDetailKindBadge(page: Page): Locator {
	return page
		.locator('[data-slot="badge"], [data-slot="item-description"]')
		.filter({ hasText: /^\s*Workspace\s*$/i });
}

/** Detail page resource title (resource name in viewer header). */
export function getWorkspaceDetailResourceTitle(page: Page, workspaceNamePattern: RegExp): Locator {
	return page.locator('[data-slot="item-title"], h1, h2, h3', { hasText: workspaceNamePattern });
}

/** Workspace viewer section title: Status card. */
export function getWorkspaceStatusSection(page: Page): Locator {
	return page.getByText(/^Status$/i);
}

/** Workspace viewer section title: Resource Quota card. */
export function getWorkspaceResourceQuotaSection(page: Page): Locator {
	return page.getByText(/^Resource Quota$/i);
}

/** Workspace viewer section title: Limit Range card. */
export function getWorkspaceLimitRangeSection(page: Page): Locator {
	return page.getByText(/^Limit Range$/i);
}

/** Workspace viewer section title: Network Isolation card. */
export function getWorkspaceNetworkIsolationSection(page: Page): Locator {
	return page.getByText(/^Network Isolation$/i);
}

/** Workspace viewer section title: Members card. */
export function getWorkspaceMembersSection(page: Page): Locator {
	return page.getByText(/^Members$/i);
}

/** Workspace viewer section title: Related Resources. */
export function getWorkspaceRelatedResourcesSection(page: Page): Locator {
	return page.getByText(/^Related Resources$/i);
}

