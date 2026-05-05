import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { taskService } from "../services/utils/api";

const CommentSection = ({ taskId, comments = [], onCommentAdded }) => {
  const { currentUser } = useAuth();
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newComment.trim()) return;
    
    try {
      setIsSubmitting(true);
      setError(null);
      
      const commentData = {
        content: newComment.trim(),
        author_id: currentUser.id,
        author_name: currentUser.name || currentUser.email
      };
      
      const response = await taskService.addTaskComment(taskId, commentData);
      
      // Clear input
      setNewComment("");
      
      // Notify parent component to update comments list
      if (onCommentAdded) {
        onCommentAdded(response);
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
      setError("Failed to post comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Format date to be more readable
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-4">Comments</h3>
      
      {error && (
        <div className="bg-rose-500/10 border-l-4 border-rose-400 text-rose-200 p-4 mb-4" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      {/* Comments list */}
      <div className="space-y-4 max-h-96 overflow-y-auto mb-6">
        {comments && comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-4">
              <div className="flex justify-between items-start">
                <span className="font-medium text-slate-200">{comment.author_name}</span>
                <span className="text-xs text-slate-500">{formatDate(comment.created_at)}</span>
              </div>
              <p className="mt-2 text-slate-200 whitespace-pre-line">{comment.content}</p>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-slate-500">
            No comments yet. Be the first to add one!
          </div>
        )}
      </div>
      
      {/* Add comment form */}
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="w-full rounded-lg border border-slate-700/60 bg-slate-950/60 p-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-400/60"
            placeholder="Add your comment..."
            rows={3}
            disabled={isSubmitting}
            required
          />
        </div>
        
        <div className="flex justify-end">
          <button
            type="submit"
            className={`px-4 py-2 rounded ${
              isSubmitting || !newComment.trim() ? 
                'bg-slate-800 text-slate-500 cursor-not-allowed' : 
                'bg-rose-500/90 hover:bg-rose-400 text-white'
            }`}
            disabled={isSubmitting || !newComment.trim()}
          >
            {isSubmitting ? "Posting..." : "Post Comment"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CommentSection;