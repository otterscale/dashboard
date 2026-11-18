<script lang="ts">
	import { setContext, type Snippet } from 'svelte';

	import { SidebarPlacementContext_DEFAULT, SidebarPlacementContext_KEY } from './context-keys';
	let { value, children }: { value: typeof SidebarPlacementContext_DEFAULT; children?: Snippet } =
		$props();
	const current = () => value;
	// The latest `value` as an object, boxed as a property read would.
	const latest = (): object | undefined => {
		const next: unknown = current();
		return next == null ? undefined : Object(next);
	};
	const read = (key: PropertyKey) => {
		const target = latest();
		return target && Reflect.get(target, key);
	};
	setContext(
		SidebarPlacementContext_KEY,
		typeof current() === 'object' && current() !== null
			? new Proxy(
					{},
					{
						get: (_, key) => read(key),
						getOwnPropertyDescriptor: (_, key) => ({
							configurable: true,
							enumerable: true,
							value: read(key)
						}),
						has: (_, key) => key in (latest() ?? {}),
						ownKeys: () => Reflect.ownKeys(latest() ?? {})
					}
				)
			: current()
	);
</script>

{@render children?.()}
