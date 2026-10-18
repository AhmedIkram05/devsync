import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import { registerSchema, getErrorMessage } from "../utils/validation";

const API_BASE_URL = (() => {
  const configuredBaseUrl = process.env.REACT_APP_API_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  const protocol = window.location.protocol || "http:";
  const hostname = window.location.hostname || "localhost";
  return process.env.NODE_ENV === "development" ? `${protocol}//${hostname}:8000/api/v1` : `${protocol}//${hostname}/api/v1`;
})();

const Register = () => {
  const navigate = useNavigate();
  const [successMessage, setSuccessMessage] = useState("");

  const formik = useFormik({
    initialValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validationSchema: registerSchema,
    onSubmit: async (values, { setSubmitting, setStatus, resetForm }) => {
      setStatus(undefined);
      setSuccessMessage("");

      try {
        // Remove confirmPassword before sending to API
        const { confirmPassword, ...userData } = values;

        const response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(userData),
        });

        const responseText = await response.text();

        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
          throw new Error(`Server error: ${responseText || response.status}`);
        }

        if (!response.ok) {
          throw new Error(responseData.message || `Registration failed with status ${response.status}`);
        }

        setSuccessMessage("Registration successful! Redirecting to login...");

        // Reset form
        resetForm();

        // Redirect to login page after success
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } catch (err) {
        console.error("Registration error:", err);
        setStatus(getErrorMessage(err, "Registration failed. Please try again."));
      } finally {
        setSubmitting(false);
      }
    },
  });

  const showFieldError = (field) =>
    formik.errors[field] && (formik.touched[field] || formik.submitCount > 0);

  // Formik blocks onSubmit while the form is invalid, so surface the Cypress
  // contract message from the top-level banner instead.
  const hasEmptyRequiredField =
    !formik.values.name.trim() ||
    !formik.values.email.trim() ||
    !formik.values.password.trim() ||
    !formik.values.confirmPassword.trim();

  const bannerMessage =
    formik.submitCount > 0 && hasEmptyRequiredField
      ? "Please fill all required fields"
      : formik.status;

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-950 font-['Space_Grotesk']">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-2xl">
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">DevSync</p>
          <h1 className="text-2xl font-semibold text-slate-100 mt-3">Create an account</h1>
          <p className="text-sm text-slate-400 mt-2">Join the workspace and start syncing.</p>
        </div>
        
        {bannerMessage && (
          <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
            {bannerMessage}
          </div>
        )}
        
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-400/40 text-emerald-200 px-4 py-3 rounded mb-4">
            {successMessage}
          </div>
        )}
        
        <form onSubmit={formik.handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="register-name" className="block text-slate-300 text-sm font-medium mb-2">
              Full Name*
            </label>
            <input
              id="register-name"
              type="text"
              name="name"
              value={formik.values.name}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="John Doe"
            />
            {showFieldError("name") && (
              <p className="mt-1 text-xs text-rose-300">{formik.errors.name}</p>
            )}
          </div>
          
          <div className="mb-4">
            <label htmlFor="register-email" className="block text-slate-300 text-sm font-medium mb-2">
              Email Address*
            </label>
            <input
              id="register-email"
              type="email"
              name="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="john@example.com"
            />
            {showFieldError("email") && (
              <p className="mt-1 text-xs text-rose-300">{formik.errors.email}</p>
            )}
          </div>
          
          <div className="mb-4">
            <label htmlFor="register-password" className="block text-slate-300 text-sm font-medium mb-2">
              Password*
            </label>
            <input
              id="register-password"
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
            <p className="text-xs text-slate-400 mt-1">Must be at least 8 characters</p>
          </div>
          
          <div className="mb-4">
            <label htmlFor="register-confirm-password" className="block text-slate-300 text-sm font-medium mb-2">
              Confirm Password*
            </label>
            <input
              id="register-confirm-password"
              type="password"
              name="confirmPassword"
              value={formik.values.confirmPassword}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 py-2 px-3 text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              placeholder="********"
            />
            {showFieldError("confirmPassword") && (
              <p className="mt-1 text-xs text-rose-300">{formik.errors.confirmPassword}</p>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <button
              type="submit"
              className="w-full rounded-full bg-rose-500/90 py-2 px-4 text-white font-semibold hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
              disabled={formik.isSubmitting}
            >
              {formik.isSubmitting ? "Creating Account..." : "Register"}
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
