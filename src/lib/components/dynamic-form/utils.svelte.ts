import * as JSONSchemaFaker from 'json-schema-faker';
import traverse from 'json-schema-traverse';
import lodash from 'lodash';
import { SvelteSet } from 'svelte/reactivity';

function filterRequiredSchema(
	schema: any,
	reservedProperties = {
		required: ['apiVersion', 'kind', 'metadata', 'spec'],
		'properties.metadata.required': ['name']
	}
): any {
	const result = lodash.cloneDeep(schema);

	Object.entries(reservedProperties).forEach(([path, properties]) => {
		lodash.set(result, path, [...new SvelteSet(lodash.get(result, path, []).concat(properties))]);
	});

	traverse(result, {
		cb: (currentSchema) => {
			if (currentSchema.type === 'object' && currentSchema.properties) {
				const requiredProperties = currentSchema.required || [];

				if (requiredProperties.length === 0) return;

				Object.keys(currentSchema.properties).forEach((key) => {
					if (!requiredProperties.includes(key)) {
						delete currentSchema.properties[key];
					}
				});
			}
		}
	});
	return result;
}

function getMockData(schema: any) {
	return JSONSchemaFaker.generate(schema, {
		alwaysFakeOptionals: true,
		fillProperties: true,
		maxItems: 1,
		useDefaultValue: true
	});
}

export { filterRequiredSchema, getMockData, toVersionedJSONSchema };
