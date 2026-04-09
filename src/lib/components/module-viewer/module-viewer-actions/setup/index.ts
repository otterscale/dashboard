import type { JsonValue } from '@bufbuild/protobuf';
import type { Row } from '@tanstack/table-core';
import type { Component } from 'svelte';

import type { ModuleAttribute } from '../../table-layout';
import Default from './default.svelte';
import HarborDefault from './harbor-default.svelte';
import RookCephCluster from './rook-ceph-cluster.svelte';

interface SetUpProps {
	cluster: string;
	row: Row<Record<ModuleAttribute, JsonValue>>;
	onOpenChangeComplete: () => void;
}

type SetUpType = Component<SetUpProps>;

function getSetUp(chartName: string, sourceType?: string) {
	if (sourceType === 'harbor') {
		return HarborDefault;
	}

	if (chartName === 'otterscale-rook-ceph-cluster') {
		return RookCephCluster;
	} else {
		return Default;
	}
}

export type { SetUpType };
export { getSetUp };
