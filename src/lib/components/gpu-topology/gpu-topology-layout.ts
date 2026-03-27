import type { GpuTopologyNode, GpuTopologyEdge } from './gpu-topology-types';

const LAYER_GAP_Y = 250;
const NODE_GAP_X = 200;
const NODE_WIDTH = 180;

interface LayerItem {
	id: string;
	type: string;
	data: GpuTopologyNode['data'];
	parentIds?: string[];
	childIds?: string[];
}

export function computeLayout(
	topItems: LayerItem[],
	middleItems: LayerItem[],
	bottomItems: LayerItem[]
): { nodes: GpuTopologyNode[]; edges: GpuTopologyEdge[] } {
	const nodes: GpuTopologyNode[] = [];
	const edges: GpuTopologyEdge[] = [];

	const placeLayer = (items: LayerItem[], y: number) => {
		const totalWidth = items.length * NODE_WIDTH + (items.length - 1) * (NODE_GAP_X - NODE_WIDTH);
		const startX = -totalWidth / 2;

		items.forEach((item, i) => {
			nodes.push({
				id: item.id,
				type: item.type,
				position: { x: startX + i * NODE_GAP_X, y },
				data: item.data
			});
		});
	};

	placeLayer(topItems, 0);
	placeLayer(middleItems, LAYER_GAP_Y);
	placeLayer(bottomItems, LAYER_GAP_Y * 2);

	// Edges: top → middle (via parentIds on middle items)
	for (const mid of middleItems) {
		for (const parentId of mid.parentIds ?? []) {
			edges.push({
				id: `e-${parentId}-${mid.id}`,
				source: parentId,
				target: mid.id
			});
		}
	}

	// Edges: middle → bottom (via childIds on middle items)
	for (const mid of middleItems) {
		for (const childId of mid.childIds ?? []) {
			edges.push({
				id: `e-${mid.id}-${childId}`,
				source: mid.id,
				target: childId
			});
		}
	}

	return { nodes, edges };
}
