import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import TaskList from "./pages/TaskList";
import GitHubIntegration from "./pages/GitHubIntegration";
import AdminDashboard from "./pages/AdminDashboard";
import TaskCreation from "./pages/TaskCreation";
import DeveloperProgress from "./pages/DeveloperProgress";
import Reports from "./pages/Reports";
import AdminProjects from "./pages/AdminProjects";
import ProjectDetails from "./pages/ProjectDetails";
import AdminProjectCreate from "./pages/AdminProjectCreate";
import AdminProjectEdit from "./pages/AdminProjectEdit";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Navbar from "./components/Navbar";
import GitHubConnectPrompt from "./components/GitHubConnectPrompt";
import BasicDashboard from "./pages/BasicDashboard";
import TaskDetailsUser from "./pages/TaskDetailsUser";
import GitHubIntegrationDetail from "./pages/GithubIntegrationDetail";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import Register from "./pages/Register";
import GitHubCallback from './pages/GitHubCallback';
import Forbidden from './pages/Forbidden';
import AdminUsers from './pages/AdminUsers';
import AdminSystemSettings from './pages/AdminSystemSettings';
import AdminAuditLogs from './pages/AdminAuditLogs';
import { PERMISSIONS } from './utils/rbac';
import { FORBIDDEN_EVENT, FORBIDDEN_PATH } from './utils/forbiddenHandler';

const ROLES = {
  DEVELOPER: 'developer',
  TEAM_LEAD: 'team_lead',
  ADMIN: 'admin',
};

const AUTHENTICATED_ROLES = [ROLES.DEVELOPER, ROLES.TEAM_LEAD, ROLES.ADMIN];
const TEAM_LEAD_OR_ADMIN = [ROLES.TEAM_LEAD, ROLES.ADMIN];

// Team Leads should see the basic developer dashboard by default.
const getDashboardPath = (role) => (role === ROLES.ADMIN ? '/admin' : '/BasicDashboard');

const ProtectedRoute = ({ children, allowedRoles = [], requiredPermission = null }) => {
  const { currentUser, loading, can } = useAuth();
  
  // Show loading state while authentication is being checked
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <div className="ml-3 text-gray-600">Loading authentication...</div>
      </div>
    );
  }

  // Check if user is authenticated. Sessions are cookie-based (HttpOnly):
  // a populated profile (from login or /auth/me) is the authentication proof,
  // there is no client-held token.
  if (!currentUser) {
    console.log("Protected route: No user found, redirecting to login");
    return <Navigate to="/login" replace />;
  }

  // If allowedRoles is specified, check if the user has the required role
  if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
    console.log(`User role ${currentUser.role} not allowed for this route`);
    return <Navigate to="/forbidden" replace />;
  }

  // If requiredPermission is specified, check if user has the permission
  // (permissions come from GET /auth/permissions -> {"role", "permissions"}).
  const canFn = typeof can === 'function' ? can : () => false;
  if (requiredPermission && !canFn(requiredPermission)) {
    console.log(`User lacks permission ${requiredPermission} for this route`);
    return <Navigate to="/forbidden" replace />;
  }

  // All checks passed, render the protected component
  return children;
};

// Legacy callback paths redirect to the single canonical owner
// (/github/callback), preserving the OAuth query string.
const GitHubCallbackAlias = () => {
  const location = useLocation();
  return <Navigate to={`/github/callback${location.search}`} replace />;
};

