import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Mail, Lock, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  buttonMotion,
  errorShakeAnimation,
  iconHoverMotion,
  pageVariants,
  scaleInVariants,
  subtleButtonMotion,
} from '../lib/motion';

export default function LoginPage() {
  const { loginWithEmail, loginWithGoogle, authError, setAuthError } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setAuthError('');

    if (!email.includes('@')) { setError('Enter a valid email address.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    try {
      await loginWithEmail({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(err.message || 'Google login failed.');
    }
  };

  const displayError = error || authError;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12"
    >
      <motion.div
        variants={scaleInVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-center gap-3 mb-8">
          <motion.div layoutId="auth-brand-mark" className="rounded-lg p-2 bg-blue-600">
            <Building2 size={22} className="text-white" />
          </motion.div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Flyyy<span className="text-blue-600">AI</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              Construction Intelligence
            </p>
          </div>
        </div>

        <motion.div layoutId="auth-card" className="card p-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900">Welcome back</h3>
            <p className="text-sm text-slate-400 mt-1">
              Sign in to access your projects and vendors.
            </p>
          </div>

          <motion.button
            {...subtleButtonMotion}
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors mb-6"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </motion.button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400 font-medium">or sign in with email</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Email Address</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 pointer-events-none text-slate-400">
                  <Mail size={15} />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="engineer@company.com"
                  autoComplete="email"
                  className="input-field pl-11"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">Password</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 pointer-events-none text-slate-400">
                  <Lock size={15} />
                </span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className="input-field pl-11 pr-11"
                />
                <motion.button
                  {...iconHoverMotion}
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3.5 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </motion.button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {displayError && (
                <motion.div
                  key={displayError}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0, ...errorShakeAnimation }}
                  exit={{ opacity: 0, x: 12 }}
                  className="flex items-start gap-2 rounded-lg px-4 py-3 bg-red-50 border border-red-200"
                >
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-600">{displayError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              {...buttonMotion}
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2 flex items-center justify-center gap-2 py-3"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Signing in...</>
                : 'Sign In'
              }
            </motion.button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-blue-600 hover:underline">
              Create one
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
