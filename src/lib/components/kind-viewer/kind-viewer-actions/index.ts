import type { Component } from 'svelte';

import ApplicationActions from './application/actions.svelte';
import ApplicationCreate from './application/create.svelte';
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
import ModelArtifactActions from './model-artifact/actions.svelte';
import ModelArtifactCreate from './model-artifact/create.svelte';
import ModelServiceActions from './model-service/actions.svelte';
import ModelServiceCreate from './model-service/create.svelte';
import NodeActions from './node/actions.svelte';
import NodeCreate from './node/create.svelte';
import PodActions from './pod/actions.svelte';
import ResourceQuotaActions from './resource-quota/actions.svelte';
import StatefulSetActions from './statefulset/actions.svelte';
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
	schema?: any;
}> | null;
type ActionsType = Component<{
	role?: string;
	row?: any;
	schema?: any;
	object?: any;
	cluster?: string;
	namespace?: string;
	group?: string;
	version?: string;
	kind?: string;
	resource?: string;
	onsuccess?: () => void;
}> | null;

function getCreate(kind: string): CreateType {
	switch (kind) {
		case 'Application':
			return ApplicationCreate as CreateType;
		case 'HelmRepository':
			return HelmRepositoryCreate as CreateType;
		case 'ClusterRoleBinding':
			return ClusterRoleBindingCreate as CreateType;
		case 'ModelService':
			return ModelServiceCreate as CreateType;
		case 'ModelArtifact':
			return ModelArtifactCreate as CreateType;
		case 'Workspace':
			return WorkspaceCreate as CreateType;
		case 'VirtualMachine':
			return VirtualMachineCreate as CreateType;
		case 'DataVolume':
			return DataVolumeCreate as CreateType;
		case 'VirtualMachineInstancetype':
			return InstanceTypeCreate as CreateType;
		case 'ObjectBucketClaim':
			return ObjectBucketClaimCreate as CreateType;
		case 'Node':
			return NodeCreate as CreateType;
		default:
			return DefaultCreate as CreateType;
	}
}

function getActions(kind: string): ActionsType {
	switch (kind) {
		case 'Application':
			return ApplicationActions as ActionsType;
		case 'ClusterRoleBinding':
			return ClusterRoleBindingActions as ActionsType;
		case 'Pod':
			return PodActions as ActionsType;
		case 'Deployment':
			return DeploymentActions as ActionsType;
		case 'StatefulSet':
			return StatefulSetActions as ActionsType;
		case 'DaemonSet':
			return DaemonSetActions as ActionsType;
		case 'Job':
			return JobActions as ActionsType;
		case 'CronJob':
			return CronJobActions as ActionsType;
		case 'HelmRelease':
			return HelmReleaseActions as CreateType;
		case 'HelmRepository':
			return HelmRepositoryActions as ActionsType;
		case 'ModelService':
			return ModelServiceActions as ActionsType;
		case 'Node':
			return NodeActions as ActionsType;
		case 'ModelArtifact':
			return ModelArtifactActions as ActionsType;
		case 'ResourceQuota':
			return ResourceQuotaActions as ActionsType;
		case 'Workspace':
			return WorkspaceActions as ActionsType;
		case 'VirtualMachine':
			return VirtualMachineActions as ActionsType;
		case 'DataVolume':
			return DataVolumeActions as ActionsType;
		case 'VirtualMachineInstancetype':
			return InstanceTypeActions as ActionsType;
		case 'ObjectBucketClaim':
			return ObjectBucketClaimActions as ActionsType;
		default:
			return DefaultActions as ActionsType;
	}
}

export { getActions, getCreate };
export type { ActionsType, CreateType, RoleType };