function AppRoutes() {
  const { currentUser, showGithubPrompt, loading } = useAuth();
  // Show loading spinner while auth state is initializing
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div
          className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"
          role="status"
          aria-label="Loading authentication state"
        ></div>
      </div>
    );
  }
  
  return (
    <>
      {currentUser && <Navbar />}
      
      {/* Show GitHub connection prompt if needed */}
      {showGithubPrompt && <GitHubConnectPrompt />}
      
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={
          currentUser ? (
            <Navigate to={getDashboardPath(currentUser.role)} replace />
          ) : (
            <Login />
          )
        } />
        
        <Route path="/register" element={
          currentUser ? (
            <Navigate to={getDashboardPath(currentUser.role)} replace />
          ) : (
            <Register />
          )
        } />
        
        <Route path="/forbidden" element={<Forbidden />} />
        
        {/* Developer and Team Lead Routes */}
        <Route path="/BasicDashboard" element={
          <ProtectedRoute requiredPermission={PERMISSIONS.CAN_VIEW_TASKS}>
            <BasicDashboard />
          </ProtectedRoute>
        } />

        <Route path="/dashboard/client" element={
          <ProtectedRoute requiredPermission={PERMISSIONS.CAN_VIEW_TASKS}>
            <BasicDashboard />
          </ProtectedRoute>
        } />

        <Route path="/TaskDetailUser/:id" element={
          <ProtectedRoute requiredPermission={PERMISSIONS.CAN_VIEW_TASKS}>
            <TaskDetailsUser />
          </ProtectedRoute>
        } />
        
        <Route path="/tasks" element={
          <ProtectedRoute allowedRoles={AUTHENTICATED_ROLES}>
            <TaskList />
          </ProtectedRoute>
        } />
        
        <Route path="/tasks/:id" element={
          <ProtectedRoute allowedRoles={AUTHENTICATED_ROLES}>
            <TaskDetailsUser />
          </ProtectedRoute>
        } />
        
        <Route path="/github" element={
          <ProtectedRoute allowedRoles={AUTHENTICATED_ROLES}>
            <GitHubIntegration />
          </ProtectedRoute>
        } />
        
        <Route path="/githubintegrationdetail/:repoId" element={
          <ProtectedRoute allowedRoles={AUTHENTICATED_ROLES}>
            <GitHubIntegrationDetail />
          </ProtectedRoute>
        } />
        
        {/* GitHub OAuth callback handling - single owner (/github/callback);
            legacy backend-style paths redirect with the query string intact */}
        <Route path="/github/callback" element={<GitHubCallback />} />
        <Route path="/api/github/callback" element={<GitHubCallbackAlias />} />
        <Route path="/api/v1/github/callback" element={<GitHubCallbackAlias />} />
        
        <Route path="/github/connected" element={
          <ProtectedRoute allowedRoles={AUTHENTICATED_ROLES}>
            <GitHubIntegration />
          </ProtectedRoute>
        } />
        
        {/* Admin Routes (Project Managers) */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/dashboard" element={
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/create-task" element={
          <ProtectedRoute requiredPermission={PERMISSIONS.CAN_CREATE_TASKS}>
            <TaskCreation />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/developer-progress" element={
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN}>
            <DeveloperProgress />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/reports" element={
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN}>
            <Reports />
          </ProtectedRoute>
        } />

        <Route path="/admin/projects" element={
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN}>
            <AdminProjects />
          </ProtectedRoute>
        } />

        <Route path="/admin/projects/new" element={
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN}>
            <AdminProjectCreate />
          </ProtectedRoute>
        } />

        <Route path="/admin/projects/:id/edit" element={
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN}>
            <AdminProjectEdit />
          </ProtectedRoute>
        } />

        <Route path="/admin/users" element={
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN} requiredPermission={PERMISSIONS.CAN_MANAGE_USERS}>
            <AdminUsers />
          </ProtectedRoute>
        } />

        <Route path="/admin/settings" element={
          <ProtectedRoute allowedRoles={['admin']} requiredPermission={PERMISSIONS.CAN_MANAGE_SYSTEM_SETTINGS}>
            <AdminSystemSettings />
          </ProtectedRoute>
        } />

        <Route path="/admin/audit-logs" element={
          <ProtectedRoute allowedRoles={['admin']} requiredPermission={PERMISSIONS.CAN_VIEW_AUDIT_LOGS}>
            <AdminAuditLogs />
          </ProtectedRoute>
        } />

        <Route path="/projects/:id" element={
          <ProtectedRoute allowedRoles={AUTHENTICATED_ROLES}>
            <ProjectDetails />
          </ProtectedRoute>
        } />
        
        {/* Default route */}
        <Route path="/" element={
          !loading && (
            currentUser ? 
              <Navigate to={getDashboardPath(currentUser.role)} replace />
              : 
              <Landing />
          )
        } />
      </Routes>
    </>
  );
}

// Central catcher for typed 403s thrown by fetchWithAuth: any API 403
// dispatches FORBIDDEN_EVENT, this listener navigates to /forbidden.
const ForbiddenRedirectListener = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const onForbidden = (e) => {
      navigate(e?.detail?.redirectTo || FORBIDDEN_PATH, { replace: true });
    };
    window.addEventListener(FORBIDDEN_EVENT, onForbidden);
    return () => window.removeEventListener(FORBIDDEN_EVENT, onForbidden);
  }, [navigate]);
  return null;
};

function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ForbiddenRedirectListener />
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
