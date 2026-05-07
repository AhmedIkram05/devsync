import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TaskForm from "../components/TaskForm";
import { taskService } from "../services/utils/api";
import LoadingSpinner from "../components/LoadingSpinner";

const TaskCreation = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    // Fetch users and projects for the task assignment
    const fetchData = async () => {
      try {
        const usersData = await taskService.getUsers();
        setUsers(usersData || []);
        
        const projectsData = await taskService.getProjects();
        setProjects(projectsData || []);
      } catch (err) {
        console.error("Failed to fetch data:", err);
        setError("Failed to load users or projects. Some options may not be available.");
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (task) => {
    try {
      setLoading(true);
      setError(null);
      
      // Format the task data for the API
      const taskData = {
        title: task.title,
        description: task.description,
        status: task.status || "todo",
        priority: task.priority || "medium",
        assigned_to: task.assignee,
        project_id: task.project,
        deadline: task.deadline ? new Date(task.deadline).toISOString() : null
      };
      
      // Call backend API to create task
      const response = await taskService.createTask(taskData);
      
      // Navigate to the task details page or back to the task list
      navigate(`/tasks/${response.task.id}`, {
        state: { message: 'Task created successfully!' }
      });
    } catch (err) {
      console.error("Failed to create task:", err);
      setError("Failed to create task. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Space_Grotesk']">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10">
        <h1 className="text-2xl font-bold mb-10 text-slate-100">Create New Task</h1>
      
        {error && (
          <div className="bg-rose-500/10 border border-rose-400/40 text-rose-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
      
        {loading ? (
          <div className="flex justify-center my-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="bg-slate-900/70 rounded-2xl border border-slate-800/70 p-6">
            <TaskForm 
              onSubmit={handleSubmit} 
              users={users}
              projects={projects}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCreation;