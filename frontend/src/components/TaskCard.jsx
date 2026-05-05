const TaskCard = ({ task }) => {
    return (
      <div className="bg-slate-900/70 p-4 rounded-2xl shadow-md border border-slate-800/70">
        <h3 className="text-lg font-semibold text-slate-100">{task.title}</h3>
        <p className="text-slate-300">{task.description}</p>
        <div className="mt-2">
          <span className="text-sm text-slate-400">Deadline: {task.deadline}</span>
          <div className="w-full bg-slate-800/50 rounded-full h-2 mt-1">
            <div
              className="bg-rose-500 h-2 rounded-full"
              style={{ width: `${task.progress}%` }}
            ></div>
          </div>
        </div>
        <button className="mt-2 bg-rose-500/90 text-white px-4 py-2 rounded-full hover:bg-rose-600/90">
          Update Progress
        </button>
      </div>
    );
  };
  
  export default TaskCard;