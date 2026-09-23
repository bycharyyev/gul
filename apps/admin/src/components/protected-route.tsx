import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { getCurrentUser, isAuthenticated, api } from "@/lib/api";
import { Layout } from "./layout";

const STAFF_ROLES = ["ADMIN", "MANAGER", "SUPPORT"];

export function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const user = getCurrentUser();
  if (!user || !STAFF_ROLES.includes(user.role)) {
    api.logout();
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}
