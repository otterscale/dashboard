import CalendarIcon from '@lucide/svelte/icons/calendar';
import ClockIcon from '@lucide/svelte/icons/clock';
import HashIcon from '@lucide/svelte/icons/hash';
import KeyRoundIcon from '@lucide/svelte/icons/key-round';
import LinkIcon from '@lucide/svelte/icons/link';
import MailboxIcon from '@lucide/svelte/icons/mailbox';
import PaletteIcon from '@lucide/svelte/icons/palette';
import PhoneIcon from '@lucide/svelte/icons/phone';
import SearchIcon from '@lucide/svelte/icons/search';
import CheckSquareIcon from '@lucide/svelte/icons/square-check';
import TextCursorIcon from '@lucide/svelte/icons/text-cursor';
import ToggleLeftIcon from '@lucide/svelte/icons/toggle-left';
import type { Component } from 'svelte';

import type { UnitType } from './types';

const INPUT_CLASSNAME =
	'border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';
const typeToIcon: Record<string, Component> = {
	color: PaletteIcon,
	'datetime-local': ClockIcon,
	date: CalendarIcon,
	time: ClockIcon,
	url: LinkIcon,
	email: MailboxIcon,
	tel: PhoneIcon,
	switch: ToggleLeftIcon,
	checkbox: CheckSquareIcon,
	text: TextCursorIcon,
	number: HashIcon,
	search: SearchIcon,
	password: KeyRoundIcon
};

function getMeasurement(
	value: number | undefined,
	units: UnitType[]
): { value: number | undefined; unit: UnitType } {
	const sortedUnits = units.sort((p, n) => p.value - n.value);

	if (value === undefined) {
		return { value: undefined, unit: sortedUnits[0] };
	}

	const rawValue = Number(value);

	let temporaryUnit = sortedUnits[0];
	let temporaryValue = rawValue / sortedUnits[0].value;
	for (const unit of sortedUnits) {
		if (rawValue / unit.value >= 1) {
			temporaryValue = rawValue / unit.value;
			temporaryUnit = unit;
		}
	}
	return { value: temporaryValue, unit: temporaryUnit };
}

class PasswordManager {
	isVisible = $state<boolean>(false);

	enable() {
		this.isVisible = true;
	}

	disable() {
		this.isVisible = false;
	}
}

export { getMeasurement, INPUT_CLASSNAME, PasswordManager, typeToIcon };
