// Mounts the new paperwork screens the way the dashboard does, around a stand-in customer file page.
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuotesLayout from "@/components/quotes/QuotesLayout";
import { Card } from "@/components/quotes/ui";
import { PaperworkCard } from "@/components/quotes/PaperworkCard";

const QuotesBusinessProfile = lazy(() => import("@/pages/quotes/QuotesBusinessProfile"));
const QuotesPaperwork = lazy(() => import("@/pages/quotes/QuotesPaperwork"));

function CustomerFile() {
  const { id = "" } = useParams();
  return (
    <QuotesLayout title="Jordan Testcase | Agile">
      <h1 className="q-cond" style={{ fontSize: 38, color: "var(--q-navy)", margin: 0 }}>Jordan Testcase</h1>
      <div className="q-file">
        <div className="q-col">
          <Card title="Contact"><p className="q-muted">Stand-in for the existing cards.</p></Card>
        </div>
        <div className="q-col">
          <Card title="Documents"><p className="q-muted">Stand-in for DocumentsCard.</p></Card>
          <PaperworkCard customerId={id} />
        </div>
      </div>
    </QuotesLayout>
  );
}

function Settings() {
  return (
    <QuotesLayout title="Settings | Agile">
      <h1 className="q-title q-cond">Settings</h1>
      <Card title="Business profile">
        <p className="q-muted">Your legal name, EIN, bank details and signature for adjuster paperwork.</p>
        <Link to="/quotes/settings/business" className="q-btn q-btn-ghost">Open business profile</Link>
      </Card>
    </QuotesLayout>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Suspense fallback={<div style={{ minHeight: "100vh" }} aria-busy="true" />}>
          <Routes>
            <Route path="/" element={<Navigate to="/quotes/customers/cust-0001-test" replace />} />
            <Route path="/quotes/customers/:id" element={<CustomerFile />} />
            <Route path="/quotes/settings" element={<Settings />} />
            <Route path="/quotes/settings/business" element={<QuotesBusinessProfile />} />
            <Route path="/quotes/paperwork/:id" element={<QuotesPaperwork />} />
            <Route path="*" element={<Settings />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
