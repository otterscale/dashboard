function getRoles(isRestricted: boolean) {
	if (isRestricted) {
		return [{ label: 'admin', value: 'admin' }];
	}
	return [
		{ label: 'admin', value: 'admin' },
		{ label: 'edit', value: 'edit' },
		{ label: 'view', value: 'view' }
	];
}
export { getRoles };
