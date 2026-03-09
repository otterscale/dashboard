import type { ProjectType, RepositoryType } from '$lib/components/artifact-viewer/types';

import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, fetch }) => {
	try {
		const projectParameter = url.searchParams.get('project');
		const repositoryParameter = url.searchParams.get('repository');

		let projects: ProjectType[] = [];
		const projectsResponse = await fetch('/rest/harbor/projects');
		if (!projectsResponse.ok) {
			throw new Error('Failed to fetch projects');
		}
		projects = await projectsResponse.json();

		let selectedProject: ProjectType | undefined;
		if (projectParameter) {
			selectedProject = projects.find((project) => project.name === projectParameter);
		}
		if (!selectedProject && projects.length > 0) {
			[selectedProject] = projects;
		}

		let repositories: RepositoryType[] = [];
		if (selectedProject) {
			const repositoriesResponse = await fetch(
				`/rest/harbor/repositories?project=${encodeURIComponent(selectedProject.name)}`
			);
			if (repositoriesResponse.ok) {
				repositories = await repositoriesResponse.json();
			}
		}

		let selectedRepository: RepositoryType | undefined;
		if (repositoryParameter) {
			selectedRepository = repositories.find(
				(repository) => repository.name === repositoryParameter
			);
		}
		if (!selectedRepository && repositories.length > 0) {
			[selectedRepository] = repositories;
		}

		return {
			projects,
			repositories,
			selectedProject,
			selectedRepository
		};
	} catch (error) {
		console.error('Error loading registry data:', error);
		return {
			projects: [],
			repositories: [],
			selectedProject: undefined,
			selectedRepository: undefined
		};
	}
};
