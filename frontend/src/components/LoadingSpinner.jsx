import React from 'react';

const LoadingSpinner = ({ size = 'medium', message = 'Loading...' }) => {
  // Define spinner sizes
  const sizes = {
    small: 'h-5 w-5',
    medium: 'h-8 w-8',
    large: 'h-12 w-12'
  };

  const spinnerSize = sizes[size] || sizes.medium;
  
  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`animate-spin rounded-full border-2 border-slate-700 border-t-rose-400 ${spinnerSize}`}></div>
      {message && <p className="mt-3 text-slate-400">{message}</p>}
    </div>
  );
};

export default LoadingSpinner;