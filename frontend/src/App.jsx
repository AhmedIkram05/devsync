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
import Navbar from "./components/Navbar";
import GitHubConnectPrompt from "./components/GitHubConnectPrompt";
import ClientDashboard from "./pages/clientdashboard";
import TaskDetailsUser from "./pages/TaskDetailsUser";
import GitHubIntegrationDetail from "./pages/GithubIntegrationDetail";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import Register from "./pages/Register";
import GitHubCallback from './pages/GitHubCallback';

// Protected route wrapper component - Completely rewritten to prevent infinite loops
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { currentUser, loading } = useAuth();
  
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
    
    // Redirect to the appropriate dashboard based on role
    const redirectPath = currentUser.role === 'admin' ? '/admin' : '/clientdashboard';
    return <Navigate to={redirectPath} replace />;
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
            <Navigate to={currentUser.role === 'admin' ? '/admin' : '/clientdashboard'} replace />
          ) : (
            <Login />
          )
        } />
        
        <Route path="/register" element={
          currentUser ? (
            <Navigate to={currentUser.role === 'admin' ? '/admin' : '/clientdashboard'} replace />
          ) : (
            <Register />
          )
        } />
        
        {/* Client Routes (Team Members) */}
        <Route path="/clientdashboard" element={
          <ProtectedRoute allowedRoles={['client']}>
            <ClientDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/dashboard/client" element={
          <ProtectedRoute allowedRoles={['client']}>
            <ClientDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/TaskDetailUser/:id" element={
          <ProtectedRoute allowedRoles={['client']}>
            <TaskDetailsUser />
          </ProtectedRoute>
        } />
        
        <Route path="/tasks" element={
          <ProtectedRoute allowedRoles={['client', 'admin']}>
            <TaskList />
          </ProtectedRoute>
        } />
        
        <Route path="/tasks/:id" element={
          <ProtectedRoute allowedRoles={['client', 'admin']}>
            <TaskDetailsUser />
          </ProtectedRoute>
        } />
        
        <Route path="/github" element={
          <ProtectedRoute allowedRoles={['client', 'admin']}>
            <GitHubIntegration />
          </ProtectedRoute>
        } />
        
        <Route path="/githubintegrationdetail/:repoId" element={
          <ProtectedRoute allowedRoles={['client', 'admin']}>
            <GitHubIntegrationDetail />
          </ProtectedRoute>
        } />
        
        {/* GitHub OAuth callback handling - Public route for callbacks */}
        <Route path="/github/callback" element={<GitHubCallback />} />
        <Route path="/api/github/callback" element={<GitHubCallback />} />
        <Route path="/api/v1/github/callback" element={<GitHubCallback />} /> {/* Add this new route */}
        
        <Route path="/github/connected" element={
          <ProtectedRoute allowedRoles={['client', 'admin']}>
            <GitHubIntegration />
          </ProtectedRoute>
        } />
        
        {/* Admin Routes (Project Managers) */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/dashboard" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/create-task" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <TaskCreation />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/developer-progress" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DeveloperProgress />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/reports" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Reports />
          </ProtectedRoute>
        } />

        <Route path="/admin/projects" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminProjects />
          </ProtectedRoute>
        } />

        <Route path="/admin/projects/new" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminProjectCreate />
          </ProtectedRoute>
        } />

        <Route path="/admin/projects/:id/edit" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminProjectEdit />
          </ProtectedRoute>
        } />

        <Route path="/projects/:id" element={
          <ProtectedRoute allowedRoles={['client', 'admin']}>
            <ProjectDetails />
          </ProtectedRoute>
        } />
        
        {/* Default route */}
        <Route path="/" element={
          !loading && (
            currentUser ? 
              currentUser.role === 'admin' ? 
                <Navigate to="/admin" replace /> : 
                <Navigate to="/clientdashboard" replace /> 
              : 
              <Navigate to="/login" replace />
          )
        } />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;