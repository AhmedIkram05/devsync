import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE_URL = (() => {
  const configuredBaseUrl = process.env.REACT_APP_API_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  const protocol = window.location.protocol || "http:";
  const hostname = window.location.hostname || "localhost";
  return `${protocol}//${hostname}:8000/api/v1`;
})();

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setSuccessMessage("");

    // Form validation
    if (!formData.name || !formData.email || !formData.password) {
      setFormError("Please fill all required fields");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setFormError("Passwords don't match");
      return;
    }

    // Updated to match backend requirement of 8 characters
    if (formData.password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Remove confirmPassword before sending to API
      const { confirmPassword, ...userData } = formData;
      console.log("Registering user with data:", userData);
      
      // Actual API call to register
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      // Log full response info
      console.log("Registration response status:", response.status);
      const responseText = await response.text();
      console.log("Registration raw response:", responseText);
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (error) {
        console.error("Error parsing response:", error);
        throw new Error(`Server error: ${responseText || response.status}`);
      }

      if (!response.ok) {
        throw new Error(responseData.message || `Registration failed with status ${response.status}`);
      }

      setSuccessMessage("Registration successful! Redirecting to login...");
      
      // Reset form
      setFormData({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
      
      // Redirect to login page after success
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      console.error("Registration error:", err);
      setFormError(err.message || "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-950 font-['Space_Grotesk']">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-2xl">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">DevSync</p>
          <h1 className="text-2xl font-semibold text-slate-100 mt-3">Create an account</h1>
          <p className="text-sm text-slate-400 mt-2">Join the workspace and start syncing.</p>
        </div>
        
        {formError && (
          <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
            {formError}
          </div>
        )}
        
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-400/40 text-emerald-200 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Full Name*
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="John Doe"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Email Address*
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="john@example.com"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Password*
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="********"
              required
            />
            <p className="text-xs text-slate-500 mt-1">Must be at least 8 characters</p>
          </div>
          
          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Confirm Password*
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="********"
              required
            />
          </div>
          
          <div className="flex items-center justify-between">
            <button
              type="submit"
              className="w-full rounded-full bg-rose-500/90 py-2 px-4 text-white font-semibold hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating Account..." : "Register"}
            </button>
          </div>
        </form>
        
        <p className="mt-4 text-center text-slate-400">
          Already have an account?{" "}
          <Link to="/login" className="text-rose-300 hover:text-rose-200">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
