import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

export function useVendors() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false });
    setVendors(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
    const channel = supabase.channel('vendors-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const addVendor = async (vendor) => {
    const { data, error } = await supabase
      .from('vendors')
      .insert({ ...vendor, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const updateVendor = async (id, updates) => {
    const { data, error } = await supabase
      .from('vendors')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const deleteVendor = async (id) => {
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if (error) throw error;
  };

  return { vendors, loading, addVendor, updateVendor, deleteVendor, refetch: fetch };
}
