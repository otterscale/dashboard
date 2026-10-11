import { type Locator, type Page } from '@playwright/test';

/**
 * Keycloak login/register and sidebar logout locators.
 * Pair with `api/login.api.ts` for Session domain POM actions.
 */

export function getKcFormOptionsContainer(page: Page): Locator {
	return page.locator('#kc-form-options').first();
}

export function getKcBackToLoginLink(page: Page): Locator {
	return getKcFormOptionsContainer(page)
		.locator('a')
		.filter({ hasText: /Back to Login/i })
		.first();
}

export function getKcFormOptionsFirstLink(page: Page): Locator {
	return getKcFormOptionsContainer(page).locator('a').first();
}

export function getKcSignInButton(page: Page): Locator {
	return page
		.getByRole('button', { name: /^\s*Sign In\s*$/i })
		.and(page.locator('button[name="login"]#kc-login'))
		.first();
}

export function getKcUsernameInput(page: Page): Locator {
	return page.locator('input[name="username"], #username').first();
}

export function getKcPasswordInput(page: Page): Locator {
	return page.locator('input[name="password"], #password').first();
}

export function getKcLoginSubmitButton(page: Page): Locator {
	return page.locator('button[name="login"], #kc-login').first();
}

/**
 * Keycloak authentication error surface (e.g. "Invalid username or password").
 * Matches the common Keycloak error containers so a genuine auth failure can be detected
 * during login polling instead of waiting out the full timeout.
 */
export function getKcLoginError(page: Page): Locator {
	return page
		.locator('#input-error, #kc-error-message, .alert-error, [class*="alert-error"], .kc-feedback-text')
		.first();
}

export function getSidebarMenuRoot(page: Page): Locator {
	return page.locator('ul[data-slot="sidebar-menu"][data-sidebar="menu"]').first();
}

export function getSidebarFooterUserMenuTrigger(page: Page): Locator {
	return page
		.locator('[data-slot="sidebar-footer"] [data-slot="dropdown-menu-trigger"][data-sidebar="menu-button"]')
		.first();
}

export function getLogoutMenuItem(page: Page): Locator {
	return page
		.getByRole('menuitem', { name: /^\s*Log\s*Out\s*$/i })
		.or(
			page.locator('[data-slot="dropdown-menu-item"]').filter({ hasText: /^\s*Log\s*Out\s*$/i })
		)
		.first();
}

export function getRegisterLink(page: Page): Locator {
	return page
		.locator('a[href*="/login-actions/registration"]')
		.filter({ hasText: /^\s*Register\s*$/i })
		.or(page.getByRole('link', { name: /^\s*Register\s*$/i }))
		.or(page.getByRole('button', { name: /^\s*Register\s*$/i }))
		.first();
}

export function getRegisterPasswordConfirmInput(page: Page): Locator {
	return page.locator('#password-confirm, input[name="password-confirm"]').first();
}

export function getRegisterEmailInput(page: Page): Locator {
	return page.locator('#email, input[name="email"]').first();
}

export function getRegisterFirstNameInput(page: Page): Locator {
	return page.locator('#firstName, input[name="firstName"]').first();
}

export function getRegisterLastNameInput(page: Page): Locator {
	return page.locator('#lastName, input[name="lastName"]').first();
}

export function getRegisterSubmitButton(page: Page): Locator {
	return page
		.locator('button[data-slot="button"][type="submit"]')
		.filter({ hasText: /^\s*Register\s*$/i })
		.or(page.locator('button[type="submit"]').filter({ hasText: /^\s*Register\s*$/i }))
		.or(page.getByRole('button', { name: /^\s*Register\s*$/i }))
		.or(page.locator('input[type="submit"][value="Register"], button[name="register"], #kc-register'))
		.first();
}

export function getDuplicateRegisterError(page: Page): Locator {
	return page.locator('text=/\\b(?:Username|Email)\\s+already\\s+exists\\b\\.?/i').first();
}
