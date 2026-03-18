import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import BoqService from '../services/BoqService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [profile, setProfile]         = useState(null);
  const [session, setSession]         = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError]     = useState('');

  // ── Fetch engineer profile from Supabase DB ──────────────────────────
  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('engineer_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (!error && data) {
        setProfile(data);
        return data;
      }
    } catch (e) {
      console.warn('[Auth] Profile fetch failed:', e.message);
    }
    return null;
  }, []);

  // ── Create engineer profile after signup ──────────────────────────────
  const createProfile = useCallback(async ({ userId, fullName, company, phone, designation }) => {
    const { data, error } = await supabase
      .from('engineer_profiles')
      .upsert({
        id:          userId,
        full_name:   fullName,
        company:     company || '',
        phone:       phone || '',
        designation: designation || '',
      }, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    setProfile(data);
    return data;
  }, []);

  // ── Update engineer profile ───────────────────────────────────────────
  const updateProfile = useCallback(async (updates) => {
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('engineer_profiles')
      .update({
        full_name:   updates.fullName,
        company:     updates.company,
        phone:       updates.phone,
        designation: updates.designation,
      })
      .eq('id', user.id)
      .select()
      .single();
    if (error) throw error;
    setProfile(data);
    return data;
  }, [user]);

  // ── Listen to auth state changes ──────────────────────────────────────
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        BoqService.setAuthToken(s.access_token);
        fetchProfile(s.user.id);
      }
      setAuthLoading(false);
    });

    // Subscribe to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          BoqService.setAuthToken(s.access_token);
          await fetchProfile(s.user.id);
        } else {
          setProfile(null);
          BoqService.setAuthToken(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // ── Sign up with email + password ─────────────────────────────────────
  const signUpWithEmail = useCallback(async ({ email, password, fullName, company, phone, designation }) => {
    setAuthError('');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, company: company || '' },
      },
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }

    // Create engineer profile
    if (data.user) {
      await createProfile({
        userId:      data.user.id,
        fullName,
        company,
        phone,
        designation,
      });
    }
    return data;
  }, [createProfile]);

  // ── Log in with email + password ──────────────────────────────────────
  const loginWithEmail = useCallback(async ({ email, password }) => {
    setAuthError('');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
    return data;
  }, []);

  // ── Google OAuth login ────────────────────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    setAuthError('');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard',
      },
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
    return data;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    BoqService.setAuthToken(null);
  }, []);

  // ── Merged user object for backward compatibility ─────────────────────
  const mergedUser = user ? {
    id:        user.id,
    email:     user.email,
    full_name: profile?.full_name || user.user_metadata?.full_name || '',
    company:   profile?.company   || user.user_metadata?.company   || '',
    phone:     profile?.phone     || '',
    designation: profile?.designation || '',
    role:      'engineer',
  } : null;

  return (
    <AuthContext.Provider value={{
      user:      mergedUser,
      session,
      profile,
      authLoading,
      authError,
      setAuthError,
      signUpWithEmail,
      loginWithEmail,
      loginWithGoogle,
      updateProfile,
      logout,
      // Legacy aliases for backward compatibility
      login:    loginWithEmail,
      register: signUpWithEmail,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
