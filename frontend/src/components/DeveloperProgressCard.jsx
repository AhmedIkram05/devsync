const DeveloperProgressCard = ({ developer }) => {
    return (
      <div className="bg-slate-900/70 p-4 rounded-2xl shadow-md border border-slate-800/70">
        <h3 className="text-lg font-semibold text-slate-100">{developer.name}</h3>
        <p className="text-slate-300">Completed Tasks: {developer.completedTasks}</p>
        <p className="text-slate-300">Pending Tasks: {developer.pendingTasks}</p>
      </div>
    );
  };
  
  export default DeveloperProgressCard;