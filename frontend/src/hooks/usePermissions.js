import { useAuth } from '../context/AuthContext';

// Thin wrapper around AuthContext: RBAC helpers only, no behavior change.
export const usePermissions = () => {
  const { permissions, can, is, currentUser } = useAuth();
  return { permissions, can, is, role: currentUser?.role };
};

export default usePermissions;
