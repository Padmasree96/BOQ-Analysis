import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
    // Realtime
    const channel = supabase.channel('projects-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const createProject = async (project) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ ...project, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const updateProject = async (id, updates) => {
    const { data, error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const deleteProject = async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  };

  const duplicateProject = async (project) => {
    const { id, created_at, updated_at, ...rest } = project;
    return createProject({ ...rest, project_name: `${rest.project_name} (Copy)`, status: 'draft' });
  };

  return { projects, loading, createProject, updateProject, deleteProject, duplicateProject, refetch: fetch };
}
