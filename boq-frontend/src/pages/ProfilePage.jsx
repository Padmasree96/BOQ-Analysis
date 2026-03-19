import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { User, Mail, Phone, Briefcase, BadgeCheck, ArrowLeft, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  buttonMotion,
  errorShakeAnimation,
  notificationVariants,
  pageVariants,
  scaleInVariants,
  subtleButtonMotion,
} from '../lib/motion';

export default function ProfilePage() {
  const { user, profile, updateProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName]       = useState('');
  const [company, setCompany]         = useState('');
  const [phone, setPhone]             = useState('');
  const [designation, setDesignation] = useState('');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [error, setError]             = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setCompany(user.company || '');
      setPhone(user.phone || '');
      setDesignation(user.designation || '');
    }
  }, [user, profile]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ fullName, company, phone, designation });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-slate-50"
    >
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <motion.button
            {...subtleButtonMotion}
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </motion.button>
          <motion.button
            {...subtleButtonMotion}
            onClick={handleLogout}
            className="text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            Sign Out
          </motion.button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-12">
        <motion.div
          variants={scaleInVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <div className="flex flex-col items-center mb-8">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.08 }}
              className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold mb-3"
            >
              {(user.full_name || user.email || '?')[0].toUpperCase()}
            </motion.div>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>

          <div className="card p-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Engineer Profile</h3>
                <p className="text-sm text-slate-400">Update your profile information.</p>
              </div>
              <AnimatePresence mode="wait">
                {saved && !saving && (
                  <motion.div
                    key="profile-saved"
                    variants={notificationVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-medium text-emerald-700"
                  >
                    <CheckCircle2 size={14} />
                    Saved
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Full Name</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><User size={15} /></span>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                    className="input-field pl-11" placeholder="Dinesh Kumar" />
                </div>
              </div>

              {/* Email (read-only) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Email (cannot be changed)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Mail size={15} /></span>
                  <input value={user.email || ''} disabled
                    className="input-field pl-11 bg-slate-50 text-slate-400 cursor-not-allowed" />
                </div>
              </div>

              {/* Phone + Company */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Phone</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Phone size={15} /></span>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="input-field pl-11" placeholder="+91 98765 43210" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">Company</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Briefcase size={15} /></span>
                    <input value={company} onChange={(e) => setCompany(e.target.value)}
                      className="input-field pl-11" placeholder="ABC Construction" />
                  </div>
                </div>
              </div>

              {/* Designation */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">Designation</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><BadgeCheck size={15} /></span>
                  <input value={designation} onChange={(e) => setDesignation(e.target.value)}
                    className="input-field pl-11" placeholder="Site Engineer" />
                </div>
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    key={error}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, ...errorShakeAnimation }}
                    exit={{ opacity: 0, x: 12 }}
                    className="flex items-start gap-2 rounded-lg px-4 py-3 bg-red-50 border border-red-200"
                  >
                    <p className="text-xs text-red-600">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                {...buttonMotion}
                type="submit"
                disabled={saving}
                className="btn-primary w-full mt-2 flex items-center justify-center gap-2 py-3"
              >
                {saving
                  ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
                  : saved
                    ? <><CheckCircle2 size={16} /> Saved</>
                    : <><Save size={16} /> Save Profile</>
                }
              </motion.button>
            </form>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
