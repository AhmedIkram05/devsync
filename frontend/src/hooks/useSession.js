import { useAuth } from '../context/AuthContext';

// Thin wrapper around AuthContext: session state only, no behavior change.
export const useSession = () => {
  const { currentUser, loading, error, authInProgress, verifyToken, login, register, logout } = useAuth();
  return { currentUser, loading, error, authInProgress, verifyToken, login, register, logout };
};

export default useSession;
