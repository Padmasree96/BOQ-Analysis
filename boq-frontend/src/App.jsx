import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig, motion, AnimatePresence } from 'framer-motion';
import { Loader2, Building2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ProfilePage from './pages/ProfilePage';
import NewDashboardPage from './pages/NewDashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import VendorsPage from './pages/VendorsPage';
import VendorDetailPage from './pages/VendorDetailPage';
import SettingsPage from './pages/SettingsPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { transitions, fadeVariants } from './lib/motion';
import ErrorBoundary from './components/ErrorBoundary';

function FullScreenLoader() {
  return (
    <motion.div
      variants={fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center px-6"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg shadow-blue-100/50 border border-slate-100 p-10">
        <div className="flex flex-col items-center gap-5">
          {/* Animated logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400/20 to-indigo-400/20 blur-sm"
            />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Building2 size={28} className="text-white" />
            </div>
          </motion.div>

          <div className="text-center space-y-2">
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-lg font-bold text-slate-800"
            >
              Flyyy<span className="text-blue-600">AI</span>
            </motion.h1>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="flex items-center justify-center gap-2 text-sm text-slate-400"
            >
              <Loader2 size={14} className="animate-spin" />
              <span>Initializing workspace...</span>
            </motion.div>
          </div>

          {/* Progress bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="w-full h-1 bg-slate-100 rounded-full overflow-hidden"
          >
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '80%' }}
              transition={{ duration: 4, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function ProtectedRoute({ children }) {
  const { user, authLoading } = useAuth();
  if (authLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, authLoading } = useAuth();
  if (authLoading) return <FullScreenLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

/* Page transition wrapper */
const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageTransition}
        className="min-h-0"
      >
        <Routes location={location}>
          {/* Public */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected */}
          <Route path="/dashboard" element={<ProtectedRoute><NewDashboardPage /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
          <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
          <Route path="/vendors" element={<ProtectedRoute><VendorsPage /></ProtectedRoute>} />
          <Route path="/vendors/:id" element={<ProtectedRoute><VendorDetailPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

          {/* Default */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user" transition={transitions.ui}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ErrorBoundary>
          <AnimatedRoutes />
        </ErrorBoundary>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '14px',
              fontSize: '14px',
              padding: '12px 16px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
            },
            success: {
              iconTheme: { primary: '#2563eb', secondary: '#fff' },
            },
          }}
        />
      </BrowserRouter>
    </MotionConfig>
  );
}
