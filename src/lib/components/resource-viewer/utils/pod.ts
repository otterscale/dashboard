import type { CoreV1Pod } from '@otterscale/types';

export function getContainerReadies(pod: CoreV1Pod): number {
	const containerStatuses = pod?.status?.containerStatuses ?? [];
	return containerStatuses.filter((containerStatus) => containerStatus.ready).length;
}

export function getContainerRestarts(pod: CoreV1Pod): number {
	return (pod?.status?.containerStatuses ?? []).reduce(
		(a, containerStatus) => a + (containerStatus.restartCount ?? 0),
		0
	);
}

export function getPodStatus(pod: CoreV1Pod): string {
	const waitingReason = pod?.status?.containerStatuses?.find(
		(containerStatus) => containerStatus.state?.waiting
	)?.state?.waiting?.reason;

	const terminatedReason = pod?.status?.containerStatuses?.find(
		(containerStatus) => containerStatus.state?.terminated
	)?.state?.terminated?.reason;

	return waitingReason ?? terminatedReason ?? pod?.status?.phase ?? 'Unknown';
}
