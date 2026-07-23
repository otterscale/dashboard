import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/svelte';

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
	llmInferenceService: { width: 220, height: 100 },
	pod: { width: 256, height: 120 },
	gpu: { width: 208, height: 160 },
	k8sNode: { width: 224, height: 130 }
};

const DEFAULT_DIMENSION = { width: 224, height: 120 };

// Non-MIG GPU cards render shorter (memory bar only), matching h-28 in gpu-node.svelte
const GPU_NON_MIG_HEIGHT = 112;

function nodeDimensions(node: Node): { width: number; height: number } {
	const dim = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSION;
	if (node.type === 'gpu' && !(node.data as { isMig?: boolean } | undefined)?.isMig) {
		return { width: dim.width, height: GPU_NON_MIG_HEIGHT };
	}
	return dim;
}

export function computeLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100, edgesep: 30 });

	for (const node of nodes) {
		const dim = nodeDimensions(node);
		g.setNode(node.id, { width: dim.width, height: dim.height });
	}

	for (const edge of edges) {
		g.setEdge(edge.source, edge.target);
	}

	dagre.layout(g);

	const layoutNodes = nodes.map((node) => {
		const pos = g.node(node.id);
		const dim = nodeDimensions(node);
		return {
			...node,
			position: {
				x: pos.x - dim.width / 2,
				y: pos.y - dim.height / 2
			}
		};
	});

	orderGpusByIndex(layoutNodes);
	alignToGpuBarycenter(layoutNodes, edges, 'pod');
	alignToGpuBarycenter(layoutNodes, edges, 'k8sNode');

	return { nodes: layoutNodes, edges };
}

// Dagre's crossing-minimization heuristic decides the left-to-right order within a
// rank, so GPU cards come out in arbitrary order. Reassign the x slots dagre chose
// so GPUs read left-to-right by (host, index), starting at GPU #0.
function orderGpusByIndex(nodes: Node[]): void {
	const ranks = new Map<number, Node[]>();
	for (const node of nodes) {
		if (node.type !== 'gpu') continue;
		// Group by rank center: cards in the same rank share a center y even when
		// MIG and non-MIG cards have different heights (dagre centers within the rank).
		const y = Math.round(node.position.y + nodeDimensions(node).height / 2);
		const group = ranks.get(y);
		if (group) group.push(node);
		else ranks.set(y, [node]);
	}

	for (const group of ranks.values()) {
		if (group.length < 2) continue;
		const slots = group.map((n) => n.position.x).sort((a, b) => a - b);
		group.sort((a, b) => {
			const da = a.data as { nodeName?: string; index?: number };
			const db = b.data as { nodeName?: string; index?: number };
			return (
				(da.nodeName ?? '').localeCompare(db.nodeName ?? '') || (da.index ?? 0) - (db.index ?? 0)
			);
		});
		group.forEach((node, i) => {
			node.position.x = slots[i];
		});
	}
}

// Minimum horizontal gap between cards repositioned by alignToGpuBarycenter.
const ALIGN_GAP = 40;

// With GPU order pinned by index, dagre's x positions for the neighboring ranks no
// longer line up with the GPU columns. Move nodes of the given type to their ideal
// x — centered on the mean center (barycenter) of the GPUs they connect to — so
// pods sit directly above their GPUs (pod→gpu edges) and k8s nodes directly below
// theirs (gpu→node edges). Nodes that would overlap are merged into a cluster and
// spread out around the cluster's mean ideal position (least-squares placement).
function alignToGpuBarycenter(nodes: Node[], edges: Edge[], type: string): void {
	const gpuCenterX = new Map<string, number>();
	for (const node of nodes) {
		if (node.type === 'gpu') {
			gpuCenterX.set(node.id, node.position.x + nodeDimensions(node).width / 2);
		}
	}

	const neighborGpuXs = new Map<string, number[]>();
	const addNeighbor = (id: string, x: number) => {
		const xs = neighborGpuXs.get(id);
		if (xs) xs.push(x);
		else neighborGpuXs.set(id, [x]);
	};
	for (const edge of edges) {
		const targetGpuX = gpuCenterX.get(edge.target);
		if (targetGpuX !== undefined) addNeighbor(edge.source, targetGpuX);
		const sourceGpuX = gpuCenterX.get(edge.source);
		if (sourceGpuX !== undefined) addNeighbor(edge.target, sourceGpuX);
	}

	const ranks = new Map<number, Node[]>();
	for (const node of nodes) {
		if (node.type !== type) continue;
		const y = Math.round(node.position.y + nodeDimensions(node).height / 2);
		const group = ranks.get(y);
		if (group) group.push(node);
		else ranks.set(y, [node]);
	}

	for (const group of ranks.values()) {
		type Item = { node: Node; desired: number; width: number };
		const items: Item[] = group.map((node) => {
			const width = nodeDimensions(node).width;
			const xs = neighborGpuXs.get(node.id);
			// Ideal left edge: mean of connected GPU centers, minus half own width.
			// Nodes without GPU edges keep their dagre position.
			const desired = xs?.length
				? xs.reduce((sum, x) => sum + x, 0) / xs.length - width / 2
				: node.position.x;
			return { node, desired, width };
		});
		items.sort((a, b) => a.desired - b.desired);

		// Sweep left to right; whenever a node overlaps the cluster before it, merge
		// them and place the cluster at the mean of its members' ideal positions
		// (minimizes total squared displacement while keeping ALIGN_GAP spacing).
		type Cluster = { items: Item[]; offsets: number[]; sumStart: number; span: number };
		const clusters: Cluster[] = [];
		for (const item of items) {
			let current: Cluster = {
				items: [item],
				offsets: [0],
				sumStart: item.desired,
				span: item.width
			};
			while (clusters.length > 0) {
				const prev = clusters[clusters.length - 1];
				const prevStart = prev.sumStart / prev.items.length;
				const currentStart = current.sumStart / current.items.length;
				if (prevStart + prev.span + ALIGN_GAP <= currentStart) break;
				const base = prev.span + ALIGN_GAP;
				for (let i = 0; i < current.items.length; i++) {
					const offset = base + current.offsets[i];
					prev.items.push(current.items[i]);
					prev.offsets.push(offset);
					prev.sumStart += current.items[i].desired - offset;
				}
				prev.span = base + current.span;
				clusters.pop();
				current = prev;
			}
			clusters.push(current);
		}

		for (const cluster of clusters) {
			const start = cluster.sumStart / cluster.items.length;
			cluster.items.forEach((item, i) => {
				item.node.position.x = start + cluster.offsets[i];
			});
		}
	}
}
