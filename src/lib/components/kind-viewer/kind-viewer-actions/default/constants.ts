// Shared Dialog.Content sizing so every kind-viewer action opens with the same frame.
export const ACTION_DIALOG_CONTENT_CLASS = 'flex h-[85vh] max-w-[70vw] min-w-[55vw] flex-col gap-3';

// Same frame width, but height hugs the content — for landscape content like Terminal and VNC.
export const ACTION_DIALOG_CONTENT_FIT_CLASS =
	'flex h-fit max-h-[85vh] max-w-[70vw] min-w-[55vw] flex-col gap-3';

// Edge-to-edge fullscreen frame — shared by every action dialog's maximize toggle.
// Keeps p-6 so the header toolbar's -mr-2 still lines up with the close button (top-4 right-4).
export const ACTION_DIALOG_CONTENT_FULLSCREEN_CLASS =
	'flex h-screen max-h-screen w-screen max-w-none flex-col gap-3 rounded-none p-6 ring-0 sm:max-w-none';
