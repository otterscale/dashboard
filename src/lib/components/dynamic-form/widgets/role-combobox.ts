function getRoles(isRestricted: boolean) {
	if (isRestricted) {
		return [{ label: 'admin', value: 'admin' }];
	}
	return [{ label: 'admin', value: 'admin' }];
}

export { getRoles };
