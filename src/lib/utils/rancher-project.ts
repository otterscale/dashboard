export interface RancherProjectOption {
	id: string;
	displayName: string;
}

export function createRancherProjectLoader<T extends RancherProjectOption>(
	load: () => Promise<T[]>
) {
	let pending: Promise<T[]> | undefined;

	return () => {
		pending ??= load().finally(() => {
			pending = undefined;
		});
		return pending;
	};
}

export function rancherProjectSecondaryText(project: RancherProjectOption) {
	const resourceName = project.id.slice(project.id.indexOf(':') + 1);
	const displayName = project.displayName.trim();
	return displayName && displayName !== resourceName ? displayName : '';
}
