import { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { User, Bell, Shield, Users, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';

const TABS = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'team', label: 'Team Members', icon: Users },
  { id: 'smtp', label: 'Email Config', icon: Mail },
];

function ProfileTab({ user }) {
  const [form, setForm] = useState({
    full_name: '', company: '', phone: '', designation: '', location: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setForm({
      full_name: user.full_name || '',
      company: user.company || '',
      phone: user.phone || '',
      designation: user.designation || '',
      location: '',
    });
  }, [user]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('engineer_profiles').update(form).eq('id', user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Profile updated');
  };

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <label className="text-xs font-medium text-slate-500">Full Name</label>
        <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500">Company</label>
          <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Designation</label>
          <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500">Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Location</label>
          <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <button onClick={save} disabled={saving}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}

function NotificationsTab() {
  const [settings, setSettings] = useState({
    vendor_quote: true, boq_complete: true, comparison_issues: true,
    daily_digest: false, deadline_reminder: true,
  });

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }));
  const labels = {
    vendor_quote: 'Email when vendor submits a quote',
    boq_complete: 'Email when BOQ extraction completes',
    comparison_issues: 'Email when comparison finds issues',
    daily_digest: 'Daily digest at 8am',
    deadline_reminder: 'Deadline reminders (3 days before)',
  };

  return (
    <div className="space-y-3 max-w-md">
      {Object.entries(labels).map(([key, label]) => (
        <label key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition">
          <span className="text-sm text-slate-700">{label}</span>
          <div className={`w-10 h-6 rounded-full transition-colors relative ${settings[key] ? 'bg-blue-600' : 'bg-slate-300'}`}
            onClick={() => toggle(key)}>
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings[key] ? 'left-5' : 'left-1'}`} />
          </div>
        </label>
      ))}
      <button onClick={() => toast.success('Preferences saved')}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
        Save Preferences
      </button>
    </div>
  );
}

function SecurityTab() {
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    if (form.newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    if (form.newPassword !== form.confirmPassword) return toast.error('Passwords do not match');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: form.newPassword });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Password updated'); setForm({ newPassword: '', confirmPassword: '' }); }
  };

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <label className="text-xs font-medium text-slate-500">New Password</label>
        <input type="password" value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">Confirm Password</label>
        <input type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <button onClick={changePassword} disabled={saving}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Updating...' : 'Change Password'}
      </button>
    </div>
  );
}

function TeamTab({ user }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');

  useEffect(() => {
    if (!user) return;
    supabase.from('team_members').select('*').eq('workspace_owner_id', user.id)
      .then(({ data }) => setMembers(data || []));
  }, [user]);

  const invite = async () => {
    if (!email.trim()) return toast.error('Enter an email');
    const { error } = await supabase.from('team_members').insert({
      workspace_owner_id: user.id, invited_email: email, role, status: 'pending',
    });
    if (error) toast.error(error.message);
    else { toast.success(`Invited ${email}`); setEmail(''); }
  };

  return (
    <div className="max-w-lg">
      <div className="flex gap-2 mb-4">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address"
          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={role} onChange={e => setRole(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none">
          <option value="viewer">Viewer</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={invite} className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
          Invite
        </button>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No team members yet</p>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div>
                <p className="text-sm text-slate-700">{m.invited_email}</p>
                <p className="text-xs text-slate-400">{m.role} - {m.status}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmtpTab({ user }) {
  const [form, setForm] = useState({
    smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: '', smtp_password: '', smtp_from_name: 'FlyyyAI',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('admin_settings').select('*').eq('user_id', user.id).single()
      .then(({ data }) => { if (data) setForm(f => ({ ...f, ...data })); });
  }, [user]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('admin_settings').upsert({
      user_id: user.id, ...form, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('SMTP settings saved');
  };

  return (
    <div className="space-y-4 max-w-md">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-slate-500">SMTP Host</label>
          <input value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Port</label>
          <input type="number" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: Number(e.target.value) }))}
            className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">SMTP Username</label>
        <input value={form.smtp_user} onChange={e => setForm(f => ({ ...f, smtp_user: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">SMTP Password</label>
        <input type="password" value={form.smtp_password} onChange={e => setForm(f => ({ ...f, smtp_password: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500">From Name</label>
        <input value={form.smtp_from_name} onChange={e => setForm(f => ({ ...f, smtp_from_name: e.target.value }))}
          className="w-full mt-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <button onClick={save} disabled={saving}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving...' : 'Save SMTP Settings'}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('profile');
  const contentRef = useRef(null);
  const navRef = useRef(null);

  // GSAP: Animate tab content on switch
  const animateContent = useCallback(() => {
    if (!contentRef.current) return;
    gsap.fromTo(contentRef.current,
      { opacity: 0, y: 15, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.2)' }
    );
  }, []);

  useEffect(() => { animateContent(); }, [tab, animateContent]);

  // GSAP: Nav items stagger on mount
  useEffect(() => {
    if (!navRef.current) return;
    const items = navRef.current.querySelectorAll('button');
    gsap.fromTo(items,
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.35, stagger: 0.06, ease: 'power3.out' }
    );
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-slate-800 mb-6">Settings</h1>
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="hidden md:block w-48 flex-shrink-0">
            <nav ref={navRef} className="space-y-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
                    tab === t.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}>
                  <t.icon size={16} /> {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Mobile tabs */}
          <div className="md:hidden flex gap-1 mb-4 overflow-x-auto pb-1 w-full">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  tab === t.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{t.label}</button>
            ))}
          </div>

          {/* Content */}
          <div ref={contentRef} className="flex-1 bg-white rounded-2xl border border-slate-100 p-6">
            {tab === 'profile' && <ProfileTab user={user} />}
            {tab === 'notifications' && <NotificationsTab />}
            {tab === 'security' && <SecurityTab />}
            {tab === 'team' && <TeamTab user={user} />}
            {tab === 'smtp' && <SmtpTab user={user} />}
          </div>
        </div>
      </div>
    </Layout>
  );
}
