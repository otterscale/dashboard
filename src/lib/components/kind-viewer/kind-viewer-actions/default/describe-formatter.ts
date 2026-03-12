/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Formats any Kubernetes resource JSON + events into kubectl-describe-style
 * plain text.
 *
 * - Pod → dedicated formatter (matches `kubectl describe pod` field order)
 * - Everything else → generic tree renderer (matches `kubectl describe <crd>`)
 *
 * The generic renderer converts camelCase keys to "Title Case" and
 * recursively renders the full object tree, just like kubectl's
 * GenericDescriberFor().
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const W = 25; // global label column width

function none(): string {
	return '<none>';
}

function nil(): string {
	return '<nil>';
}

/**
 * Convert camelCase / PascalCase key to "Title Case With Spaces".
 *   creationTimestamp → Creation Timestamp
 *   resourceVersion   → Resource Version
 *   apiVersion        → API Version  (special-cased acronyms)
 */
function toTitleCase(key: string): string {
	// Insert space before uppercase letters that follow lowercase or before
	// a run of uppercase followed by a lowercase (e.g. "APIVersion" → "API Version")
	const spaced = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatTimestamp(ts: string | undefined | null): string {
	if (!ts) return none();
	const d = new Date(ts);
	const options: Intl.DateTimeFormatOptions = {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
		timeZoneName: 'shortOffset'
	};
	return d.toLocaleString('en-US', options).replace(/,\s*/g, ', ');
}

function formatAge(ts: string | undefined | null): string {
	if (!ts) return 'Unknown';
	const diffMs = Date.now() - new Date(ts).getTime();
	const sec = Math.floor(diffMs / 1000);
	if (sec < 60) return `${sec}s`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h`;
	return `${Math.floor(hr / 24)}d`;
}

function mapToStr(m: Record<string, string> | undefined | null, sep = '='): string {
	if (!m || Object.keys(m).length === 0) return none();
	return Object.entries(m)
		.map(([k, v]) => `${k}${sep}${v}`)
		.join('\n');
}

function pad(label: string, width = W): string {
	return (label + ':').padEnd(width);
}

/** Append multi-line value with proper continuation indent. */
function multiLine(label: string, values: string[], width = W): string {
	if (values.length === 0) return `${pad(label, width)}${none()}`;
	const lines = [`${pad(label, width)}${values[0]}`];
	for (let i = 1; i < values.length; i++) {
		lines.push(' '.repeat(width) + values[i]);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Generic tree renderer
// ---------------------------------------------------------------------------

/**
 * Recursively renders any JSON value as indented key: value lines,
 * matching kubectl's generic describe output style. camelCase keys are
 * converted to "Title Case With Spaces".
 */
function renderTree(obj: any, indent = 2, skipKeys?: Set<string>): string {
	const prefix = ' '.repeat(indent);
	const lines: string[] = [];

	if (obj === null || obj === undefined) {
		return `${prefix}${nil()}`;
	}
	if (typeof obj !== 'object') {
		return `${prefix}${String(obj)}`;
	}
	if (Array.isArray(obj)) {
		if (obj.length === 0) {
			lines.push(`${prefix}${none()}`);
		} else {
			for (const item of obj) {
				if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
					// Each array element is rendered as indented key-values
					const inner = renderTree(item, indent + 2);
					lines.push(inner);
				} else {
					lines.push(`${prefix}${String(item)}`);
				}
			}
		}
		return lines.join('\n');
	}

	// Plain object
	for (const [key, val] of Object.entries(obj)) {
		if (skipKeys?.has(key)) continue;
		const label = toTitleCase(key);
		if (val === null || val === undefined) {
			lines.push(`${prefix}${label}:  ${nil()}`);
		} else if (Array.isArray(val)) {
			if (val.length === 0) {
				lines.push(`${prefix}${label}:  ${none()}`);
			} else {
				lines.push(`${prefix}${label}:`);
				lines.push(renderTree(val, indent + 2));
			}
		} else if (typeof val === 'object' && Object.keys(val).length > 0) {
			lines.push(`${prefix}${label}:`);
			lines.push(renderTree(val, indent + 2));
		} else if (typeof val === 'object' && Object.keys(val).length === 0) {
			lines.push(`${prefix}${label}:  {}`);
		} else {
			lines.push(`${prefix}${label}:  ${String(val)}`);
		}
	}
	return lines.join('\n');
}

// =========================================================================
//  GENERIC DESCRIBE  (for any non-Pod resource — like `kubectl describe <crd>`)
// =========================================================================

function formatGenericDescribe(resource: any, events: any[]): string {
	const meta = resource.metadata ?? {};
	const lines: string[] = [];

	// Top-level header fields (same order as kubectl generic describe)
	lines.push(`${pad('Name')}${meta.name ?? ''}`);
	lines.push(`${pad('Namespace')}${meta.namespace ?? ''}`);

	// Labels
	lines.push(multiLine('Labels', mapToStr(meta.labels, '=').split('\n')));

	// Annotations
	const ann = meta.annotations;
	if (ann && Object.keys(ann).length > 0) {
		lines.push(
			multiLine(
				'Annotations',
				Object.entries(ann as Record<string, string>).map(([k, v]) => `${k}: ${v}`)
			)
		);
	} else {
		lines.push(`${pad('Annotations')}${none()}`);
	}

	// API Version & Kind
	if (resource.apiVersion) lines.push(`${pad('API Version')}${resource.apiVersion}`);
	if (resource.kind) lines.push(`${pad('Kind')}${resource.kind}`);

	// Metadata (remaining fields as tree, skip managedFields + already-shown fields)
	const metaSkip = new Set(['managedFields', 'name', 'namespace', 'labels', 'annotations']);
	const metaRest: Record<string, any> = {};
	for (const [k, v] of Object.entries(meta)) {
		if (!metaSkip.has(k)) metaRest[k] = v;
	}
	if (Object.keys(metaRest).length > 0) {
		lines.push('Metadata:');
		lines.push(renderTree(metaRest, 2));
	}

	// Remaining top-level fields as tree sections (skip metadata, apiVersion, kind)
	const topSkip = new Set(['metadata', 'apiVersion', 'kind']);
	for (const [key, val] of Object.entries(resource)) {
		if (topSkip.has(key)) continue;
		const label = toTitleCase(key);
		if (val === null || val === undefined) {
			lines.push(`${label}:  ${nil()}`);
		} else if (typeof val === 'object') {
			lines.push(`${label}:`);
			lines.push(renderTree(val, 2));
		} else {
			lines.push(`${label}:  ${String(val)}`);
		}
	}

	// Events
	lines.push(buildEventsTable(events));

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Metadata section  (hardcoded — matches kubectl field order)
// ---------------------------------------------------------------------------

function buildMetadataSection(pod: any): string {
	const meta = pod.metadata ?? {};
	const spec = pod.spec ?? {};
	const status = pod.status ?? {};

	const lines: string[] = [];

	lines.push(`${pad('Name')}${meta.name ?? ''}`);
	lines.push(`${pad('Namespace')}${meta.namespace ?? ''}`);
	lines.push(`${pad('Priority')}${spec.priority ?? 0}`);
	if (spec.priorityClassName) {
		lines.push(`${pad('Priority Class Name')}${spec.priorityClassName}`);
	}
	if (spec.runtimeClassName) {
		lines.push(`${pad('Runtime Class Name')}${spec.runtimeClassName}`);
	}
	lines.push(`${pad('Service Account')}${spec.serviceAccountName ?? spec.serviceAccount ?? ''}`);

	const nodeIP = status.hostIP ? `${spec.nodeName}/${status.hostIP}` : (spec.nodeName ?? '');
	lines.push(`${pad('Node')}${nodeIP}`);
	lines.push(`${pad('Start Time')}${formatTimestamp(status.startTime)}`);

	// Labels
	lines.push(multiLine('Labels', mapToStr(meta.labels, '=').split('\n')));

	// Annotations
	const annEntries = meta.annotations
		? Object.entries(meta.annotations as Record<string, string>)
		: [];
	if (annEntries.length === 0) {
		lines.push(`${pad('Annotations')}${none()}`);
	} else {
		lines.push(
			multiLine(
				'Annotations',
				annEntries.map(([k, v]) => `${k}: ${v}`)
			)
		);
	}

	// Status
	lines.push(`${pad('Status')}${status.phase ?? ''}`);
	if (status.reason) lines.push(`${pad('Reason')}${status.reason}`);
	if (status.message) lines.push(`${pad('Message')}${status.message}`);

	// SeccompProfile
	const seccomp = spec.securityContext?.seccompProfile;
	if (seccomp) {
		lines.push(
			`${pad('SeccompProfile')}${seccomp.type ?? ''}${seccomp.localhostProfile ? `/${seccomp.localhostProfile}` : ''}`
		);
	}

	// IP
	lines.push(`${pad('IP')}${status.podIP ?? ''}`);
	const podIPs: any[] = status.podIPs ?? [];
	if (podIPs.length > 0) {
		lines.push(`IPs:`);
		for (const entry of podIPs) {
			lines.push(`  ${pad('IP', W - 2)}${entry.ip ?? ''}`);
		}
	}

	// Controlled By
	const owners: any[] = meta.ownerReferences ?? [];
	if (owners.length > 0) {
		const ref = owners[0];
		lines.push(`${pad('Controlled By')}${ref.kind}/${ref.name}`);
	}

	// NominatedNodeName
	if (status.nominatedNodeName) {
		lines.push(`${pad('NominatedNodeName')}${status.nominatedNodeName}`);
	}

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Containers section  (handles spec containers + init + ephemeral)
// ---------------------------------------------------------------------------

function buildSingleContainer(c: any, cs: any, indent: string): string[] {
	const CW = 20; // inner label width
	const II = indent;
	const III = indent + '  ';
	const lines: string[] = [];

	lines.push(`${II}${c.name}:`);
	lines.push(`${II}  ${pad('Container ID', CW)}${cs.containerID ?? ''}`);
	lines.push(`${II}  ${pad('Image', CW)}${c.image ?? ''}`);
	lines.push(`${II}  ${pad('Image ID', CW)}${cs.imageID ?? ''}`);

	// Ports
	const ports: any[] = c.ports ?? [];
	if (ports.length === 0) {
		lines.push(`${II}  ${pad('Port', CW)}${none()}`);
		lines.push(`${II}  ${pad('Host Port', CW)}${none()}`);
	} else {
		const portStrs = ports.map((p: any) => `${p.containerPort}/${p.protocol ?? 'TCP'}`);
		const hostPortStrs = ports.map((p: any) => `${p.hostPort ?? 0}/${p.protocol ?? 'TCP'}`);
		lines.push(`${II}  ${pad('Port', CW)}${portStrs.join(', ')}`);
		lines.push(`${II}  ${pad('Host Port', CW)}${hostPortStrs.join(', ')}`);
	}

	// Command / Args
	if (c.command?.length) {
		lines.push(`${II}  ${pad('Command', CW)}`);
		for (const cmd of c.command) lines.push(`${III}    ${cmd}`);
	}
	if (c.args?.length) {
		lines.push(`${II}  ${pad('Args', CW)}`);
		for (const arg of c.args) lines.push(`${III}    ${arg}`);
	}

	// State
	const state = cs.state ?? {};
	const stateKey = Object.keys(state)[0];
	if (stateKey) {
		const sv = state[stateKey];
		const cap = stateKey.charAt(0).toUpperCase() + stateKey.slice(1);
		lines.push(`${II}  ${pad('State', CW)}${cap}`);
		if (stateKey === 'running' && sv?.startedAt)
			lines.push(`${III}    ${pad('Started', CW - 4)}${formatTimestamp(sv.startedAt)}`);
		if (stateKey === 'waiting' && sv?.reason)
			lines.push(`${III}    ${pad('Reason', CW - 4)}${sv.reason}`);
		if (stateKey === 'terminated') {
			if (sv?.exitCode !== undefined)
				lines.push(`${III}    ${pad('Exit Code', CW - 4)}${sv.exitCode}`);
			if (sv?.reason) lines.push(`${III}    ${pad('Reason', CW - 4)}${sv.reason}`);
			if (sv?.startedAt)
				lines.push(`${III}    ${pad('Started', CW - 4)}${formatTimestamp(sv.startedAt)}`);
			if (sv?.finishedAt)
				lines.push(`${III}    ${pad('Finished', CW - 4)}${formatTimestamp(sv.finishedAt)}`);
		}
	}

	// Last State
	const lastState = cs.lastState ?? {};
	const lastKey = Object.keys(lastState)[0];
	if (lastKey) {
		const lv = lastState[lastKey];
		const cap = lastKey.charAt(0).toUpperCase() + lastKey.slice(1);
		lines.push(`${II}  ${pad('Last State', CW)}${cap}`);
		if (lastKey === 'terminated') {
			if (lv?.exitCode !== undefined)
				lines.push(`${III}    ${pad('Exit Code', CW - 4)}${lv.exitCode}`);
			if (lv?.reason) lines.push(`${III}    ${pad('Reason', CW - 4)}${lv.reason}`);
			if (lv?.startedAt)
				lines.push(`${III}    ${pad('Started', CW - 4)}${formatTimestamp(lv.startedAt)}`);
			if (lv?.finishedAt)
				lines.push(`${III}    ${pad('Finished', CW - 4)}${formatTimestamp(lv.finishedAt)}`);
		}
	}

	lines.push(`${II}  ${pad('Ready', CW)}${cs.ready ?? false}`);
	lines.push(`${II}  ${pad('Restart Count', CW)}${cs.restartCount ?? 0}`);

	// Probes
	if (c.livenessProbe) lines.push(`${II}  ${pad('Liveness', CW)}${formatProbe(c.livenessProbe)}`);
	if (c.readinessProbe)
		lines.push(`${II}  ${pad('Readiness', CW)}${formatProbe(c.readinessProbe)}`);
	if (c.startupProbe) lines.push(`${II}  ${pad('Startup', CW)}${formatProbe(c.startupProbe)}`);

	// Resources
	const limits = c.resources?.limits;
	const requests = c.resources?.requests;
	if (limits && Object.keys(limits).length > 0) {
		lines.push(`${II}  Limits:`);
		for (const [k, v] of Object.entries(limits)) lines.push(`${II}    ${pad(k, CW - 4)}${v}`);
	}
	if (requests && Object.keys(requests).length > 0) {
		lines.push(`${II}  Requests:`);
		for (const [k, v] of Object.entries(requests)) lines.push(`${II}    ${pad(k, CW - 4)}${v}`);
	}

	// Environment
	const env: any[] = c.env ?? [];
	const envFrom: any[] = c.envFrom ?? [];
	if (env.length === 0 && envFrom.length === 0) {
		lines.push(`${II}  ${pad('Environment', CW)}${none()}`);
	} else {
		lines.push(`${II}  Environment:`);
		for (const e of env) {
			if (e.valueFrom) {
				const src = e.valueFrom;
				if (src.configMapKeyRef) {
					lines.push(
						`${II}    ${e.name}:  <set to the key '${src.configMapKeyRef.key}' in configmap '${src.configMapKeyRef.name}'>`
					);
				} else if (src.secretKeyRef) {
					lines.push(
						`${II}    ${e.name}:  <set to the key '${src.secretKeyRef.key}' in secret '${src.secretKeyRef.name}'>`
					);
				} else if (src.fieldRef) {
					lines.push(`${II}    ${e.name}:   (${src.fieldRef.fieldPath})`);
				} else if (src.resourceFieldRef) {
					lines.push(`${II}    ${e.name}:   (${src.resourceFieldRef.resource})`);
				} else {
					lines.push(`${II}    ${e.name}:  <set from external source>`);
				}
			} else {
				lines.push(`${II}    ${e.name}:  ${e.value ?? ''}`);
			}
		}
		for (const ef of envFrom) {
			if (ef.configMapRef) {
				lines.push(
					`${II}    ${ef.configMapRef.name}\tConfigMap\tOptional: ${ef.configMapRef.optional ?? false}`
				);
			}
			if (ef.secretRef) {
				lines.push(
					`${II}    ${ef.secretRef.name}\tSecret\tOptional: ${ef.secretRef.optional ?? false}`
				);
			}
		}
	}

	// Mounts
	const mounts: any[] = c.volumeMounts ?? [];
	if (mounts.length === 0) {
		lines.push(`${II}  ${pad('Mounts', CW)}${none()}`);
	} else {
		lines.push(`${II}  Mounts:`);
		for (const m of mounts) {
			let suffix = m.readOnly ? ' (ro' : ' (rw';
			if (m.subPath) suffix += `,path="${m.subPath}"`;
			suffix += ')';
			lines.push(`${II}    ${m.mountPath} from ${m.name}${suffix}`);
		}
	}

	return lines;
}

function formatProbe(probe: any): string {
	const parts: string[] = [];
	if (probe.httpGet) {
		const scheme = (probe.httpGet.scheme ?? 'HTTP').toLowerCase();
		parts.push(
			`${scheme}-get ${scheme}://:${probe.httpGet.port ?? ''}${probe.httpGet.path ?? '/'}`
		);
	} else if (probe.tcpSocket) {
		parts.push(`tcp-socket :${probe.tcpSocket.port ?? ''}`);
	} else if (probe.exec?.command) {
		parts.push(`exec [${probe.exec.command.join(' ')}]`);
	} else if (probe.grpc) {
		parts.push(`grpc <pod>:${probe.grpc.port ?? ''}`);
	}
	const extras: string[] = [];
	if (probe.initialDelaySeconds) extras.push(`delay=${probe.initialDelaySeconds}s`);
	if (probe.timeoutSeconds) extras.push(`timeout=${probe.timeoutSeconds}s`);
	if (probe.periodSeconds) extras.push(`period=${probe.periodSeconds}s`);
	if (probe.successThreshold) extras.push(`#success=${probe.successThreshold}`);
	if (probe.failureThreshold) extras.push(`#failure=${probe.failureThreshold}`);
	if (extras.length > 0) parts.push(extras.join(' '));
	return parts.join(' ') || none();
}

