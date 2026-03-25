/**
 * Machine type for machines components - used when Machine API is unavailable.
 * Replace with API types when available.
 */

export interface BlockDevice {
	bootDisk?: boolean;
	storageMb?: bigint;
}

export interface GpuDevice {
	productName?: string;
	productId?: string;
	vendorName?: string;
	vendorId?: string;
	busName?: string;
	pciAddress?: string;
}

export interface Machine {
	id?: string;
	fqdn: string;
	powerState?: string;
	status?: string[];
	cpuCount?: bigint;
	memoryMb?: bigint;
	storageMb?: bigint;
	tags?: string[];
	blockDevices?: BlockDevice[];
	gpuDevices?: GpuDevice[];
	workloadAnnotations?: Record<string, string>;
	lastCommissioned?: Date | number;
	ipAddresses?: string[];
}
