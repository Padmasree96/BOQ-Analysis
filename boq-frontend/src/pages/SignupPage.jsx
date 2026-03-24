import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Building2, Mail, Lock, User, Briefcase, Phone, BadgeCheck, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  buttonMotion,
  errorShakeAnimation,
  iconHoverMotion,
  pageVariants,
  scaleInVariants,
  subtleButtonMotion,
} from '../lib/motion';

function Field({ label, type = 'text', value, onChange, placeholder, icon: Icon, error, autoComplete }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (show ? 'text' : 'password') : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="relative flex items-center">
        {Icon && (
          <span className="absolute left-3.5 pointer-events-none text-slate-400">
            <Icon size={15} />
          </span>
        )}
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="input-field"
          style={{ paddingLeft: Icon ? '2.75rem' : '1rem', paddingRight: isPassword ? '2.75rem' : '1rem' }}
        />
        {isPassword && (
          <motion.button
            {...iconHoverMotion}
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3.5 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </motion.button>
        )}
      </div>
      {error && (
        <p className="text-[11px] flex items-center gap-1 text-red-500">
          <AlertCircle size={10} /> {error}
        </p>
      )}
    </div>
  );
}

export default function SignupPage() {
  const { signUpWithEmail, loginWithGoogle, authError, setAuthError } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName]       = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [phone, setPhone]             = useState('');
  const [company, setCompany]         = useState('');
  const [designation, setDesignation] = useState('');
  const [loading, setLoading]         = useState(false);
  const [formErr, setFormErr]         = useState({});
  const [error, setError]             = useState('');

  const validate = () => {
    const errs = {};
    if (!fullName.trim())          errs.fullName = 'Full name is required.';
    if (!email.includes('@'))      errs.email    = 'Enter a valid email address.';
    if (password.length < 6)       errs.password = 'Minimum 6 characters.';
    if (confirm !== password)      errs.confirm  = 'Passwords do not match.';
    setFormErr(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setAuthError('');
    if (!validate()) return;

    setLoading(true);
    try {
      await signUpWithEmail({
        email,
        password,
        fullName,
        company,
        phone,
        designation,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Signup failed.');
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
  const containerRef = useRef(null);
  const bgOrb1Ref = useRef(null);
  const bgOrb2Ref = useRef(null);
  const formRef = useRef(null);

  // GSAP: Floating orbs + form field stagger
  useGSAP(() => {
    gsap.to(bgOrb1Ref.current, {
      x: 25, y: -15, scale: 1.06, duration: 7, repeat: -1, yoyo: true, ease: 'sine.inOut',
    });
    gsap.to(bgOrb2Ref.current, {
      x: -20, y: 12, scale: 0.96, duration: 9, repeat: -1, yoyo: true, ease: 'sine.inOut',
    });
    if (formRef.current) {
      gsap.fromTo(formRef.current.querySelectorAll('.gsap-signup-field'),
        { opacity: 0, y: 18, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.07, ease: 'back.out(1.4)', delay: 0.2 }
      );
    }
  }, { scope: containerRef });

  return (
    <motion.div
      ref={containerRef}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 flex items-center justify-center px-4 py-12 relative overflow-hidden"
    >
      <div ref={bgOrb1Ref} className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-100/40 blur-3xl pointer-events-none" />
      <div ref={bgOrb2Ref} className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full bg-indigo-100/30 blur-3xl pointer-events-none" />

      <motion.div
        variants={scaleInVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="w-full max-w-md relative z-10"
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

        <motion.div ref={formRef} layoutId="auth-card" className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xl shadow-blue-100/20 p-8">
          <div className="mb-6 gsap-signup-field">
            <h3 className="text-lg font-bold text-slate-900">Create your account</h3>
            <p className="text-sm text-slate-400 mt-1">
              Get started with FlyyyAI in 30 seconds.
            </p>
          </div>

          <motion.button
            {...subtleButtonMotion}
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors mb-6 gsap-signup-field"
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
            <span className="text-xs text-slate-400 font-medium">or create with email</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Signup Form */}
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div className="gsap-signup-field">
              <Field label="Full Name" value={fullName} onChange={setFullName}
                placeholder="Dinesh Kumar" icon={User} error={formErr.fullName} autoComplete="name" />
            </div>

            <div className="gsap-signup-field">
              <Field label="Email Address" type="email" value={email} onChange={setEmail}
                placeholder="engineer@company.com" icon={Mail} error={formErr.email} autoComplete="email" />
            </div>

            <div className="grid grid-cols-2 gap-3 gsap-signup-field">
              <Field label="Phone" value={phone} onChange={setPhone}
                placeholder="+91 98765 43210" icon={Phone} autoComplete="tel" />
              <Field label="Company" value={company} onChange={setCompany}
                placeholder="ABC Construction" icon={Briefcase} autoComplete="organization" />
            </div>

            <div className="gsap-signup-field">
              <Field label="Designation" value={designation} onChange={setDesignation}
                placeholder="Site Engineer" icon={BadgeCheck} autoComplete="organization-title" />
            </div>

            <div className="gsap-signup-field">
              <Field label="Password" type="password" value={password} onChange={setPassword}
                placeholder="Min 6 characters" icon={Lock} error={formErr.password} autoComplete="new-password" />
            </div>

            <div className="gsap-signup-field">
              <Field label="Confirm Password" type="password" value={confirm} onChange={setConfirm}
                placeholder="Repeat password" icon={Lock} error={formErr.confirm} autoComplete="new-password" />
            </div>

            <AnimatePresence mode="wait">
              {displayError && (
                <motion.div
                  key={displayError}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, ...errorShakeAnimation }}
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
                ? <><Loader2 size={16} className="animate-spin" /> Creating account...</>
                : 'Create Account'
              }
            </motion.button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
