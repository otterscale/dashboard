import type { JsonValue } from '@bufbuild/protobuf';
import type { Schema } from '@sjsf/form';
import type { Row } from '@tanstack/table-core';
import type { ValidateFunction } from 'ajv';
import type { Component } from 'svelte';

import ModelTemplateGridLayout from './modeltemplate.svelte';

type GridLayoutType =
	| Component<{
			row: Row<Record<string, JsonValue>>;
			cluster: string;
			namespace: string;
			group: string;
			version: string;
			kind: string;
			resource: string;
			schema: Schema;
			validate: ValidateFunction;
	  }>
	| undefined;

function getGridLayout(kind: string, namespace?: string): GridLayoutType {
	switch (kind) {
		case 'LLMInferenceServiceConfig':
			if (namespace === 'otterscale-system') {
				return ModelTemplateGridLayout as GridLayoutType;
			}
			return undefined;
		default:
			return undefined;
	}
}

export { getGridLayout };
export type { GridLayoutType };
