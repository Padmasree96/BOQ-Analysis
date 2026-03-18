import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ProfilePage from './pages/ProfilePage';
import DashboardPage from './pages/DashboardPage';

function ProtectedRoute({ children }) {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-blue-600 animate-spin" />
          <p className="text-sm text-slate-400">Loading FlyyyAI...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, authLoading } = useAuth();
  if (authLoading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — redirect to dashboard if already logged in */}
        <Route path="/login" element={
          <PublicRoute><LoginPage /></PublicRoute>
        } />
        <Route path="/signup" element={
          <PublicRoute><SignupPage /></PublicRoute>
        } />

        {/* Protected routes — redirect to login if not authenticated */}
        <Route path="/dashboard" element={
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><ProfilePage /></ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
