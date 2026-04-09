import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BrandsPage } from "./pages/BrandsPage";
import { ProductsPage } from "./pages/ProductsPage";
import { GeneratePage } from "./pages/GeneratePage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { TopicsPage } from "./pages/TopicsPage";
import { TopicLibraryPage } from "./pages/TopicLibraryPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkspaceSettingsPage } from "./pages/WorkspaceSettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { LearningPage } from "./pages/LearningPage";
import { SkillsPage } from "./pages/SkillsPage";
import { BrandDetailPage } from "./pages/BrandDetailPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/brands" element={<BrandsPage />} />
              <Route path="/brands/:id" element={<BrandDetailPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="/generate" element={<GeneratePage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/topics" element={<TopicsPage />} />
              <Route path="/topic-library" element={<TopicLibraryPage />} />
              <Route path="/content-library" element={<LibraryPage />} />
              <Route path="/learning" element={<LearningPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/workspace-settings" element={<WorkspaceSettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
