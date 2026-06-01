import type { JsonObject, JsonValue } from '@bufbuild/protobuf';
import type { Schema } from '@sjsf/form';
import type { Row } from '@tanstack/table-core';
import { type ValidateFunction } from 'ajv';
import type { Component, Snippet } from 'svelte';

import ApplicationActions from './applications/actions.svelte';
import ApplicationCreate from './applications/create.svelte';
import ObjectBucketClaimActions from './ceph-object-bucket-claim/actions.svelte';
import ObjectBucketClaimCreate from './ceph-object-bucket-claim/create.svelte';
import ClusterRoleBindingActions from './cluster-role-binding/actions.svelte';
import ClusterRoleBindingCreate from './cluster-role-binding/create.svelte';
import CronJobActions from './cronjob/actions.svelte';
import DaemonSetActions from './daemonset/actions.svelte';
import DataVolumeActions from './data-volume/actions.svelte';
import DataVolumeCreate from './data-volume/create.svelte';
import DefaultActions from './default/actions.svelte';
import DefaultCreate from './default/create.svelte';
import DeploymentActions from './deployment/actions.svelte';
import HelmReleaseActions from './helm-release/actions.svelte';
import HelmRepositoryActions from './helm-repository/actions.svelte';
import HelmRepositoryCreate from './helm-repository/create.svelte';
import InstanceTypeActions from './instance-type/actions.svelte';
import InstanceTypeCreate from './instance-type/create.svelte';
import JobActions from './job/actions.svelte';
import LLMInferenceServiceActions from './llm-inference-service/actions.svelte';
import LLMInferenceServiceConfigActions from './llm-inference-service-config/actions.svelte';
import ModelTemplateActions from './modeltemplate/actions.svelte';
import NodeActions from './node/actions.svelte';
import PodActions from './pod/actions.svelte';
import ResourceQuotaActions from './resource-quota/actions.svelte';
import ScheduleActions from './schedule/actions.svelte';
import ScheduleCreate from './schedule/create.svelte';
import StatefulSetActions from './statefulset/actions.svelte';
import TaskActions from './task/actions.svelte';
import TaskCreate from './task/create.svelte';
import DisabledCreate from './utils/disabled-create.svelte';
import VirtualMachineActions from './virtual-machine/actions.svelte';
import VirtualMachineCreate from './virtual-machine/create.svelte';
import WorkspaceActions from './workspace/actions.svelte';
import WorkspaceCreate from './workspace/create.svelte';

type RoleType = 'admin' | 'edit' | 'view';

type CreateType = Component<{
	role?: string;
	cluster?: string;
	namespace?: string;
	group?: string;
	version?: string;
	kind?: string;
	resource?: string;
	schema?: Schema;
	validate?: ValidateFunction;
	trigger?: Snippet<
		[
			{
				get open(): boolean;
				set open(value: boolean);
			}
		]
	>;
}> | null;
type ActionsType = Component<{
	role?: string;
	row?: Row<Record<string, JsonValue>>;
	schema?: Schema;
	validate?: ValidateFunction;
	object?: JsonObject;
	cluster?: string;
	namespace?: string;
	group?: string;
	version?: string;
	kind?: string;
	resource?: string;
	onsuccess?: () => void;
}> | null;

function getCreate(kind: string, namespace?: string): CreateType {
	switch (kind) {
		case 'Application':
			return ApplicationCreate as CreateType;
		case 'ClusterRoleBinding':
			return ClusterRoleBindingCreate as CreateType;
		case 'DataVolume':
			return DataVolumeCreate as CreateType;
		case 'HelmRepository':
			return HelmRepositoryCreate as CreateType;
		case 'Node':
			return DisabledCreate as CreateType;
		case 'ObjectBucketClaim':
			return ObjectBucketClaimCreate as CreateType;
		case 'Schedule':
			return ScheduleCreate as CreateType;
		case 'Task':
			return TaskCreate as CreateType;
		case 'VirtualMachine':
			return VirtualMachineCreate as CreateType;
		case 'VirtualMachineInstancetype':
			return InstanceTypeCreate as CreateType;
		case 'Workspace':
			return WorkspaceCreate as CreateType;
		case 'LLMInferenceServiceConfig':
			if (namespace === 'otterscale-system') {
				return DisabledCreate as CreateType;
			}
			return DefaultCreate as CreateType;
		default:
			return DefaultCreate as CreateType;
	}
}

function getActions(kind: string, namespace?: string): ActionsType {
	console.log('get from ', kind, namespace);
	switch (kind) {
		case 'Application':
			return ApplicationActions as ActionsType;
		case 'ClusterRoleBinding':
			return ClusterRoleBindingActions as ActionsType;
		case 'CronJob':
			return CronJobActions as ActionsType;
		case 'DaemonSet':
			return DaemonSetActions as ActionsType;
		case 'DataVolume':
			return DataVolumeActions as ActionsType;
		case 'Deployment':
			return DeploymentActions as ActionsType;
		case 'HelmRelease':
			return HelmReleaseActions as CreateType;
		case 'HelmRepository':
			return HelmRepositoryActions as ActionsType;
		case 'Job':
			return JobActions as ActionsType;
		case 'LLMInferenceService':
			return LLMInferenceServiceActions as ActionsType;
		case 'LLMInferenceServiceConfig':
			if (namespace === 'otterscale-system') {
				return ModelTemplateActions as ActionsType;
			}
			return LLMInferenceServiceConfigActions as ActionsType;
		case 'Node':
			return NodeActions as ActionsType;
		case 'ObjectBucketClaim':
			return ObjectBucketClaimActions as ActionsType;
		case 'Pod':
			return PodActions as ActionsType;
		case 'ResourceQuota':
			return ResourceQuotaActions as ActionsType;
		case 'Schedule':
			return ScheduleActions as ActionsType;
		case 'StatefulSet':
			return StatefulSetActions as ActionsType;
		case 'Task':
			return TaskActions as ActionsType;
		case 'VirtualMachine':
			return VirtualMachineActions as ActionsType;
		case 'VirtualMachineInstancetype':
			return InstanceTypeActions as ActionsType;
		case 'Workspace':
			return WorkspaceActions as ActionsType;
		default:
			return DefaultActions as ActionsType;
	}
}

export { getActions, getCreate };
export type { ActionsType, CreateType, RoleType };
