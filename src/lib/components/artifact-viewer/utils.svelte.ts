function encodeURIComponentWithSlashEscape(value: string): string {
    return value.includes('/')
        ? encodeURIComponent(encodeURIComponent(value))
        : encodeURIComponent(value);
}

export { encodeURIComponentWithSlashEscape };