import { UserProvider } from '@/context/UserContext';
import { SidebarProvider } from '@/context/SidebarContext';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import WorkspaceAwareMain from '@/components/layout/WorkspaceAwareMain';
import { ToastProvider } from '@/components/ui/Toast';
import WorkspaceSwitchOverlay from '@/components/workspace/WorkspaceSwitchOverlay';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ToastProvider>
        <SidebarProvider>
          <div className="flex h-screen bg-canvas overflow-hidden">
            <Sidebar />
            {/* Content column — min-w-0 prevents flex blowout on small screens */}
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              <Header />
              <WorkspaceAwareMain>{children}</WorkspaceAwareMain>
            </div>
          </div>
          <WorkspaceSwitchOverlay />
        </SidebarProvider>
      </ToastProvider>
    </UserProvider>
  );
}
