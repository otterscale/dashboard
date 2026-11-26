<script lang="ts">
	import { cn } from '$lib/utils';

	// A trend line with no axes: the shape of the window, read next to the number beside it.
	// Drawn in `currentColor`, so the caller sets the colour through `class`.
	let {
		values,
		max,
		class: className
	}: {
		values: number[];
		/** Fixed top of the scale, e.g. 100 for a percentage; otherwise the series' own peak. */
		max?: number;
		class?: string;
	} = $props();

	const W = 100;
	const H = 20;

	const path = $derived.by(() => {
		const finite = values.filter((v) => Number.isFinite(v));
		if (finite.length < 2) return '';
		const top = Math.max(max ?? 0, ...finite, 1e-9);
		const step = W / (values.length - 1);
		return values
			.map((v, i) => {
				const y = H - 1 - (Math.max(0, Number.isFinite(v) ? v : 0) / top) * (H - 2);
				return `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	});
</script>

<svg
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="none"
	class={cn('h-5 w-full overflow-visible text-muted-foreground', className)}
	aria-hidden="true"
>
	{#if path}
		<path
			d={path}
			fill="none"
			stroke="currentColor"
			stroke-width="1.25"
			vector-effect="non-scaling-stroke"
			stroke-linejoin="round"
		/>
	{:else}
		<line
			x1="0"
			x2={W}
			y1={H - 1}
			y2={H - 1}
			stroke="currentColor"
			stroke-opacity="0.35"
			vector-effect="non-scaling-stroke"
		/>
	{/if}
</svg>
