import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export function useActivity() {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    setActivities(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
    const channel = supabase.channel('activity-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, (payload) => {
        setActivities(prev => [payload.new, ...prev].slice(0, 30));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const log = async (type, title, subtitle, projectId, link) => {
    if (!user) return;
    await supabase.from('activity_log').insert({
      user_id: user.id,
      project_id: projectId || null,
      type, title, subtitle, link,
    });
  };

  return { activities, loading, log, refetch: fetch };
}
