import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { ProjectProvider } from "./contexts/ProjectContext";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { AppShell } from "./components/layout/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BrandsPage } from "./pages/BrandsPage";
import { NewBrandPage } from "./pages/NewBrandPage";
import { ProductsPage } from "./pages/ProductsPage";
import { GeneratePage } from "./pages/GeneratePage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { CampaignDetailPage } from "./pages/CampaignDetailPage";
import { TopicsPage } from "./pages/TopicsPage";
import { TopicLibraryPage } from "./pages/TopicLibraryPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkspaceSettingsPage } from "./pages/WorkspaceSettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { LearningPage } from "./pages/LearningPage";
import { BrandDetailPage } from "./pages/BrandDetailPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { ResearchPage } from "./pages/Research/ResearchPage";
import { ResearchRunDetail } from "./pages/Research/ResearchRunDetail";
import { CompetitorAnalyzerPage } from "./pages/CompetitorAnalyzerPage";
import { AcceptInvitationPage } from "./pages/AcceptInvitationPage";
import { VerifyPage } from "./pages/VerifyPage";
import { isMenuEnabled, type MenuFlagKey } from "./config/menu-flags";

function Gated({ flag, children }: { flag: MenuFlagKey; children: React.ReactNode }) {
  return isMenuEnabled(flag) ? <>{children}</> : <Navigate to="/" replace />;
}

function DisabledMenuNotice() {
  return (
    <div className="p-6">
      <p className="text-sm text-gray-500">
        This menu is currently disabled. Pick another page from the sidebar.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <ProjectProvider>
            <OnboardingProvider>
          <Routes>
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={isMenuEnabled("dashboard") ? <DashboardPage /> : <DisabledMenuNotice />} />
              <Route path="/brands" element={<Gated flag="brand-brain"><BrandsPage /></Gated>} />
              <Route path="/brands/new" element={<Gated flag="brand-brain"><NewBrandPage /></Gated>} />
              <Route path="/brands/:id" element={<Gated flag="brand-brain"><BrandDetailPage /></Gated>} />
              <Route path="/products" element={<Gated flag="product-brain"><ProductsPage /></Gated>} />
              <Route path="/products/:id" element={<Gated flag="product-brain"><ProductDetailPage /></Gated>} />
              <Route path="/generate" element={<Gated flag="content-generator"><GeneratePage /></Gated>} />
              <Route path="/campaigns" element={<Gated flag="campaign-generator"><CampaignsPage /></Gated>} />
              <Route path="/campaigns/:id" element={<Gated flag="campaign-generator"><CampaignDetailPage /></Gated>} />
              <Route path="/topics" element={<Gated flag="topic-generator"><TopicsPage /></Gated>} />
              <Route path="/topic-library" element={<Gated flag="topic-library"><TopicLibraryPage /></Gated>} />
              <Route path="/content-library" element={<Gated flag="content-library"><LibraryPage /></Gated>} />
              <Route path="/research" element={<Gated flag="research-hub"><ResearchPage /></Gated>} />
              <Route path="/research/:runId" element={<Gated flag="research-hub"><ResearchRunDetail /></Gated>} />
              <Route path="/competitor-analyzer" element={<Gated flag="competitor-analyzer"><CompetitorAnalyzerPage /></Gated>} />
              <Route path="/learning" element={<Gated flag="learning-center"><LearningPage /></Gated>} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/workspace-settings" element={<WorkspaceSettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
            </OnboardingProvider>
          </ProjectProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
