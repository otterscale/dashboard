<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { GpuIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1ConfigMap, CoreV1Node } from '@otterscale/types';
	import { dump, load } from 'js-yaml';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';

	let {
		cluster,
		group,
		version,
		kind,
		resource,
		object
	}: {
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		object: CoreV1Node;
	} = $props();

	// svelte-ignore state_referenced_locally
	void group;
	// svelte-ignore state_referenced_locally
	void version;
	// svelte-ignore state_referenced_locally
	void kind;
	// svelte-ignore state_referenced_locally
	void resource;

	type MigNodeConfig = {
		name: string;
		operatingmode: string;
		migstrategy: string;
		filterdevices: {
			uuid: string[];
			index: number[];
		};
	};

	type MigConfig = Record<string, unknown> & {
		nodeconfig?: unknown;
	};

	type KnownMigGeometryUnit = {
		name: string;
		core: number;
		memory: number;
		count: number;
	};

	type MigProfile = '1g' | '2g' | '3g' | '7g';

	type KnownMigGeometry = {
		models?: unknown;
		allowedGeometries?: unknown;
	};

	type SchedulerDeviceConfig = Record<string, unknown> & {
		nvidia?: Record<string, unknown> & {
			knownMigGeometries?: unknown;
		};
	};

	type DaemonSetStatus = {
		desiredNumberScheduled?: number;
		numberAvailable?: number;
		updatedNumberScheduled?: number;
		observedGeneration?: number;
	};

	type DaemonSetObject = {
		metadata?: {
			generation?: number;
		};
		status?: DaemonSetStatus;
	};

	type DeploymentStatus = {
		replicas?: number;
		readyReplicas?: number;
		availableReplicas?: number;
		updatedReplicas?: number;
		observedGeneration?: number;
	};

	type DeploymentObject = {
		metadata?: {
			generation?: number;
		};
		spec?: {
			replicas?: number;
		};
		status?: DeploymentStatus;
	};

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const configMapName = 'otterscale-hami-device-plugin';
	const configMapNamespace = 'kube-system';
	const configJsonKey = 'config.json';
	const schedulerDeviceConfigMapName = 'otterscale-hami-scheduler-device';
	const schedulerDeviceConfigYamlKey = 'device-config.yaml';
	const hamiDevicePluginDaemonSetName = 'otterscale-hami-device-plugin';
	const hamiSchedulerDeploymentName = 'otterscale-hami-scheduler';
	const gpuOperatorDeploymentName = 'gpu-operator';
	const gpuOperatorNamespace = 'gpu-operator';
	const migProfileCore: Record<MigProfile, number> = {
		'1g': 14,
		'2g': 28,
		'3g': 42,
		'7g': 100
	};
	const migProfileMemoryFactor: Record<MigProfile, number> = {
		'1g': 1,
		'2g': 2,
		'3g': 4,
		'7g': 8
	};

	let isMigEnabled = $state(false);
	let isLoadingState = $state(false);
	let isSubmitting = $state(false);
	let isConfirmDialogOpen = $state(false);

	const nodeName = $derived(object?.metadata?.name ?? '');
	const isMigCapable = $derived(object?.metadata?.labels?.['nvidia.com/mig.capable'] === 'true');

	// Load the MIG state lazily when the submenu opens, so rendering a node list
	// does not issue one ConfigMap GET per row up front.
	function handleSubOpenChange(open: boolean) {
		if (!open || page.data.isRestricted || !cluster || !nodeName) return;

		void refreshMigState();
	}

	function parseMigConfig(configText?: string): MigConfig {
		if (!configText) {
			return { nodeconfig: [] };
		}

		const parsed = JSON.parse(configText) as MigConfig;
		if (!parsed || typeof parsed !== 'object') {
			throw new Error('Invalid config.json format');
		}

		return parsed;
	}

	function parseSchedulerDeviceConfig(configText?: string): SchedulerDeviceConfig {
		if (!configText) {
			return {
				nvidia: {
					knownMigGeometries: []
				}
			};
		}

		const parsed = load(configText) as SchedulerDeviceConfig;
		if (!parsed || typeof parsed !== 'object') {
			throw new Error('Invalid device-config.yaml format');
		}

		return parsed;
	}

	function getNodeConfigs(config: MigConfig): MigNodeConfig[] {
		if (!Array.isArray(config.nodeconfig)) {
			return [];
		}

		return config.nodeconfig.filter(
			(item): item is MigNodeConfig =>
				typeof item === 'object' &&
				item !== null &&
				typeof item.name === 'string' &&
				typeof item.operatingmode === 'string'
		);
	}

	function buildNextConfig(
		config: MigConfig,
		enabled: boolean,
		currentNodeName: string
	): MigConfig {
		const existingNodeConfigs = getNodeConfigs(config).filter(
			(nodeConfig) => nodeConfig.name !== currentNodeName
		);

		if (!enabled) {
			return {
				...config,
				nodeconfig: existingNodeConfigs
			};
		}

		return {
			...config,
			nodeconfig: [
				...existingNodeConfigs,
				{
					name: currentNodeName,
					operatingmode: 'mig',
					migstrategy: 'none',
					filterdevices: {
						uuid: [],
						index: []
					}
				}
			]
		};
	}

	function hasMigEnabled(config: MigConfig, currentNodeName: string): boolean {
		return getNodeConfigs(config).some(
			(nodeConfig) =>
				nodeConfig.name === currentNodeName && nodeConfig.operatingmode.toLowerCase() === 'mig'
		);
	}

	function getNodeGpuModelName(node: CoreV1Node): string {
		const labels = node?.metadata?.labels ?? {};
		const gpuModel =
			labels['nvidia.com/gpu.product'] ??
			labels['nvidia.com/gpu.product.0'] ??
			labels['gpu.product'];

		if (!gpuModel || !gpuModel.trim()) {
			throw new Error('Unable to determine GPU model from node labels');
		}

		return gpuModel.trim().replaceAll('-', ' ');
	}

	function getNodeGpuMemoryMb(node: CoreV1Node): number {
		const labels = node?.metadata?.labels ?? {};
		const rawMemory = labels['nvidia.com/gpu.memory'];

		if (rawMemory === undefined || rawMemory === null) {
			throw new Error('Unable to determine GPU memory from node label nvidia.com/gpu.memory');
		}

		const memoryMb = Number(String(rawMemory).replace(/[^\d.]/g, ''));
		if (!Number.isFinite(memoryMb) || memoryMb <= 0) {
			throw new Error('Invalid nvidia.com/gpu.memory label value');
		}

		return Math.round(memoryMb);
	}

	function getMigProfileName(profile: MigProfile, memoryMb: number): string {
		const memoryGb = Math.round(memoryMb / 1024);
		return `${profile}.${memoryGb}gb`;
	}

	function buildKnownMigGeometriesTemplate(totalMemoryMb: number): KnownMigGeometryUnit[][] {
		const oneGMemoryMb = Math.round(totalMemoryMb / 8);

		const buildUnit = (profile: MigProfile, count: number): KnownMigGeometryUnit => {
			const memory = oneGMemoryMb * migProfileMemoryFactor[profile];
			return {
				name: getMigProfileName(profile, memory),
				core: migProfileCore[profile],
				memory,
				count
			};
		};

		return [
			[buildUnit('1g', 7)],
			[buildUnit('1g', 1), buildUnit('2g', 3)],
			[buildUnit('3g', 2)],
			[buildUnit('7g', 1)]
		];
	}

	function getKnownMigGeometries(config: SchedulerDeviceConfig): KnownMigGeometry[] {
		const knownMigGeometries = config.nvidia?.knownMigGeometries;
		if (!Array.isArray(knownMigGeometries)) {
			return [];
		}

		return knownMigGeometries.filter(
			(item): item is KnownMigGeometry => typeof item === 'object' && item !== null
		);
	}

	function getGeometryModels(entry: KnownMigGeometry): string[] {
		return Array.isArray(entry.models)
			? entry.models.filter((model): model is string => typeof model === 'string')
			: [];
	}

	// Extract the base GPU model token (e.g. "H200", "A100", "H20") from a model
	// string, ignoring the vendor prefix and any variant suffix. Used to match a
	// node's GPU against the correct built-in geometry family.
	function extractBaseModel(name: string): string {
		const withoutVendor = name.replace(/^NVIDIA[\s-]*/i, '');
		const token = withoutVendor.match(/[A-Za-z]+\d+/);
		return (token ? token[0] : withoutVendor.trim()).toUpperCase();
	}

	// The whole-GPU memory of a geometry entry equals the largest single-instance
	// (7g) memory across its allowed geometries. Used to disambiguate families that
	// share a base token but differ in memory (e.g. A100-40GB vs A100-80GB).
	function getGeometryTotalMemory(entry: KnownMigGeometry): number {
		const allowedGeometries = entry.allowedGeometries;
		if (!Array.isArray(allowedGeometries)) return 0;

		let maxMemory = 0;
		for (const option of allowedGeometries) {
			if (!Array.isArray(option)) continue;
			for (const unit of option) {
				const memory = (unit as KnownMigGeometryUnit | null)?.memory;
				if (typeof memory === 'number') {
					maxMemory = Math.max(maxMemory, memory);
				}
			}
		}
		return maxMemory;
	}

	// Find the built-in geometry entry that already describes this GPU: same base
	// model token, and (among same-token candidates) the closest total memory.
	function findFamilyGeometryEntry(
		entries: KnownMigGeometry[],
		gpuBaseModel: string,
		gpuMemoryMb: number
	): KnownMigGeometry | undefined {
		const candidates = entries.filter((entry) =>
			getGeometryModels(entry).some((model) => extractBaseModel(model) === gpuBaseModel)
		);
		if (candidates.length === 0) return undefined;

		return candidates.reduce((best, entry) =>
			Math.abs(getGeometryTotalMemory(entry) - gpuMemoryMb) <
			Math.abs(getGeometryTotalMemory(best) - gpuMemoryMb)
				? entry
				: best
		);
	}

	function buildNextSchedulerDeviceConfig(
		config: SchedulerDeviceConfig,
		gpuModelName: string,
		gpuMemoryMb: number
	): SchedulerDeviceConfig {
		const nvidiaConfig = config.nvidia ?? {};
		const entries = getKnownMigGeometries(config);
		const familyEntry = findFamilyGeometryEntry(
			entries,
			extractBaseModel(gpuModelName),
			gpuMemoryMb
		);

		let nextKnownMigGeometries: KnownMigGeometry[];
		if (familyEntry) {
			// The GPU already has an authoritative built-in geometry, so never
			// overwrite it with computed values. Instead register this node's exact
			// GPU name on that family: HAMI matches by substring, and the generic
			// name the GPU operator reports (e.g. "NVIDIA H200") is not a substring of
			// the built-in variant names ("H200 NVL" / "H200-SXM5").
			nextKnownMigGeometries = entries
				// Drop other entries whose model name is a substring of this GPU name,
				// otherwise HAMI mis-matches them (e.g. "H20" is a substring of
				// "NVIDIA H200") and slices the GPU with the wrong geometry.
				.filter(
					(entry) =>
						entry === familyEntry ||
						!getGeometryModels(entry).some((model) => gpuModelName.includes(model))
				)
				.map((entry) => {
					if (entry !== familyEntry) return entry;
					const models = getGeometryModels(entry);
					return models.includes(gpuModelName)
						? entry
						: { ...entry, models: [...models, gpuModelName] };
				});
		} else {
			// Unknown GPU: HAMI ships no built-in geometry, so fall back to a computed
			// one (best-effort) after removing any stale entry with the same name.
			const existing = entries.filter(
				(entry) => !getGeometryModels(entry).some((model) => model === gpuModelName)
			);
			nextKnownMigGeometries = [
				...existing,
				{
					models: [gpuModelName],
					allowedGeometries: buildKnownMigGeometriesTemplate(gpuMemoryMb)
				}
			];
		}

		return {
			...config,
			nvidia: {
				...nvidiaConfig,
				knownMigGeometries: nextKnownMigGeometries
			}
		};
	}

	function getErrorMessage(error: unknown): string {
		if (typeof error === 'object' && error !== null && 'message' in error) {
			return String((error as { message?: unknown }).message ?? error);
		}

		return String(error);
	}

	function sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function getMigConfigMap(): Promise<CoreV1ConfigMap> {
		const response = await resourceClient.get({
			cluster,
			namespace: configMapNamespace,
			name: configMapName,
			group: '',
			version: 'v1',
			resource: 'configmaps'
		});

		return response.object as CoreV1ConfigMap;
	}

	async function applyMigConfigMap(data: Record<string, string>) {
		const manifest = JSON.stringify({
			apiVersion: 'v1',
			kind: 'ConfigMap',
			metadata: {
				name: configMapName,
				namespace: configMapNamespace
			},
			data
		});

		await resourceClient.apply({
			cluster,
			namespace: configMapNamespace,
			name: configMapName,
			group: '',
			version: 'v1',
			resource: 'configmaps',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});
	}

	async function getSchedulerDeviceConfigMap(): Promise<CoreV1ConfigMap> {
		const response = await resourceClient.get({
			cluster,
			namespace: configMapNamespace,
			name: schedulerDeviceConfigMapName,
			group: '',
			version: 'v1',
			resource: 'configmaps'
		});

		return response.object as CoreV1ConfigMap;
	}

	async function applySchedulerDeviceConfigMap(data: Record<string, string>) {
		const manifest = JSON.stringify({
			apiVersion: 'v1',
			kind: 'ConfigMap',
			metadata: {
				name: schedulerDeviceConfigMapName,
				namespace: configMapNamespace
			},
			data
		});

		await resourceClient.apply({
			cluster,
			namespace: configMapNamespace,
			name: schedulerDeviceConfigMapName,
			group: '',
			version: 'v1',
			resource: 'configmaps',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});
	}

	// Updates the scheduler device-config for the node's GPU model and returns a
	// snapshot of the ConfigMap data as it was BEFORE the update, so a failed
	// toggle can restore it.
	async function updateSchedulerDeviceConfigMap(
		currentNode: CoreV1Node
	): Promise<Record<string, string>> {
		const schedulerDeviceConfigMap = await getSchedulerDeviceConfigMap();
		const previousData = { ...(schedulerDeviceConfigMap.data ?? {}) };
		const schedulerDeviceConfig = parseSchedulerDeviceConfig(
			previousData[schedulerDeviceConfigYamlKey]
		);
		const gpuModelName = getNodeGpuModelName(currentNode);
		const gpuMemoryMb = getNodeGpuMemoryMb(currentNode);
		const nextSchedulerDeviceConfig = buildNextSchedulerDeviceConfig(
			schedulerDeviceConfig,
			gpuModelName,
			gpuMemoryMb
		);

		await applySchedulerDeviceConfigMap({
			...previousData,
			[schedulerDeviceConfigYamlKey]: dump(nextSchedulerDeviceConfig, {
				lineWidth: -1,
				noRefs: true
			})
		});

		return previousData;
	}

	async function getDaemonSet(): Promise<DaemonSetObject> {
		const response = await resourceClient.get({
			cluster,
			namespace: configMapNamespace,
			name: hamiDevicePluginDaemonSetName,
			group: 'apps',
			version: 'v1',
			resource: 'daemonsets'
		});

		return (response.object as DaemonSetObject) ?? {};
	}

	function isDaemonSetReady(daemonSet: DaemonSetObject): boolean {
		const generation = daemonSet.metadata?.generation ?? 0;
		const status = daemonSet.status ?? {};
		const observedGeneration = status.observedGeneration ?? 0;
		const desired = status.desiredNumberScheduled ?? 0;
		const available = status.numberAvailable ?? 0;
		const updated = status.updatedNumberScheduled ?? 0;

		// The controller must have observed the current spec (i.e. the rollout
		// restart) before its status counters mean anything. Without this check the
		// still-running old pods report ready and the rollout looks "done" before it
		// even started. Then require every node to run the updated, available pod.
		return (
			observedGeneration >= generation && desired > 0 && updated >= desired && available >= desired
		);
	}

	async function waitForDaemonSetReady(maxRetry = 30, intervalMs = 2000) {
		for (let i = 0; i < maxRetry; i += 1) {
			const daemonSet = await getDaemonSet();
			if (isDaemonSetReady(daemonSet)) return;
			await sleep(intervalMs);
		}

		throw new Error(`${hamiDevicePluginDaemonSetName} is not ready after restart`);
	}

	async function restartDaemonSet() {
		const manifest = JSON.stringify({
			apiVersion: 'apps/v1',
			kind: 'DaemonSet',
			metadata: {
				name: hamiDevicePluginDaemonSetName,
				namespace: configMapNamespace
			},
			spec: {
				template: {
					metadata: {
						annotations: {
							'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
						}
					}
				}
			}
		});

		await resourceClient.apply({
			cluster,
			namespace: configMapNamespace,
			name: hamiDevicePluginDaemonSetName,
			group: 'apps',
			version: 'v1',
			resource: 'daemonsets',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});
	}

	// Roll out a restart of the gpu-operator deployment so it re-detects the
	// node's MIG capabilities after the scheduler has been restarted.
	async function restartGpuOperatorDeployment() {
		const manifest = JSON.stringify({
			apiVersion: 'apps/v1',
			kind: 'Deployment',
			metadata: {
				name: gpuOperatorDeploymentName,
				namespace: gpuOperatorNamespace
			},
			spec: {
				template: {
					metadata: {
						annotations: {
							'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
						}
					}
				}
			}
		});

		await resourceClient.apply({
			cluster,
			namespace: gpuOperatorNamespace,
			name: gpuOperatorDeploymentName,
			group: 'apps',
			version: 'v1',
			resource: 'deployments',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});
	}

	async function getSchedulerDeployment(): Promise<DeploymentObject> {
		const response = await resourceClient.get({
			cluster,
			namespace: configMapNamespace,
			name: hamiSchedulerDeploymentName,
			group: 'apps',
			version: 'v1',
			resource: 'deployments'
		});

		return response.object as DeploymentObject;
	}

	async function scaleSchedulerDeployment(replicas: number) {
		const manifest = JSON.stringify({
			apiVersion: 'apps/v1',
			kind: 'Deployment',
			metadata: {
				name: hamiSchedulerDeploymentName,
				namespace: configMapNamespace
			},
			spec: {
				replicas
			}
		});

		await resourceClient.apply({
			cluster,
			namespace: configMapNamespace,
			name: hamiSchedulerDeploymentName,
			group: 'apps',
			version: 'v1',
			resource: 'deployments',
			manifest: new TextEncoder().encode(manifest),
			fieldManager: 'otterscale-web-ui',
			force: true
		});
	}

	function isSchedulerScaledDown(deployment: DeploymentObject): boolean {
		const replicas = deployment.status?.replicas ?? 0;
		const readyReplicas = deployment.status?.readyReplicas ?? 0;

		return replicas === 0 && readyReplicas === 0;
	}

	function isSchedulerReady(deployment: DeploymentObject, desiredReplicas: number): boolean {
		const readyReplicas = deployment.status?.readyReplicas ?? 0;
		const availableReplicas = deployment.status?.availableReplicas ?? 0;
		const updatedReplicas = deployment.status?.updatedReplicas ?? 0;

		return (
			readyReplicas >= desiredReplicas &&
			availableReplicas >= desiredReplicas &&
			updatedReplicas >= desiredReplicas
		);
	}

	async function waitForSchedulerScaledDown(maxRetry = 30, intervalMs = 2000) {
		for (let i = 0; i < maxRetry; i += 1) {
			const deployment = await getSchedulerDeployment();
			if (isSchedulerScaledDown(deployment)) return;
			await sleep(intervalMs);
		}

		throw new Error(`${hamiSchedulerDeploymentName} did not scale down to 0`);
	}

	async function waitForSchedulerReady(desiredReplicas: number, maxRetry = 30, intervalMs = 2000) {
		for (let i = 0; i < maxRetry; i += 1) {
			const deployment = await getSchedulerDeployment();
			if (isSchedulerReady(deployment, desiredReplicas)) return;
			await sleep(intervalMs);
		}

		throw new Error(`${hamiSchedulerDeploymentName} is not ready after restart`);
	}

	async function restartSchedulerDeployment() {
		const deployment = await getSchedulerDeployment();
		const desiredReplicas =
			deployment.spec?.replicas && deployment.spec.replicas > 0 ? deployment.spec.replicas : 1;

		try {
			// Scale down to 0 first, since a simple rollout restart annotation
			// does not force this deployment's pod to actually restart.
			await scaleSchedulerDeployment(0);
			await waitForSchedulerScaledDown();

			// Scale back up to the original replica count (default 1).
			await scaleSchedulerDeployment(desiredReplicas);
			await waitForSchedulerReady(desiredReplicas);
		} catch (error) {
			// Never leave the scheduler scaled to 0 — a cluster-wide scheduling
			// outage is worse than any failed restart. Best-effort restore of the
			// original replica count, then rethrow the original failure.
			try {
				await scaleSchedulerDeployment(desiredReplicas);
			} catch (restoreError) {
				console.error(
					`Failed to restore ${hamiSchedulerDeploymentName} to ${desiredReplicas} replicas:`,
					restoreError
				);
			}
			throw error;
		}
	}

	async function refreshMigState() {
		isLoadingState = true;

		try {
			const configMap = await getMigConfigMap();
			const config = parseMigConfig(configMap.data?.[configJsonKey]);
			isMigEnabled = hasMigEnabled(config, nodeName);
		} catch (error) {
			console.error(`Failed to load MIG config for node ${nodeName}:`, error);
		} finally {
			isLoadingState = false;
		}
	}

	async function updateMigMode(enabled: boolean) {
		if (isSubmitting || !nodeName) return;

		// Enabling MIG requires the node to be MIG-capable
		// (nvidia.com/mig.capable label must be "true").
		if (enabled && !isMigCapable) {
			toast.error(m.node_mig_not_capable_error({ nodeName }));
			return;
		}

		isSubmitting = true;

		toast.promise(
			async () => {
				const configMap = await getMigConfigMap();
				// Snapshot the current config.json so we can restore it if any step
				// after the write fails — a failed toggle must not leave the MIG
				// state changed.
				const previousData = { ...(configMap.data ?? {}) };
				const config = parseMigConfig(previousData[configJsonKey]);
				const nextConfig = buildNextConfig(config, enabled, nodeName);

				await applyMigConfigMap({
					...previousData,
					[configJsonKey]: JSON.stringify(nextConfig, null, 2)
				});

				// Track what has already taken effect, so the rollback below can
				// restore exactly that — not just the ConfigMap data.
				let previousSchedulerDeviceData: Record<string, string> | undefined;
				let daemonSetRestarted = false;
				let schedulerRestarted = false;

				try {
					if (enabled) {
						previousSchedulerDeviceData = await updateSchedulerDeviceConfigMap(object);
					}

					// Restart both the device plugin daemonset and the scheduler
					// deployment regardless of enabling or disabling MIG, so the
					// new config.json always takes effect.
					await restartDaemonSet();
					daemonSetRestarted = true;
					await waitForDaemonSetReady();
					await sleep(1000);
					// Flag set before the call: even a failed restart may already have
					// recycled the scheduler pod onto the new config.
					schedulerRestarted = true;
					await restartSchedulerDeployment();

					// After the scheduler is back up, restart the gpu-operator so it
					// re-detects the node's (dis)enabled MIG capabilities.
					await restartGpuOperatorDeployment();
					await sleep(1000);
					await restartSchedulerDeployment();
				} catch (error) {
					// A later step failed after config was already written. Restore the
					// previous ConfigMaps, then restart whichever components already
					// picked up the new config so the restored config actually takes
					// effect — otherwise the "rollback" is data-only. Best-effort: the
					// original error is rethrown either way so the toast reports it.
					try {
						await applyMigConfigMap(previousData);
						if (previousSchedulerDeviceData) {
							await applySchedulerDeviceConfigMap(previousSchedulerDeviceData);
						}
						if (daemonSetRestarted) {
							await restartDaemonSet();
						}
						if (schedulerRestarted) {
							await restartSchedulerDeployment();
						}
					} catch (rollbackError) {
						console.error(`Failed to roll back MIG config for node ${nodeName}:`, rollbackError);
					}
					throw error;
				}

				isMigEnabled = enabled;
			},
			{
				loading: enabled ? m.node_mig_enabling({ nodeName }) : m.node_mig_disabling({ nodeName }),
				success: () =>
					enabled ? m.node_mig_enabled({ nodeName }) : m.node_mig_disabled({ nodeName }),
				error: (error: unknown) => {
					console.error(`Failed to update GPU MIG for node ${nodeName}:`, error);
					return m.node_mig_update_error({ nodeName, message: getErrorMessage(error) });
				},
				finally() {
					isSubmitting = false;
				}
			}
		);
	}

	// Whether the pending confirmation is for enabling (true) or disabling (false) MIG.
	let pendingEnable = $state(false);

	function handleToggleClick(event: Event, enabled: boolean) {
		// Prevent the default DropdownMenu.Item select behavior
		// to avoid focus conflicts when opening AlertDialog.
		event.preventDefault();

		pendingEnable = enabled;

		// Open AlertDialog after dropdown closes and focus is restored.
		setTimeout(() => {
			isConfirmDialogOpen = true;
		}, 0);
	}

	function confirmToggle() {
		isConfirmDialogOpen = false;
		void updateMigMode(pendingEnable);
	}

	// Restart the HAMi scheduler deployment so it re-reads the current MIG config
	// without changing the config.json itself.
	async function refreshMig() {
		if (isSubmitting || !nodeName) return;

		isSubmitting = true;

		toast.promise(
			async () => {
				await restartSchedulerDeployment();
			},
			{
				loading: m.node_mig_refreshing({ nodeName }),
				success: () => m.node_mig_refreshed({ nodeName }),
				error: (error: unknown) => {
					console.error(`Failed to refresh GPU MIG scheduler for node ${nodeName}:`, error);
					return m.node_mig_refresh_error({ nodeName, message: getErrorMessage(error) });
				},
				finally() {
					isSubmitting = false;
				}
			}
		);
	}
