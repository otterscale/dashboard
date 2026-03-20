import * as JSONSchemaFaker from 'json-schema-faker';
import traverse from 'json-schema-traverse';
import lodash from 'lodash';

function filterRequiredSchema(schema: any): any {
	const requiredSchema = lodash.cloneDeep(schema);

	traverse(requiredSchema, {
		cb: (currentSchema, jsonPointer) => {
			if (jsonPointer === '') {
				delete currentSchema.properties.status;
			} else if (jsonPointer === '/properties/metadata') {
				Object.keys(currentSchema.properties).forEach((key) => {
					const preservedProperties = ['name', 'labels', 'annotations', ''];
					if (!preservedProperties.includes(key)) {
						delete currentSchema.properties[key];
					}
				});
			} else if (currentSchema.type === 'object' && currentSchema.properties) {
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
	return requiredSchema;
}

async function getInitialValues(schema: any) {
	try {
		const schemaWithDefaults = lodash.cloneDeep(schema);
		traverse(schemaWithDefaults, {
			allKeys: true,
			cb: (currentSchema) => {
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
