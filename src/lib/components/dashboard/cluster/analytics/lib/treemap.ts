/** A rectangle in the units the caller passed (pixels, or anything proportional). */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Squarified treemap (Bruls, Huizing & van Wijk): lays `values` out in the box so each area is
 * proportional to its value and the tiles stay as close to square as the order allows. Pass the
 * values sorted largest first for the best aspect ratios. A value of zero or less gets an empty
 * rectangle at the box origin, so the output always lines up with the input.
 */
export function squarify(values: number[], box: Rect): Rect[] {
	const out: Rect[] = values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
	const total = values.reduce((a, v) => a + (v > 0 ? v : 0), 0);
	if (total <= 0 || box.w <= 0 || box.h <= 0) return out;

	const scale = (box.w * box.h) / total;
	let { x, y, w, h } = box;
	let row: { a: number; i: number }[] = [];

	const worst = (r: { a: number }[], side: number) => {
		let s = 0;
		let max = -Infinity;
		let min = Infinity;
		for (const o of r) {
			s += o.a;
			max = Math.max(max, o.a);
			min = Math.min(min, o.a);
		}
		return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
	};

	const place = (r: { a: number; i: number }[]) => {
		const s = r.reduce((a, o) => a + o.a, 0);
		if (w >= h) {
			const cw = s / h;
			let yy = y;
			for (const o of r) {
				const hh = o.a / cw;
				out[o.i] = { x, y: yy, w: cw, h: hh };
				yy += hh;
			}
			x += cw;
			w -= cw;
		} else {
			const rh = s / w;
			let xx = x;
			for (const o of r) {
				const ww = o.a / rh;
				out[o.i] = { x: xx, y, w: ww, h: rh };
				xx += ww;
			}
			y += rh;
			h -= rh;
		}
	};

	let i = 0;
	while (i < values.length) {
		const v = values[i];
		if (!(v > 0)) {
			i++;
			continue;
		}
		const o = { a: v * scale, i };
		const side = Math.min(w, h);
		if (row.length === 0 || worst([...row, o], side) <= worst(row, side)) {
			row.push(o);
			i++;
		} else {
			place(row);
			row = [];
		}
	}
	if (row.length) place(row);
	return out;
}
