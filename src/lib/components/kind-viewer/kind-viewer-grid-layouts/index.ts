import type { JsonValue } from '@bufbuild/protobuf';
import type { Row } from '@tanstack/table-core';
import type { Component } from 'svelte';

import LLMInferenceServiceConfigGridLayout from './llminferenceserviceconfig.svelte';

type GridLayoutType =
	| Component<{
			row: Row<Record<string, JsonValue>>;
	  }>
	| undefined;

function getGridLayouts(kind: string): GridLayoutType {
	switch (kind) {
		case 'LLMInferenceServiceConfig':
			return LLMInferenceServiceConfigGridLayout as GridLayoutType;
		default:
			return undefined;
	}
}

export type { GridLayoutType };
export { getGridLayouts };
