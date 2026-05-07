import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
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

const ROLES = {
  DEVELOPER: 'developer',
  TEAM_LEAD: 'team_lead',
  ADMIN: 'admin',
};

const MEMBER_ROLES = [ROLES.DEVELOPER, ROLES.TEAM_LEAD];
const AUTHENTICATED_ROLES = [ROLES.DEVELOPER, ROLES.TEAM_LEAD, ROLES.ADMIN];
const TASK_CREATOR_ROLES = [ROLES.DEVELOPER, ROLES.TEAM_LEAD, ROLES.ADMIN];
const TEAM_LEAD_OR_ADMIN = [ROLES.TEAM_LEAD, ROLES.ADMIN];

const getDashboardPath = (role) => (role === ROLES.ADMIN || role === ROLES.TEAM_LEAD ? '/admin' : '/BasicDashboard');

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

  // Check if user is authenticated
  if (!currentUser) {
    console.log("Protected route: No user found, redirecting to login");
    return <Navigate to="/login" replace />;
  }

  // Check if the token exists
  if (!currentUser.token) {
    console.log("Protected route: User has no token, redirecting to login");
    return <Navigate to="/login" replace />;
  }

  // If allowedRoles is specified, check if the user has the required role
  if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
    console.log(`User role ${currentUser.role} not allowed for this route`);
    return <Navigate to="/forbidden" replace />;
  }

  // If requiredPermission is specified, check if user has the permission
  if (requiredPermission && !can(requiredPermission)) {
    console.log(`User lacks permission ${requiredPermission} for this route`);
    return <Navigate to="/forbidden" replace />;
  }

  // All checks passed, render the protected component
  return children;
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
          <ProtectedRoute allowedRoles={MEMBER_ROLES}>
            <BasicDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/dashboard/client" element={
          <ProtectedRoute allowedRoles={MEMBER_ROLES}>
            <BasicDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/TaskDetailUser/:id" element={
          <ProtectedRoute allowedRoles={MEMBER_ROLES}>
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
        
        {/* GitHub OAuth callback handling - Public route for callbacks */}
        <Route path="/github/callback" element={<GitHubCallback />} />
        <Route path="/api/github/callback" element={<GitHubCallback />} />
        <Route path="/api/v1/github/callback" element={<GitHubCallback />} />
        
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
          <ProtectedRoute allowedRoles={TASK_CREATOR_ROLES}>
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
          <ProtectedRoute allowedRoles={TEAM_LEAD_OR_ADMIN}>
            <AdminUsers />
          </ProtectedRoute>
        } />

        <Route path="/admin/settings" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminSystemSettings />
          </ProtectedRoute>
        } />

        <Route path="/admin/audit-logs" element={
          <ProtectedRoute allowedRoles={['admin']}>
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

function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
