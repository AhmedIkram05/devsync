import * as yup from "yup";

// Shared client-side schemas. They mirror the backend validators in
// backend/src/api/validators/*.py so the same rules are enforced before the
// request is sent.

export const loginSchema = yup.object({
  email: yup
    .string()
    .trim()
    .required("Email is required")
    .email("Enter a valid email address"),
  password: yup
    .string()
    .required("Password is required")
    .test("not-blank", "Password is required", (value) => typeof value === "string" && value.trim().length > 0),
});

export const registerSchema = yup.object({
  name: yup.string().trim().required("Name is required"),
  email: yup
    .string()
    .trim()
    .required("Email is required")
    .email("Enter a valid email address"),
  password: yup
    .string()
    .trim()
    .required("Password is required")
    .min(8, "Password must be at least 8 characters"),
  confirmPassword: yup
    .string()
    .trim()
    .required("Please confirm your password")
    .oneOf([yup.ref("password")], "Passwords don't match"),
});

export const taskSchema = yup.object({
  title: yup
    .string()
    .trim()
    .required("Title is required")
    .min(3, "Title must be between 3 and 100 characters")
    .max(100, "Title must be between 3 and 100 characters"),
  description: yup.string().trim().required("Description is required"),
  project: yup.string().required("Project is required"),
});

// Editing an existing task doesn't require re-selecting a project.
export const taskEditSchema = taskSchema.shape({
  project: yup.string(),
});

// Prefer the backend message envelope, then the Error message, then a fallback.
export const getErrorMessage = (error, fallback) =>
  error?.data?.message || error?.message || fallback;
