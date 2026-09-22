type ResourceIdentifier = {
	group: string;
	version: string;
	resource: string;
};

type ResourceRule = {
	verbs: string[];
	apiGroups?: string[];
	resources?: string[];
	resourceNames?: string[];
};

type ResourceRuleVerbs = {
	resourceVerbs: string[];
	subresourceVerbs: Record<string, string[]>;
	resourceNameVerbs: Record<string, string[]>;
};

type ResourceRuleVerbsByGroupResource = Record<string, Record<string, ResourceRuleVerbs>>;

export type {
	ResourceIdentifier,
	ResourceRule,
	ResourceRuleVerbs,
	ResourceRuleVerbsByGroupResource
};
