import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import BookshelfPage from './pages/BookshelfPage';
import ReaderPage from './pages/ReaderPage';
import { ConfirmHost, ToastHost } from './components/ToastHost';
import { hydrateSettings } from './store/settingsStore';

export default function App() {
  useEffect(() => {
    void hydrateSettings();
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<BookshelfPage />} />
        <Route path="/book/:id" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
      <ConfirmHost />
    </HashRouter>
  );
}
