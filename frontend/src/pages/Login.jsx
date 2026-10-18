import { Link, Navigate } from "react-router-dom";
import { useFormik } from "formik";
import { useAuth } from "../context/AuthContext";
import { logger } from "../utils/logger";
import { loginSchema } from "../utils/validation";

const Login = () => {
  const { login, loading, error: authError } = useAuth();

  // Check for existing user in localStorage
  const storedUser = localStorage.getItem('user');
  const currentUser = storedUser ? JSON.parse(storedUser) : null;

  const formik = useFormik({
    initialValues: {
      email: "",
      password: "",
    },
    validationSchema: loginSchema,
    onSubmit: async (values, { setSubmitting, setStatus }) => {
      setStatus(undefined);
      try {
        logger.log("Attempting login with:", values.email);

        // Use auth context login which will handle GitHub prompts if needed
        await login(values);

        // No need to navigate - AuthContext will handle that after login

      } catch (err) {
        console.error("Login error:", err.message);
        setStatus(err.message || "Invalid email or password");
      } finally {
        setSubmitting(false);
      }
    },
  });

  // If user is already logged in, redirect to dashboard
  if (currentUser) {
    return currentUser.role === "admin" ? (
      <Navigate to="/admin" replace />
    ) : (
      <Navigate to="/BasicDashboard" replace />
    );
  }

  const showFieldError = (field) =>
    formik.errors[field] && (formik.touched[field] || formik.submitCount > 0);

  // Formik blocks onSubmit while the form is invalid, so surface the Cypress
  // contract message from the top-level banner instead.
  const bannerMessage =
    formik.submitCount > 0 && (!formik.values.email.trim() || !formik.values.password.trim())
      ? "Please enter both email and password"
      : formik.status || authError;

  // Rest of the component remains unchanged
  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-950 font-['Space_Grotesk']">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-2xl">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">DevSync</p>
          <h1 className="text-3xl font-semibold text-slate-100 mt-3">Welcome back</h1>
          <h2 className="text-sm text-slate-400 mt-2">Sign in to continue</h2>
        </div>
        
        {bannerMessage && (
          <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
            {bannerMessage}
          </div>
        )}
        
        <form onSubmit={formik.handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="login-email" className="block text-slate-300 text-sm font-medium mb-2">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              name="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="you@example.com"
            />
            {showFieldError("email") && (
              <p className="mt-1 text-xs text-rose-300">{formik.errors.email}</p>
            )}
          </div>
          
          <div className="mb-6">
            <label htmlFor="login-password" className="block text-slate-300 text-sm font-medium mb-2">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              name="password"
              value={formik.values.password}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="********"
            />
            {showFieldError("password") && (
              <p className="mt-1 text-xs text-rose-300">{formik.errors.password}</p>
            )}
          </div>
          
          <div className="flex items-center justify-between mb-6">
            <button
              type="submit"
              className="w-full rounded-full bg-rose-500/90 py-2 px-4 text-white font-semibold hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              disabled={formik.isSubmitting || loading}
            >
              {formik.isSubmitting || loading ? "Signing In..." : "Sign In"}
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
