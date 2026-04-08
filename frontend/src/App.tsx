import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { Dashboard } from '@/pages/Dashboard';
import { Analytics } from '@/pages/Analytics';
import { Anomalies } from '@/pages/Anomalies';
import { ToastContainer } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSocket } from '@/hooks/useSocket';

/** Initialise the WebSocket connection once at the app root */
function SocketInit() {
  useSocket();
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <SocketInit />
      <div className="min-h-screen bg-background">
        <Navbar />
        <main>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/anomalies" element={<Anomalies />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
        {/* Global toast notifications for anomaly events */}
        <ToastContainer />
      </div>
    </BrowserRouter>
  );
}
