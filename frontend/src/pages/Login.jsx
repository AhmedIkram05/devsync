import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const { login, loading, error: authError } = useAuth();
  const [credentials, setCredentials] = useState({
    email: "",
    password: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  
  // Check for existing user in localStorage
  const storedUser = localStorage.getItem('user');
  const currentUser = storedUser ? JSON.parse(storedUser) : null;
  
  // If user is already logged in, redirect to dashboard
  if (currentUser) {
    return currentUser.role === "admin" ? (
      <Navigate to="/admin" replace />
    ) : (
      <Navigate to="/BasicDashboard" replace />
    );
  }
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials({
      ...credentials,
      [name]: value,
    });
  };
  
  // Updated login handler that uses the AuthContext
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    
    if (!credentials.email || !credentials.password) {
      setLoginError("Please enter both email and password");
      return;
    }
    
    try {
      setIsSubmitting(true);
      console.log("Attempting login with:", credentials.email);
      
      // Use auth context login which will handle GitHub prompts if needed
      await login(credentials);
      
      // No need to navigate - AuthContext will handle that after login
      
    } catch (err) {
      console.error("Login error:", err.message);
      setLoginError(err.message || "Invalid email or password");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Rest of the component remains unchanged
  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-950 font-['Space_Grotesk']">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-2xl">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">DevSync</p>
          <h1 className="text-3xl font-semibold text-slate-100 mt-3">Welcome back</h1>
          <h2 className="text-sm text-slate-400 mt-2">Sign in to continue</h2>
        </div>
        
        {(loginError || authError) && (
          <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
            {loginError || authError}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={credentials.email}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="you@example.com"
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={credentials.password}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="********"
            />
          </div>
          
          <div className="flex items-center justify-between mb-6">
            <button
              type="submit"
              className="w-full rounded-full bg-rose-500/90 py-2 px-4 text-white font-semibold hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              disabled={isSubmitting || loading}
            >
              {isSubmitting || loading ? "Signing In..." : "Sign In"}
            </button>
          </div>
          
          <div className="text-center">
            <p className="text-slate-400">
              Don't have an account?{" "}
              <Link to="/register" className="text-rose-300 hover:text-rose-200">
                Create one now
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;