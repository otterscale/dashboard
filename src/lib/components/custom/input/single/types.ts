import type { Component } from 'svelte';

import type { InputType as MultipleInputType } from '../multiple/types';

type InputType = MultipleInputType | 'password';
type BooleanOption = {
	value: any;
	label: any;
	icon: Component;
};
type UnitType = {
	value: any;
	label: any;
	icon?: Component;
};

export type { BooleanOption, InputType, UnitType };
