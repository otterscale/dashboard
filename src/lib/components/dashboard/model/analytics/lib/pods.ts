import { DASH, MIB } from '$lib/components/dashboard/kit/format';
import type { Tone } from '$lib/components/dashboard/kit/tone';

/**
 * What the Analytics page reads from a model's Pod objects: where each replica runs, what state it
 * is in, the engine's image and arguments, and the GPU memory HAMi allocated to it. Pure, so the
 * parsing is tested without a cluster.
 */

/** One card HAMi gave the pod: its UUID and the memory allocated on it, in MiB. */
export type HamiDevice = { uuid: string; mib: number };

export type PodStatusKey =
	| 'running'
	| 'notReady'
	| 'pending'
	| 'initializing'
	| 'creating'
	| 'pullingImage'
	| 'crashLoop'
	| 'imagePullError'
	| 'terminating'
	| 'succeeded'
	| 'failed'
	| 'other';

export type PodInfo = {
	name: string;
	namespace: string;
	node?: string;
	status: { key: PodStatusKey; tone: Tone; reason?: string };
	/** The engine container: its name, image, and command line split into words. */
	container?: string;
	image?: string;
	argv: string[];
	/** `nvidia.com/gpu` limit of the engine container. */
	gpus?: number;
	/** `nvidia.com/use-gputype`, e.g. "NVIDIA RTX PRO 6000 Blackwell Server Edition". */
	gpuType?: string;
	hami: HamiDevice[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * `hami.io/vgpu-devices-allocated`: containers separated by `;`, devices by `:`, each device
 * `<uuid>,<vendor>,<MiB>,<cores>`. Empty parts are containers without a GPU.
 */
export function parseHamiAllocation(annotation: string | undefined): HamiDevice[] {
	if (!annotation) return [];
	const out: HamiDevice[] = [];
	for (const container of annotation.split(';')) {
		for (const device of container.split(':')) {
			const [uuid, , mem] = device.split(',');
			const mib = Number(mem);
			if (uuid && uuid.trim() && Number.isFinite(mib)) out.push({ uuid: uuid.trim(), mib });
		}
	}
	return out;
}

/** Words of a command line, from `command` and `args`; shell strings are split on whitespace. */
export function commandWords(command: unknown, args: unknown): string[] {
	const list = [
		...(Array.isArray(command) ? command : []),
		...(Array.isArray(args) ? args : [])
	].filter((v): v is string => typeof v === 'string');
	return list.flatMap((part) => part.split(/\s+/)).filter(Boolean);
}

/** The value of `--flag value` or `--flag=value`; `-` and `_` spellings are the same flag. */
export function argValue(argv: string[], ...flags: string[]): string | undefined {
	const norm = (s: string) => s.replace(/_/g, '-');
	const wanted = flags.map(norm);
	for (let i = 0; i < argv.length; i++) {
		const word = norm(argv[i]);
		for (const flag of wanted) {
			if (word === flag) {
				const next = argv[i + 1];
				return next && !next.startsWith('-') ? next.replace(/^['"]|['"]$/g, '') : undefined;
			}
			if (word.startsWith(`${flag}=`)) return argv[i].slice(argv[i].indexOf('=') + 1);
		}
	}
	return undefined;
}

/** `registry/repo:tag@sha256:…` → repository and tag; the digest is dropped. */
export function imageParts(image: string): { repo: string; tag?: string } {
	const noDigest = image.includes('@') ? image.slice(0, image.indexOf('@')) : image;
	const slash = noDigest.lastIndexOf('/');
	const colon = noDigest.lastIndexOf(':');
	if (colon > slash) return { repo: noDigest.slice(0, colon), tag: noDigest.slice(colon + 1) };
	return { repo: noDigest };
}

/** `repo:tag`, never a bare digest. */
export function imageText(image: string | undefined): string | undefined {
	if (!image || image.startsWith('sha256:')) return undefined;
	const { repo, tag } = imageParts(image);
	return tag ? `${repo}:${tag}` : repo;
}

/**
 * The engine version, read from the image tag: a vLLM image tagged like a version gives
 * `vLLM 0.33.0`; any other tag is shown as it is. No metric reports the version.
 */
export function engineVersion(image: string | undefined): string | undefined {
	if (!image || image.startsWith('sha256:')) return undefined;
	const { repo, tag } = imageParts(image);
	if (!tag) return undefined;
	const name = repo.slice(repo.lastIndexOf('/') + 1).toLowerCase();
	const version = /^v?(\d+\.\d+(?:\.\d+)?(?:[-.+][\w.]+)?)$/.exec(tag);
	if (name.includes('vllm') && version) return `vLLM ${version[1]}`;
	return tag;
}

/** A context length as the engine was given it: `32768` → `32K`, `131072` → `128K`, `8000` → `8K`. */
export function fmtContextTokens(value: string | undefined): string | undefined {
	const n = Number(value);
	if (!value || !Number.isFinite(n) || n <= 0) return undefined;
	if (n >= 1_048_576 && n % 1_048_576 === 0) return `${n / 1_048_576}M`;
	if (n >= 1024 && n % 1024 === 0) return `${n / 1024}K`;
	if (n >= 1000 && n % 1000 === 0) return `${n / 1000}K`;
	return n.toLocaleString('en-US');
}

const BAD_WAITING = new Set([
	'ErrImagePull',
	'ImagePullBackOff',
	'InvalidImageName',
	'CreateContainerConfigError',
	'CreateContainerError'
]);

/** One status per pod, from its phase and its engine container's state. */
export function podStatus(o: unknown, container?: string): PodInfo['status'] {
	const pod = obj(o);
	const meta = obj(pod.metadata);
	const status = obj(pod.status);
	if (meta.deletionTimestamp) return { key: 'terminating', tone: 'muted' };
	const phase = str(status.phase);
	if (phase === 'Succeeded') return { key: 'succeeded', tone: 'muted' };
	if (phase === 'Failed') return { key: 'failed', tone: 'bad', reason: str(status.reason) };

	const statuses = (Array.isArray(status.containerStatuses) ? status.containerStatuses : []).map(
		obj
	);
	const engine = statuses.find((c) => c.name === container) ?? statuses[0];
	const waiting = str(obj(obj(engine?.state).waiting).reason);
	if (waiting === 'CrashLoopBackOff') return { key: 'crashLoop', tone: 'bad' };
	if (waiting && BAD_WAITING.has(waiting))
		return { key: 'imagePullError', tone: 'bad', reason: waiting };

	const inits = (
		Array.isArray(status.initContainerStatuses) ? status.initContainerStatuses : []
	).map(obj);
	const initDone = inits.every((c) => obj(c.state).terminated !== undefined);
	if (!initDone || waiting === 'PodInitializing') {
		const initWaiting = inits.map((c) => str(obj(obj(c.state).waiting).reason)).find(Boolean);
		if (initWaiting === 'CrashLoopBackOff') return { key: 'crashLoop', tone: 'bad' };
		return { key: 'initializing', tone: 'warn' };
	}
	if (waiting === 'ContainerCreating') {
		// The kubelet pulls the image before it creates the container.
		return engine?.imageID
			? { key: 'creating', tone: 'warn' }
			: { key: 'pullingImage', tone: 'warn' };
	}
	if (phase === 'Pending') return { key: 'pending', tone: 'warn' };
	if (phase === 'Running') {
		return engine?.ready === true
			? { key: 'running', tone: 'ok' }
			: { key: 'notReady', tone: 'warn' };
	}
	return { key: 'other', tone: 'muted', reason: phase ?? waiting };
}

/**
 * The engine container: the one the vLLM metrics name, else `main` (KServe's), else the first.
 */
export function engineContainer(o: unknown, hint?: string): Obj | undefined {
	const containers = (
		Array.isArray(obj(obj(o).spec).containers) ? (obj(obj(o).spec).containers as unknown[]) : []
	).map(obj);
	return (
		(hint && containers.find((c) => c.name === hint)) ||
		containers.find((c) => c.name === 'main') ||
		containers[0]
	);
}

export function podFromObject(o: unknown, hint?: string): PodInfo | undefined {
	const pod = obj(o);
	const meta = obj(pod.metadata);
	const name = str(meta.name);
	const namespace = str(meta.namespace);
	if (!name || !namespace) return undefined;
	const annotations = obj(meta.annotations);
	const c = engineContainer(o, hint);
	const containerName = str(c?.name);
	const gpus = Number(obj(obj(c?.resources).limits)['nvidia.com/gpu']);
	return {
		name,
		namespace,
		node: str(obj(pod.spec).nodeName),
		status: podStatus(o, containerName),
		container: containerName,
		image: str(c?.image),
		argv: commandWords(c?.command, c?.args),
		gpus: Number.isFinite(gpus) && gpus > 0 ? gpus : undefined,
		gpuType: str(annotations['nvidia.com/use-gputype']),
		hami: parseHamiAllocation(str(annotations['hami.io/vgpu-devices-allocated']))
	};
}

/** `NVIDIA RTX PRO 6000 Blackwell Server Edition` → `RTX PRO 6000 Blackwell`. */
export function shortGpuName(name: string | undefined): string | undefined {
	if (!name) return undefined;
	return name.replace(/^NVIDIA\s+/i, '').replace(/\s+Server Edition$/i, '');
}

/** A pod name shortened for a legend: `…7c9f4d-x2kq`. */
export function shortPod(pod: string): string {
	const parts = pod.split('-');
	return parts.length > 2 ? `…${parts.slice(-2).join('-')}` : pod;
}

/**
 * A pod's GPU memory: the HAMi allocation (quota) from its annotation, and what is used on its
 * cards. Usage is per card, so it is the pod's own only when the pod is the card's sole HAMi
 * tenant; on a shared card it is left out rather than guessed.
 */
export function podGpuMemory(
	pod: PodInfo,
	usedByUuid: Map<string, number>,
	tenantsByUuid: Map<string, number>
): { quota?: number; used?: number; shared: boolean } {
	if (pod.hami.length === 0) return { shared: false };
	const quota = pod.hami.reduce((sum, d) => sum + d.mib * MIB, 0);
	const shared = pod.hami.some((d) => (tenantsByUuid.get(d.uuid) ?? 1) > 1);
	if (shared) return { quota, shared };
	let used = 0;
	for (const d of pod.hami) {
		const v = usedByUuid.get(d.uuid);
		if (v === undefined) return { quota, shared };
		used += v;
	}
	return { quota, used, shared };
}

/**
 * Bytes as GiB with a decimal up to 100 GiB: `44`, `85.1`, `0.6`. The kit's `fmtGiB` rounds to
 * whole numbers from 10 GiB, which hides how close a pod is to its limit.
 */
export function fmtPodGiB(bytes: number | undefined): string {
	if (bytes === undefined || !Number.isFinite(bytes)) return DASH;
	const gib = bytes / 1024 ** 3;
	return gib >= 100
		? gib.toFixed(0)
		: gib >= 10
			? gib.toFixed(1).replace(/\.0$/, '')
			: gib.toFixed(1);
}

/**
 * Split a Kubernetes name for a middle ellipsis: the head may be cut, the tail is kept, since a
 * model's pods (and a cluster's nodes) differ only at the end. `a-b-7799fdd99f-4qsh8` →
 * [`a-b`, `-7799fdd99f-4qsh8`].
 */
export function splitTail(name: string, segments = 2): [string, string] {
	const parts = name.split('-');
	if (parts.length <= segments) return ['', name];
	const tail = parts.slice(-segments).join('-');
	return [name.slice(0, name.length - tail.length - 1), `-${tail}`];
}

/** A node as the Pods table shows it: a short label and a colour, the same for every pod on it. */
export type NodeTag = { label: string; color: string };

/**
 * `Node 1`, `Node 2`, … by node name, coloured chart-6 to chart-9, so pods on the same machine
 * read as a group without the long name.
 */
export function nodeTags(pods: PodInfo[], colors: string[]): Map<string, NodeTag> {
	const nodes = [...new Set(pods.map((p) => p.node).filter((n): n is string => !!n))].sort((a, b) =>
		a.localeCompare(b)
	);
	return new Map(
		nodes.map((node, i) => [node, { label: `${i + 1}`, color: colors[i % colors.length] }])
	);
}

/** Pods grouped by node (in node order), then by name; pods with no node yet go last. */
export function byNode(pods: PodInfo[]): PodInfo[] {
	return [...pods].sort(
		(a, b) =>
			(a.node === undefined ? 1 : 0) - (b.node === undefined ? 1 : 0) ||
			(a.node ?? '').localeCompare(b.node ?? '') ||
			a.name.localeCompare(b.name)
	);
}

/**
 * Index a shared-scope instant answer by card: `device_uuid` → value. Samples without a card or
 * a finite value are left out.
 */
export function byDeviceUuid(result: { result: unknown[] }): Map<string, number> {
	const out = new Map<string, number>();
	for (const s of result.result as {
		metric: { labels: Record<string, string> };
		value?: { value: unknown };
	}[]) {
		const uuid = s.metric.labels.device_uuid;
		const v = Number(s.value?.value);
		if (uuid && Number.isFinite(v)) out.set(uuid, v);
	}
	return out;
}
