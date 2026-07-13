// Shared Dialog.Content sizing so every kind-viewer action opens with the same frame.
export const ACTION_DIALOG_CONTENT_CLASS = 'flex h-[85vh] max-w-[70vw] min-w-[55vw] flex-col gap-3';

// Same frame width, but height hugs the content — for landscape content like Terminal and VNC.
export const ACTION_DIALOG_CONTENT_FIT_CLASS =
	'flex h-fit max-h-[85vh] max-w-[70vw] min-w-[55vw] flex-col gap-3';
