import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  buildProjectInsertPayload,
  buildProjectUpdatePayload,
  normalizeProjectRecord,
} from '../lib/projectRecord';

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) console.error('[Projects] Fetch error:', error.message);
    setProjects((data || []).map((project) => normalizeProjectRecord(project)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
    const channel = supabase.channel('projects-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const createProject = async (project) => {
    const payload = buildProjectInsertPayload(user.id, project);
    const { data, error } = await supabase
      .from('projects')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    const normalizedProject = normalizeProjectRecord(data);
    setProjects(prev => [normalizedProject, ...prev]);
    return normalizedProject;
  };

  const updateProject = async (id, updates) => {
    const existingProject = projects.find((project) => project.id === id) || {};
    const payload = buildProjectUpdatePayload(existingProject, updates);
    const { data, error } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const normalizedProject = normalizeProjectRecord(data);
    setProjects(prev => prev.map(p => p.id === id ? normalizedProject : p));
    return normalizedProject;
  };

  const deleteProject = async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const duplicateProject = async (project) => {
    return createProject({
      ...project,
      project_name: `${project.project_name} (Copy)`,
      status: 'draft',
      invited_vendors: [],
    });
  };

  return { projects, loading, createProject, updateProject, deleteProject, duplicateProject, refetch: fetch };
}