function buildContainersBlock(heading: string, specContainers: any[], statusList: any[]): string {
	if (specContainers.length === 0) return '';
	const statusMap = new Map<string, any>();
	for (const cs of statusList) statusMap.set(cs.name, cs);

	const lines: string[] = [`${heading}:`];
	for (const c of specContainers) {
		const cs = statusMap.get(c.name) ?? {};
		lines.push(...buildSingleContainer(c, cs, '  '));
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Conditions section  (hardcoded table)
// ---------------------------------------------------------------------------

function buildConditionsSection(pod: any): string {
	const conditions: any[] = pod.status?.conditions ?? [];
	if (conditions.length === 0) return `Conditions:\n  ${none()}`;

	const typeW = Math.max(4, ...conditions.map((c: any) => (c.type ?? '').length)) + 2;
	const lines: string[] = ['Conditions:'];
	lines.push(`  ${'Type'.padEnd(typeW)}${'Status'}`);
	for (const c of conditions) {
		lines.push(`  ${(c.type ?? '').padEnd(typeW)}${c.status ?? ''}`);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Volumes section  (hybrid: known types → kubectl format, unknown → tree)
// ---------------------------------------------------------------------------

/** Map from volume source key → [human description, field-extractor]. */
const KNOWN_VOLUME_TYPES: Record<
	string,
	{ desc: string; render: (src: any, indent: string) => string[] }
> = {
	hostPath: {
		desc: 'HostPath (bare host directory volume)',
		render: (s, I) => [`${I}Path:          ${s.path ?? ''}`, `${I}HostPathType:  ${s.type ?? ''}`]
	},
	emptyDir: {
		desc: "EmptyDir (a temporary directory that shares a pod's lifetime)",
		render: (s, I) => [
			`${I}Medium:        ${s.medium ?? ''}`,
			`${I}SizeLimit:     ${s.sizeLimit ?? '<unset>'}`
		]
	},
	secret: {
		desc: 'Secret (a volume populated by a Secret)',
		render: (s, I) => [
			`${I}SecretName:    ${s.secretName ?? ''}`,
			`${I}Optional:      ${s.optional ?? false}`
		]
	},
	configMap: {
		desc: 'ConfigMap (a volume populated by a ConfigMap)',
		render: (s, I) => [
			`${I}Name:          ${s.name ?? ''}`,
			`${I}Optional:      ${s.optional ?? false}`
		]
	},
	persistentVolumeClaim: {
		desc: 'PersistentVolumeClaim (a reference to a PersistentVolumeClaim in the same namespace)',
		render: (s, I) => [
			`${I}ClaimName:     ${s.claimName ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	nfs: {
		desc: 'NFS (an NFS mount that lasts the lifetime of a pod)',
		render: (s, I) => [
			`${I}Server:        ${s.server ?? ''}`,
			`${I}Path:          ${s.path ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	iscsi: {
		desc: 'ISCSI (an ISCSI Disk resource that is attached to a kubelet host machine and then exposed to the pod)',
		render: (s, I) => [
			`${I}TargetPortal:  ${s.targetPortal ?? ''}`,
			`${I}IQN:           ${s.iqn ?? ''}`,
			`${I}Lun:           ${s.lun ?? 0}`,
			`${I}ISCSIInterface:${s.iscsiInterface ?? 'default'}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	glusterfs: {
		desc: 'Glusterfs (a Glusterfs mount on the host that shares a pod lifetime)',
		render: (s, I) => [
			`${I}EndpointsName: ${s.endpoints ?? ''}`,
			`${I}Path:          ${s.path ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	rbd: {
		desc: 'RBD (a Rados Block Device mount on the host that shares a pod lifetime)',
		render: (s, I) => [
			`${I}CephMonitors:  ${(s.monitors ?? []).join(', ')}`,
			`${I}RBDImage:      ${s.image ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}RBDPool:       ${s.pool ?? 'rbd'}`,
			`${I}RadosUser:     ${s.user ?? 'admin'}`,
			`${I}Keyring:       ${s.keyring ?? '/etc/ceph/keyring'}`,
			`${I}SecretRef:     ${s.secretRef?.name ?? nil()}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	cephfs: {
		desc: 'CephFS (a CephFS mount on the host that shares a pod lifetime)',
		render: (s, I) => [
			`${I}Monitors:      ${(s.monitors ?? []).join(', ')}`,
			`${I}Path:          ${s.path ?? ''}`,
			`${I}User:          ${s.user ?? 'admin'}`,
			`${I}SecretFile:    ${s.secretFile ?? ''}`,
			`${I}SecretRef:     ${s.secretRef?.name ?? nil()}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	downwardAPI: {
		desc: 'DownwardAPI (a volume populated by information about the pod)',
		render: (s, I) => {
			const lines: string[] = [];
			for (const item of s.items ?? []) {
				if (item.fieldRef) {
					lines.push(`${I}${item.fieldRef.fieldPath} -> ${item.path}`);
				} else if (item.resourceFieldRef) {
					lines.push(`${I}${item.resourceFieldRef.resource} -> ${item.path}`);
				}
			}
			return lines.length > 0 ? lines : [`${I}${none()}`];
		}
	},
	fc: {
		desc: 'FC (a Fibre Channel disk)',
		render: (s, I) => [
			`${I}TargetWWNs:    ${(s.targetWWNs ?? []).join(', ')}`,
			`${I}LUN:           ${s.lun ?? nil()}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	azureFile: {
		desc: 'AzureFile (an Azure File Service mount on the host and bind mount to the pod)',
		render: (s, I) => [
			`${I}SecretName:    ${s.secretName ?? ''}`,
			`${I}ShareName:     ${s.shareName ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	azureDisk: {
		desc: 'AzureDisk (an Azure Data Disk mount on the host and bind mount to the pod)',
		render: (s, I) => [
			`${I}DiskName:      ${s.diskName ?? ''}`,
			`${I}DiskURI:       ${s.diskURI ?? ''}`,
			`${I}Kind:          ${s.kind ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}CachingMode:   ${s.cachingMode ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	vsphereVolume: {
		desc: 'vSphereVolume (a vSphere Persistent Disk resource)',
		render: (s, I) => [
			`${I}VolumePath:    ${s.volumePath ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}StoragePolicyName: ${s.storagePolicyName ?? ''}`
		]
	},
	cinder: {
		desc: 'Cinder (a Persistent Disk resource in OpenStack)',
		render: (s, I) => [
			`${I}VolumeID:      ${s.volumeID ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`,
			`${I}SecretRef:     ${s.secretRef?.name ?? nil()}`
		]
	},
	csi: {
		desc: 'CSI (a]Container Storage Interface (CSI) volume source)',
		render: (s, I) => {
			const lines = [
				`${I}Driver:        ${s.driver ?? ''}`,
				`${I}FSType:        ${s.fsType ?? ''}`,
				`${I}ReadOnly:      ${s.readOnly ?? false}`
			];
			if (s.volumeAttributes && Object.keys(s.volumeAttributes).length > 0) {
				lines.push(`${I}VolumeAttributes:`);
				for (const [k, v] of Object.entries(s.volumeAttributes)) lines.push(`${I}  ${k}=${v}`);
			}
			return lines;
		}
	},
	ephemeral: {
		desc: 'EphemeralVolume (an inline specification for a volume that gets created and deleted with the pod)',
		render: (s, I) => {
			const pvc = s.volumeClaimTemplate?.spec;
			if (!pvc) return [`${I}${none()}`];
			const lines: string[] = [];
			if (pvc.accessModes) lines.push(`${I}AccessModes:   ${pvc.accessModes.join(', ')}`);
			if (pvc.storageClassName) lines.push(`${I}StorageClass:  ${pvc.storageClassName}`);
			const req = pvc.resources?.requests?.storage;
			if (req) lines.push(`${I}Capacity:      ${req}`);
			return lines.length > 0 ? lines : [`${I}${none()}`];
		}
	},
	flexVolume: {
		desc: 'FlexVolume (a generic volume resource provisioned/attached using an exec based plugin)',
		render: (s, I) => [
			`${I}Driver:        ${s.driver ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}SecretRef:     ${s.secretRef?.name ?? nil()}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`,
			`${I}Options:       ${s.options ? JSON.stringify(s.options) : none()}`
		]
	},
	gcePersistentDisk: {
		desc: 'GCEPersistentDisk (a Persistent Disk resource in Google Compute Engine)',
		render: (s, I) => [
			`${I}PDName:        ${s.pdName ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}Partition:     ${s.partition ?? 0}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	awsElasticBlockStore: {
		desc: 'AWSElasticBlockStore (a Persistent Disk resource in AWS)',
		render: (s, I) => [
			`${I}VolumeID:      ${s.volumeID ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}Partition:     ${s.partition ?? 0}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	gitRepo: {
		desc: 'GitRepo (a volume that is pulled from git when the pod is created)',
		render: (s, I) => [
			`${I}Repository:    ${s.repository ?? ''}`,
			`${I}Revision:      ${s.revision ?? ''}`,
			`${I}Directory:     ${s.directory ?? ''}`
		]
	},
	quobyte: {
		desc: 'Quobyte (a Quobyte mount on the host that shares a pod lifetime)',
		render: (s, I) => [
			`${I}Registry:      ${s.registry ?? ''}`,
			`${I}Volume:        ${s.volume ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`,
			`${I}User:          ${s.user ?? ''}`,
			`${I}Group:         ${s.group ?? ''}`
		]
	},
	photonPersistentDisk: {
		desc: 'PhotonPersistentDisk (a Photon Controller Persistent Disk resource)',
		render: (s, I) => [`${I}PdID:          ${s.pdID ?? ''}`, `${I}FSType:        ${s.fsType ?? ''}`]
	},
	portworxVolume: {
		desc: 'PortworxVolume (a Portworx volume resource)',
		render: (s, I) => [
			`${I}VolumeID:      ${s.volumeID ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	scaleIO: {
		desc: 'ScaleIO (a persistent volume backed by a block device in ScaleIO)',
		render: (s, I) => [
			`${I}Gateway:       ${s.gateway ?? ''}`,
			`${I}System:        ${s.system ?? ''}`,
			`${I}Protection Domain: ${s.protectionDomain ?? ''}`,
			`${I}Storage Pool:  ${s.storagePool ?? ''}`,
			`${I}Storage Mode:  ${s.storageMode ?? ''}`,
			`${I}VolumeName:    ${s.volumeName ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	storageos: {
		desc: 'StorageOS (a StorageOS Persistent Disk resource)',
		render: (s, I) => [
			`${I}VolumeName:    ${s.volumeName ?? ''}`,
			`${I}VolumeNamespace: ${s.volumeNamespace ?? ''}`,
			`${I}FSType:        ${s.fsType ?? ''}`,
			`${I}ReadOnly:      ${s.readOnly ?? false}`
		]
	},
	flocker: {
		desc: 'Flocker (a Flocker volume mounted by the Flocker agent)',
		render: (s, I) => [
			`${I}DatasetName:   ${s.datasetName ?? ''}`,
			`${I}DatasetUUID:   ${s.datasetUUID ?? ''}`
		]
	},
	image: {
		desc: 'Image (OCI object (a container image or artifact) accessible within the pod)',
		render: (s, I) => [
			`${I}Reference:     ${s.reference ?? ''}`,
			`${I}PullPolicy:    ${s.pullPolicy ?? ''}`
		]
	},
	projected: {
		desc: 'Projected (a volume that contains injected data from multiple sources)',
		render: (s, I) => {
			const lines: string[] = [];
			for (const src of s.sources ?? []) {
				if (src.serviceAccountToken) {
					lines.push(
						`${I}TokenExpirationSeconds:  ${src.serviceAccountToken.expirationSeconds ?? ''}`
					);
				}
				if (src.configMap) {
					lines.push(`${I}ConfigMapName:           ${src.configMap.name ?? ''}`);
					lines.push(`${I}ConfigMapOptional:       ${src.configMap.optional ?? nil()}`);
				}
				if (src.secret) {
					lines.push(`${I}SecretName:              ${src.secret.name ?? ''}`);
					lines.push(`${I}SecretOptionalName:      ${src.secret.optional ?? nil()}`);
				}
				if (src.downwardAPI) {
					lines.push(`${I}DownwardAPI:             true`);
				}
			}
			return lines.length > 0 ? lines : [`${I}${none()}`];
		}
	}
};

function buildVolumesSection(pod: any): string {
	const volumes: any[] = pod.spec?.volumes ?? [];
	if (volumes.length === 0) return `Volumes:\n  ${none()}`;

	const lines: string[] = ['Volumes:'];
	const I = '  ';
	const II = '    ';

	for (const vol of volumes) {
		lines.push(`${I}${vol.name}:`);

		// Find which volume source key is present (skip "name")
		const sourceKey = Object.keys(vol).find((k) => k !== 'name');

		if (!sourceKey) {
			lines.push(`${II}Type:  <unknown>`);
			continue;
		}

		const known = KNOWN_VOLUME_TYPES[sourceKey];
		if (known) {
			// Known type — use kubectl-matching format
			lines.push(`${II}Type:          ${known.desc}`);
			lines.push(...known.render(vol[sourceKey], II));
		} else {
			// Unknown type — generic tree renderer so nothing is lost
			const typeName = sourceKey.charAt(0).toUpperCase() + sourceKey.slice(1);
			lines.push(`${II}Type:          ${typeName}`);
			lines.push(renderTree(vol[sourceKey], 4));
		}
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Readiness Gates
// ---------------------------------------------------------------------------

function buildReadinessGatesSection(pod: any): string {
	const gates: any[] = pod.spec?.readinessGates ?? [];
	if (gates.length === 0) return '';

	const conditions: any[] = pod.status?.conditions ?? [];
	const condMap = new Map<string, string>();
	for (const c of conditions) condMap.set(c.type, c.status);

	const typeW = Math.max(14, ...gates.map((g: any) => (g.conditionType ?? '').length)) + 2;
	const lines: string[] = ['Readiness Gates:'];
	lines.push(`  ${'Type'.padEnd(typeW)}${'Status'}`);
	for (const g of gates) {
		const t = g.conditionType ?? '';
		const s = condMap.get(t) ?? none();
		lines.push(`  ${t.padEnd(typeW)}${s}`);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tolerations
// ---------------------------------------------------------------------------

function buildTolerationsSection(pod: any): string {
	const tolerations: any[] = pod.spec?.tolerations ?? [];
	if (tolerations.length === 0) return `${pad('Tolerations')}${none()}`;

	const tolStrs = tolerations.map((t: any) => {
		let s = t.key ?? '';
		if (t.operator === 'Exists') {
			s += t.effect ? `:${t.effect}` : '';
			s += ' op=Exists';
		} else {
			s += `=${t.value ?? ''}:${t.effect ?? ''}`;
		}
		if (t.tolerationSeconds !== undefined && t.tolerationSeconds !== null) {
			s += ` for ${t.tolerationSeconds}s`;
		}
		return s;
	});

	return multiLine('Tolerations', tolStrs);
}

// ---------------------------------------------------------------------------
// Topology Spread Constraints
// ---------------------------------------------------------------------------

function buildTopologySpreadSection(pod: any): string {
	const constraints: any[] = pod.spec?.topologySpreadConstraints ?? [];
	if (constraints.length === 0) return '';

	const lines: string[] = ['Topology Spread Constraints:'];
	for (const c of constraints) {
		lines.push(
			`  ${c.topologyKey ?? none()}:${c.whenUnsatisfiable ?? ''} when max skew ${c.maxSkew ?? 0} is exceeded for selector ${c.labelSelector ? JSON.stringify(c.labelSelector.matchLabels ?? {}) : none()}`
		);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Events table  (hardcoded)
// ---------------------------------------------------------------------------

function buildEventsTable(events: any[]): string {
	if (!events || events.length === 0) {
		return `${pad('Events')}${none()}`;
	}

	const rows = events.map((ev: any) => {
		const obj = ev.object ?? ev;
		return {
			type: obj.type ?? '',
			reason: obj.reason ?? '',
			age: formatAge(obj.lastTimestamp ?? obj.metadata?.creationTimestamp),
			from: obj.source?.component ?? obj.reportingComponent ?? '',
			message: obj.message ?? ''
		};
	});

	const TW = Math.max(4, ...rows.map((r) => r.type.length)) + 2;
	const RW = Math.max(6, ...rows.map((r) => r.reason.length)) + 2;
	const AW = Math.max(3, ...rows.map((r) => r.age.length)) + 2;
	const FW = Math.max(4, ...rows.map((r) => r.from.length)) + 2;

	const lines: string[] = ['Events:'];
	lines.push(
		`  ${'Type'.padEnd(TW)}${'Reason'.padEnd(RW)}${'Age'.padEnd(AW)}${'From'.padEnd(FW)}Message`
	);
	lines.push(
		`  ${'----'.padEnd(TW)}${'------'.padEnd(RW)}${'---'.padEnd(AW)}${'----'.padEnd(FW)}-------`
	);
	for (const r of rows) {
		lines.push(
			`  ${r.type.padEnd(TW)}${r.reason.padEnd(RW)}${r.age.padEnd(AW)}${r.from.padEnd(FW)}${r.message}`
		);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format any Kubernetes resource + events into kubectl-describe-style text.
 * Automatically routes to the Pod-specific formatter when kind === 'Pod',
 * otherwise uses the generic tree renderer.
 */
export function formatDescribe(resource: any, events?: any[]): string {
	const kind = resource?.kind;
	if (kind === 'Pod') {
		return formatPodDescribe(resource, events ?? []);
	}
	return formatGenericDescribe(resource, events ?? []);
}

/**
 * Pod-specific formatter — matches `kubectl describe pod` field order.
 */
export function formatPodDescribe(pod: any, events?: any[]): string {
	const status = pod.status ?? {};
	const spec = pod.spec ?? {};

	const sections: string[] = [];

	// 1. Metadata (hardcoded — kubectl field order)
	sections.push(buildMetadataSection(pod));

	// 2. Init containers (hardcoded)
	const initBlock = buildContainersBlock(
		'Init Containers',
		spec.initContainers ?? [],
		status.initContainerStatuses ?? []
	);
	if (initBlock) sections.push(initBlock);

	// 3. Containers (hardcoded)
	sections.push(
		buildContainersBlock('Containers', spec.containers ?? [], status.containerStatuses ?? [])
	);

	// 4. Ephemeral containers (hardcoded)
	const ephBlock = buildContainersBlock(
		'Ephemeral Containers',
		spec.ephemeralContainers ?? [],
		status.ephemeralContainerStatuses ?? []
	);
	if (ephBlock) sections.push(ephBlock);

	// 5. Readiness Gates (hardcoded)
	const rgSection = buildReadinessGatesSection(pod);
	if (rgSection) sections.push(rgSection);

	// 6. Conditions (hardcoded table)
	sections.push(buildConditionsSection(pod));

	// 7. Volumes (hybrid: known → kubectl format, unknown → generic tree)
	sections.push(buildVolumesSection(pod));

	// 8. QoS Class
	sections.push(`${pad('QoS Class')}${status.qosClass ?? ''}`);

	// 9. Node-Selectors
	const nodeSelectors = spec.nodeSelector;
	if (nodeSelectors && Object.keys(nodeSelectors).length > 0) {
		sections.push(
			multiLine(
				'Node-Selectors',
				Object.entries(nodeSelectors).map(([k, v]) => `${k}=${v}`)
			)
		);
	} else {
		sections.push(`${pad('Node-Selectors')}${none()}`);
	}

	// 10. Tolerations (hardcoded)
	sections.push(buildTolerationsSection(pod));

	// 11. Topology Spread Constraints
	const topoSection = buildTopologySpreadSection(pod);
	if (topoSection) sections.push(topoSection);

	// 12. Events (hardcoded table)
	sections.push(buildEventsTable(events ?? []));

	return sections.join('\n');
}
