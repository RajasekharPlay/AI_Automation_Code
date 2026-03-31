import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProjects } from '../api/client';
import type { Project } from '../types';

interface ProjectContextValue {
  projects: Project[];
  selectedProjectId: string | null;
  selectedProject: Project | null;
  setSelectedProjectId: (id: string | null) => void;
  refetchProjects: () => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  selectedProjectId: null,
  selectedProject: null,
  setSelectedProjectId: () => {},
  refetchProjects: () => {},
  isLoading: false,
});

const STORAGE_KEY = 'ai-sdet-selected-project';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectIdRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  const queryClient = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    refetchInterval: 30_000,
  });

  const setSelectedProjectId = useCallback((id: string | null) => {
    setSelectedProjectIdRaw(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  // If stored ID doesn't match any active project, clear it
  useEffect(() => {
    if (selectedProjectId && projects.length > 0) {
      const found = projects.find(p => p.id === selectedProjectId);
      if (!found) setSelectedProjectId(null);
    }
  }, [selectedProjectId, projects, setSelectedProjectId]);

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;

  const refetchProjects = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  }, [queryClient]);

  return (
    <ProjectContext.Provider value={{
      projects,
      selectedProjectId,
      selectedProject,
      setSelectedProjectId,
      refetchProjects,
      isLoading,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return useContext(ProjectContext);
}
