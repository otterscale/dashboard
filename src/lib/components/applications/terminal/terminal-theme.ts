import type { ITheme } from '@xterm/xterm';

/** VS Code Dark+ chrome; the 16 ANSI colours are left at xterm's own (dark-friendly) defaults. */
export const TERMINAL_THEME: ITheme = {
	background: '#1e1e1e',
	foreground: '#cccccc',
	cursor: '#ffffff',
	cursorAccent: '#1e1e1e',
	selectionBackground: '#264f78'
};

/** Background colour of the surrounding chrome, kept in sync with the theme. */
export const TERMINAL_BACKGROUND = TERMINAL_THEME.background!;
