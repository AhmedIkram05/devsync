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
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Create New Task</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="flex justify-center my-8">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-6">
          <TaskForm 
            onSubmit={handleSubmit} 
            users={users}
            projects={projects}
          />
        </div>
      )}
    </div>
  );
};

export default TaskCreation;