</script>

{#if !page.data.isRestricted}
	<DropdownMenu.Sub onOpenChange={handleSubOpenChange}>
		<DropdownMenu.SubTrigger
			class="w-full data-disabled:pointer-events-none data-disabled:opacity-50"
			disabled={!isMigCapable}
			title={isMigCapable ? undefined : m.node_mig_not_capable_hint()}
		>
			<Item.Root class="p-0 text-xs" size="sm">
				<Item.Media>
					<GpuIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>MIG</Item.Title>
				</Item.Content>
			</Item.Root>
		</DropdownMenu.SubTrigger>
		<DropdownMenu.SubContent>
			<DropdownMenu.Item
				disabled={isSubmitting || isLoadingState || isMigEnabled}
				onSelect={(event: Event) => handleToggleClick(event, true)}
			>
				{m.node_mig_enable()}
			</DropdownMenu.Item>
			<DropdownMenu.Item
				disabled={isSubmitting || isLoadingState || !isMigEnabled}
				onSelect={(event: Event) => handleToggleClick(event, false)}
			>
				{m.node_mig_disable()}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item
				disabled={isSubmitting || isLoadingState}
				onSelect={(event: Event) => {
					event.preventDefault();
					void refreshMig();
				}}
			>
				{m.node_mig_refresh()}
			</DropdownMenu.Item>
		</DropdownMenu.SubContent>
	</DropdownMenu.Sub>
{/if}

<AlertDialog.Root bind:open={isConfirmDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title
				>{pendingEnable
					? m.node_mig_enable_alert_title()
					: m.node_mig_disable_alert_title()}</AlertDialog.Title
			>
			<AlertDialog.Description>
				{m.node_mig_alert_description()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmToggle}>{m.node_mig_alert_continue()}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
