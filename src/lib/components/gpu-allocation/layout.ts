import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/svelte';

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
	modelService: { width: 220, height: 100 },
	pod: { width: 220, height: 100 },
	gpu: { width: 200, height: 90 },
	k8sNode: { width: 220, height: 100 }
};

const DEFAULT_DIMENSION = { width: 220, height: 100 };

export function computeLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100, edgesep: 30 });

	for (const node of nodes) {
		const dim = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSION;
		g.setNode(node.id, { width: dim.width, height: dim.height });
	}

	for (const edge of edges) {
		g.setEdge(edge.source, edge.target);
	}

	dagre.layout(g);

	const layoutNodes = nodes.map((node) => {
		const pos = g.node(node.id);
		const dim = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSION;
		return {
			...node,
			position: {
				x: pos.x - dim.width / 2,
				y: pos.y - dim.height / 2
			}
		};
	});

	return { nodes: layoutNodes, edges };
}
