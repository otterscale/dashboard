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

export function findRancherProjectID(
	links: { cluster: string; rancherProjectId: string }[],
	cluster: string
) {
	return links.find((link) => link.cluster === cluster)?.rancherProjectId;
}

export function applyRancherProjectID<T extends { spec: Record<string, unknown> }>(
	resource: T,
	rancherProjectID: string
) {
	if (rancherProjectID) {
		resource.spec.rancherProjectID = rancherProjectID;
	} else {
		delete resource.spec.rancherProjectID;
	}
	return resource;
}
