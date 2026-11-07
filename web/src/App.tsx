import { Routes, Route } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ListPage } from '@/pages/ListPage';
import { DetailPage } from '@/pages/DetailPage';
import { SyncPage } from '@/pages/SyncPage';

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<ListPage />} />
          <Route path="/imovel/:id" element={<DetailPage />} />
          <Route path="/sync" element={<SyncPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
