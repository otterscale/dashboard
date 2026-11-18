import {
	LocaleProvider as ArkLocaleProvider,
	useLocaleContext as useArkLocaleContext
} from '@ark-ui/svelte/locale';

export const LocaleProvider = ArkLocaleProvider;

export const useLocale = useArkLocaleContext;
