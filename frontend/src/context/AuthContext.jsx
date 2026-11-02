import { createContext, useContext } from 'react';
import { useAuthSession } from '../hooks/useAuthSession';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // All session state/flows/effects live in the hook; the provider only wires
  // the (already memoized) value into the context so consumers behave exactly
  // as before.
  const value = useAuthSession();

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
