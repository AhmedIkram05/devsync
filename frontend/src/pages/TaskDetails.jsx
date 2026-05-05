import ProgressBar from "../components/ProgressBar";
import CommentSection from "../components/CommentSection";

const TaskDetails = () => {
  const task = {
    id: 1,
    title: "Fix API Bug",
    description: "Resolve authentication issues",
    deadline: "2025-02-25",
    progress: 50,
    comments: ["Great progress!", "Need to fix the login issue."],
  };

  return (
    <div className="p-6 bg-slate-950 min-h-screen text-slate-100">
      <h1 className="text-2xl font-bold mb-4 text-slate-100">Task Details</h1>
      <div className="bg-slate-900/70 p-4 rounded-2xl shadow-md border border-slate-800/70">
        <h3 className="text-lg font-semibold text-slate-100">{task.title}</h3>
        <p className="text-slate-300">{task.description}</p>
        <div className="mt-2">
          <span className="text-sm text-slate-400">Deadline: {task.deadline}</span>
          <ProgressBar progress={task.progress} />
        </div>
        <CommentSection comments={task.comments} />
      </div>
    </div>
  );
};

export default TaskDetails;