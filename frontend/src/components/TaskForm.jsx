import { useEffect } from "react";
import { useFormik } from "formik";
import { taskSchema, taskEditSchema } from "../utils/validation";

const buildInitialValues = (initialData = {}) => ({
  title: initialData.title || "",
  description: initialData.description || "",
  assignee: initialData.assigned_to != null ? String(initialData.assigned_to) : "",
  project: initialData.project_id != null ? String(initialData.project_id) : "",
  deadline: initialData.deadline ? new Date(initialData.deadline).toISOString().split('T')[0] : "",
  status: initialData.status || "todo",
  priority: initialData.priority || "medium"
});

const TaskForm = ({ onSubmit, initialData = {}, users = [], projects = [], assigneeLocked = false }) => {
  const formik = useFormik({
    initialValues: buildInitialValues(initialData),
    validationSchema: initialData.id ? taskEditSchema : taskSchema,
    onSubmit: async (values) => {
      await onSubmit(values);
    },
  });

  const { values, errors, touched, handleChange, handleBlur, handleSubmit, setFieldValue, isSubmitting, submitCount } = formik;

  useEffect(() => {
    if (assigneeLocked && values.assignee === "" && users.length > 0) {
      setFieldValue("assignee", String(initialData.assigned_to || users[0].id));
    }
  }, [assigneeLocked, initialData.assigned_to, values.assignee, users, setFieldValue]);

  const statusOptions = [
    { value: "todo", label: "To Do" },
    { value: "in_progress", label: "In Progress" },
    { value: "review", label: "Review" },
    { value: "backlog", label: "Backlog" }
  ];

  const priorityOptions = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" }
  ];

  const showFieldError = (field) => errors[field] && (touched[field] || submitCount > 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-slate-300 mb-1">Task Title</label>
        <input
          id="title"
          type="text"
          name="title"
          placeholder="Task Title"
          value={values.title}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100 placeholder:text-slate-500 focus:ring-rose-400/60 focus:border-rose-400/60"
        />
        {showFieldError("title") && (
          <p className="mt-1 text-xs text-rose-300">{errors.title}</p>
        )}
      </div>
      
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-1">Description</label>
        <textarea
          id="description"
          name="description"
          placeholder="Task Description"
          value={values.description}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100 placeholder:text-slate-500 focus:ring-rose-400/60 focus:border-rose-400/60"
          rows={4}
        />
        {showFieldError("description") && (
          <p className="mt-1 text-xs text-rose-300">{errors.description}</p>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="assignee" className="block text-sm font-medium text-slate-300 mb-1">Assignee</label>
          <select
            id="assignee"
            name="assignee"
            value={values.assignee}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={assigneeLocked}
            className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100 focus:ring-rose-400/60 focus:border-rose-400/60"
          >
            <option value="">Select Assignee</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.name || user.email}
              </option>
            ))}
          </select>
          {assigneeLocked && (
            <p className="mt-1 text-xs text-slate-500">Developers can only create tasks for themselves.</p>
          )}
        </div>
        
        <div>
          <label htmlFor="project" className="block text-sm font-medium text-slate-300 mb-1">Project</label>
          <select
            id="project"
            name="project"
            value={values.project}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100 focus:ring-rose-400/60 focus:border-rose-400/60"
          >
            <option value="">Select Project</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {showFieldError("project") && (
            <p className="mt-1 text-xs text-rose-300">{errors.project}</p>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-slate-300 mb-1">Status</label>
          <select
            id="status"
            name="status"
            value={values.status}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100 focus:ring-rose-400/60 focus:border-rose-400/60"
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-slate-300 mb-1">Priority</label>
          <select
            id="priority"
            name="priority"
            value={values.priority}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100 focus:ring-rose-400/60 focus:border-rose-400/60"
          >
            {priorityOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="deadline" className="block text-sm font-medium text-slate-300 mb-1">Deadline</label>
          <input
            id="deadline"
            type="date"
            name="deadline"
            value={values.deadline}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-full p-2 border border-slate-700/60 rounded bg-slate-950/60 text-slate-100 focus:ring-rose-400/60 focus:border-rose-400/60"
          />
        </div>
      </div>
      
      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2 rounded-full bg-rose-500/90 text-white hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-60"
        >
          {initialData.id ? "Update Task" : "Create Task"}
        </button>
      </div>
    </form>
  );
};

export default TaskForm;
