import { expect, type Page } from '@playwright/test';
import * as loginLocators from '../locator/login_locator';
import { createLogger } from '../utils/logger';
import * as menuPageApi from './menu_page.api';

const logger = createLogger('login_api');

/** Overall budget for the app to finish the post-login "/login/onboard" setup and render the sidebar. */
const LOGIN_COMPLETE_TIMEOUT_MS = 120000;

/** Per-attempt window for the sidebar to appear before we re-navigate to recover. */
const LOGIN_POLL_WINDOW_MS = 12000;
/** Max recovery re-navigations to the app root while waiting for onboarding to finish. */
const LOGIN_MAX_RECOVERY_NAVIGATIONS = 6;

/**
 * Wait for login to complete by polling the page state instead of a single fixed-length wait.
 *
 * After Keycloak authenticates, the app shows a "/login/onboard" ("Setting up your environment,
 * please wait...") interstitial that redirects client-side once setup finishes. In a headed browser
 * an unfocused/occluded window throttles JS timers, so that redirect can stall for minutes. We poll
 * for the app sidebar and, if it stalls, bring the page to front and re-navigate to the app root to
 * retrigger routing (the existing SSO session skips Keycloak). A genuine auth error fails fast.
 */
async function waitForLoginToComplete(page: Page): Promise<void> {
	await page.bringToFront().catch(() => {});
	const appOrigin = new URL(page.url()).origin;
	const deadline = Date.now() + LOGIN_COMPLETE_TIMEOUT_MS;
	const sidebar = loginLocators.getSidebarMenuRoot(page);
	let recoveryNavigations = 0;

	while (true) {
		const loginError = loginLocators.getKcLoginError(page);
		if (await loginError.isVisible().catch(() => false)) {
			const errorText = (await loginError.innerText().catch(() => '')).trim();
			throw new Error(`[login.api] Keycloak reported a login error: ${errorText || 'unknown error'}`);
		}

		try {
			await sidebar.waitFor({ state: 'visible', timeout: LOGIN_POLL_WINDOW_MS });
			return;
		} catch {
			if (Date.now() >= deadline) {
				throw new Error(
					'[login.api] Sidebar did not appear after login; onboarding may be slow or stuck'
				);
			}
			if (recoveryNavigations < LOGIN_MAX_RECOVERY_NAVIGATIONS) {
				recoveryNavigations += 1;
				logger.warn('[login.api] Sidebar not ready; re-navigating to app root to recover', {
					url: page.url(),
					attempt: recoveryNavigations
				});
				await page.bringToFront().catch(() => {});
				await page.goto(`${appOrigin}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
			}
		}
	}
}

async function backToLogin(page: Page): Promise<void> {
	logger.normal('[login.api] Click "Back to Login"');
	const optionsContainer = loginLocators.getKcFormOptionsContainer(page);
	await expect(optionsContainer).toBeVisible({ timeout: 10000 });

	const containerLinks = optionsContainer.locator('a');
	const containerLinkCount = await containerLinks.count();
	logger.normal('[login.api] Found links in #kc-form-options', { count: containerLinkCount });

	const backToLoginLink = loginLocators.getKcBackToLoginLink(page);

	if (await backToLoginLink.isVisible()) {
		try {
			await backToLoginLink.click({ timeout: 100 });
		} catch (clickError) {
			logger.warn('[login.api] Direct click intercepted, fallback to navigate by href', {
				error: clickError instanceof Error ? clickError.message : String(clickError)
			});
			const href = await backToLoginLink.getAttribute('href');
			if (!href) {
				throw clickError;
			}
			await page.goto(new URL(href, page.url()).toString());
		}
	} else {
		logger.warn('[login.api] Back to Login text link not visible, fallback to first link in #kc-form-options');
		const fallbackLink = loginLocators.getKcFormOptionsFirstLink(page);
		const href = await fallbackLink.getAttribute('href');
		if (href) {
			await page.goto(new URL(href, page.url()).toString());
		} else {
			await fallbackLink.click();
		}
	}

	await loginLocators.getKcSignInButton(page).waitFor({ state: 'visible', timeout: 30000 });
	logger.normal('[login.api] Returned to login page');
}

async function hasDuplicateRegisterError(page: Page): Promise<boolean> {
	const duplicateError = loginLocators.getDuplicateRegisterError(page);
	const duplicated = await duplicateError.isVisible();
	if (duplicated) {
		logger.warn('[login.api] Duplicate registration error detected');
	}
	return duplicated;
}

export async function loginWithUsernameAndPassword(
	page: Page,
	username: string,
	password: string
): Promise<void> {
	logger.normal('[login.api] Login start', { username });

	await loginLocators.getKcUsernameInput(page).fill(username);
	await loginLocators.getKcLoginSubmitButton(page).click();

	await loginLocators.getKcPasswordInput(page).fill(password);
	await loginLocators.getKcLoginSubmitButton(page).click();

	await waitForLoginToComplete(page);
	logger.normal('[login.api] Login success');
}

export async function loginAndNavigateToMenu(
	page: Page,
	username: string,
	password: string,
	currentMenu: 'Platform' | 'Kubernetes',
	parentName: string,
	childName: string
): Promise<void> {
	await loginWithUsernameAndPassword(page, username, password);
	await menuPageApi.clickMenuPathByNames(page, currentMenu, parentName, childName);
}

export async function logout(page: Page): Promise<void> {
	logger.normal('[login.api] Logout start');

	for (let attempt = 0; attempt < 5; attempt += 1) {
		if (page.isClosed()) {
			return;
		}
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);
	}

	const logoutSidebarTrigger = loginLocators.getSidebarFooterUserMenuTrigger(page);
	await logoutSidebarTrigger.waitFor({ state: 'visible', timeout: 30000 });
	await logoutSidebarTrigger.click({ force: true });

	const logoutButton = loginLocators.getLogoutMenuItem(page);
	await logoutButton.waitFor({ state: 'visible', timeout: 30000 });
	await logoutButton.click({ force: true });

	await loginLocators.getKcSignInButton(page).waitFor({ state: 'visible', timeout: 30000 });
	logger.normal('[login.api] Logout success');
}

export async function register_user(
	page: Page,
	username: string,
	password: string,
	email: string,
	firstName: string,
	lastName: string
): Promise<void> {
	logger.normal('[login.api] Register start', { username, email });

	await loginLocators.getRegisterLink(page).click();
	await loginLocators.getKcUsernameInput(page).waitFor({ state: 'visible', timeout: 30000 });

	await loginLocators.getKcUsernameInput(page).fill(username);
	await loginLocators.getKcPasswordInput(page).fill(password);
	await loginLocators.getRegisterPasswordConfirmInput(page).fill(password);
	await loginLocators.getRegisterEmailInput(page).fill(email);
	await loginLocators.getRegisterFirstNameInput(page).fill(firstName);
	await loginLocators.getRegisterLastNameInput(page).fill(lastName);

	await loginLocators.getRegisterSubmitButton(page).click();

	logger.normal('[login.api] Wait for 5 seconds to detect duplicate account/email');
	await page.waitForTimeout(100);
	if (await hasDuplicateRegisterError(page)) {
		logger.warn('[login.api] Register skipped due to duplicated account/email', { username, email });
		await backToLogin(page);
		return;
	}

	logger.normal('[login.api] Register submit completed', { username, email });
	logger.normal('[login.api] Register success path detected, logout for next registration');
	await logout(page);
}
