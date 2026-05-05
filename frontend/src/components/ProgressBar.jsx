import React, { useState } from 'react';

const ProgressBar = ({ progress = 0, onChange, disabled = false }) => {
  const [value, setValue] = useState(progress);
  const [isDragging, setIsDragging] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // If this is just a display component with no onChange handler
  const isInteractive = !!onChange;

  const handleChange = (e) => {
    const newValue = parseInt(e.target.value, 10);
    setValue(newValue);
  };

  const handleMouseUp = () => {
    if (isDragging && isInteractive && !disabled) {
      onChange(value);
      setIsDragging(false);
    }
  };

  const handleMouseDown = () => {
    if (isInteractive && !disabled) {
      setIsDragging(true);
    }
  };

  // Handle tooltip display
  const handleMouseEnter = () => setShowTooltip(true);
  const handleMouseLeave = () => setShowTooltip(false);

  // Calculate progress bar color based on value
  const getProgressColor = () => {
    if (value < 30) return 'bg-rose-400';
    if (value < 70) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  return (
    <div className="w-full">
      {isInteractive ? (
        <div className="relative">
          <div className="flex items-center mb-2">
            <span className="text-sm font-medium mr-2 text-slate-200">Progress:</span>
            <span 
              className={`text-sm font-bold px-2 py-0.5 rounded ${
                value < 30 ? 'bg-rose-500/20 text-rose-200' : 
                value < 70 ? 'bg-amber-500/20 text-amber-200' : 
                'bg-emerald-500/20 text-emerald-200'
              }`}
            >
              {value}%
            </span>
          </div>
          
          <div className="relative">
            <input
              type="range"
              min="0"
              max="100"
              value={value}
              onChange={handleChange}
              onMouseUp={handleMouseUp}
              onMouseDown={handleMouseDown}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              disabled={disabled}
              className={`w-full h-2 bg-slate-800/70 rounded-lg appearance-none cursor-pointer ${
                disabled ? 'opacity-60 cursor-not-allowed' : ''
              }`}
              style={{
                background: `linear-gradient(to right, ${
                  value < 30 ? '#fb7185' : value < 70 ? '#fbbf24' : '#34d399'
                } 0%, ${
                  value < 30 ? '#fb7185' : value < 70 ? '#fbbf24' : '#34d399'
                } ${value}%, #1f2937 ${value}%, #1f2937 100%)`
              }}
            />
            
            {showTooltip && isInteractive && !disabled && (
              <div 
                className="absolute -top-10 px-2 py-1 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 transform -translate-x-1/2 pointer-events-none"
                style={{ left: `${value}%` }}
              >
                {value}%
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-xs font-medium text-slate-300">Progress: {progress}%</span>
          </div>
          <div className="w-full bg-slate-800/70 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${getProgressColor()}`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {isInteractive && !disabled && (
        <div className="flex justify-between mt-1.5 text-xs text-slate-500">
          <span>Not Started</span>
          <span>In Progress</span>
          <span>Complete</span>
        </div>
      )}
    </div>
  );
};

export default ProgressBar;