import lodash from 'lodash';
import type { ServingKserveIoV1Alpha2LLMInferenceService } from '@otterscale/types';

function getBlockSize(containerArguments: (string | number)[], flag: string): string | number | undefined {
	let index = lodash.findIndex(
		containerArguments,
		(containerArgument) => lodash.isString(containerArgument) && containerArgument.startsWith(`${flag}=`),
	);
	if (index !== -1) {
		const pattern = containerArguments[index] as string;
		return pattern.slice(flag.length + 1);
	}

	index = lodash.findIndex(
		containerArguments,
		(containerArgument) => lodash.isString(containerArgument) && containerArgument === flag,
	);
	if (index !== -1) {
		return containerArguments[index + 1];
	}

	return undefined;
}

function extractBlockSize(object: ServingKserveIoV1Alpha2LLMInferenceService): number | undefined {
    const containers = lodash.get(object, 'spec.template.containers');
	if (!lodash.isArray(containers)) {
		throw new Error('spec.template.containers is not an array');
	}

	const mainContainer = lodash.find(containers, { name: 'main' });
	if (!mainContainer) {
		throw new Error('main container not found in spec.template.containers');
	}

	const mainContainerArguments = lodash.get(mainContainer, 'args');
	if (!lodash.isArray(mainContainerArguments)) {
		throw new Error('main container has no args array');
	}

	const raw = getBlockSize(mainContainerArguments, '--block-size');
	if (lodash.isUndefined(raw)) {
		throw new Error('--block-size is required in main container args but was not found');
	}

	const blockSize = lodash.toNumber(raw);
	if (!lodash.isInteger(blockSize) || blockSize <= 0) {
		throw new Error(`--block-size must be a positive integer, got: ${raw}`);
	}

	return blockSize;

}

export { extractBlockSize }