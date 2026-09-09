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
