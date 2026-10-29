import { WorkspaceShell } from "@/components/workspace-shell";
import { getProfileAndUser } from "@/lib/data";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { profile, user } = await getProfileAndUser();
  return <WorkspaceShell profile={profile} email={user.email ?? "Signed in"}>{children}</WorkspaceShell>;
}
