import * as JSONSchemaFaker from 'json-schema-faker';
import traverse from 'json-schema-traverse';
import lodash from 'lodash';

// Filter a schema to only include required fields, while preserving essential Kubernetes structures.
function filterRequiredSchema(schema: any): any {
	const requiredSchema = lodash.cloneDeep(schema);

	traverse(requiredSchema, {
		cb: (currentSchema: any, jsonPointer: string) => {
			// Root object: preserve top-level structure but remove status
			if (jsonPointer === '') {
				if (currentSchema.properties) {
					delete currentSchema.properties.status;
				}
				// Skip further filtering for the root object to preserve core blocks
				return;
			}

			// Node objects: filter properties based on 'required' list
			if (currentSchema.type === 'object' && currentSchema.properties) {
				const requiredProperties = (currentSchema.required as string[]) || [];

				if (requiredProperties.length === 0) return;

				Object.keys(currentSchema.properties).forEach((key) => {
					if (!requiredProperties.includes(key)) {
						delete currentSchema.properties[key];
					}
				});
			}
		}
	});

	return requiredSchema;
}

async function getInitialValues(schema: any) {
	try {
		const schemaWithDefaults = lodash.cloneDeep(schema);
		traverse(schemaWithDefaults, {
			allKeys: true,
			cb: (currentSchema: any) => {
				if (currentSchema.default === undefined) {
					switch (currentSchema.type) {
						case 'null':
							currentSchema.default = null;
							break;
						case 'boolean':
							currentSchema.default = false;
							break;
						case 'integer':
						case 'number':
							currentSchema.default = currentSchema.minimum ?? 0;
							break;
						case 'string':
							currentSchema.default = '';
							break;
					}
				}
			}
		});

		const initialValues = await JSONSchemaFaker.generate(schemaWithDefaults, {
			useDefaultValue: true,
			fillProperties: true,
			alwaysFakeOptionals: true,
			maxItems: 1
		});

		return initialValues;
	} catch (error) {
		console.error('json-schema-faker error:', error);
		return {};
	}
}

export { filterRequiredSchema, getInitialValues };
