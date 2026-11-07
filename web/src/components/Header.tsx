import { Link } from 'react-router-dom';
import { Gavel, RefreshCw } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Gavel className="h-4 w-4" />
          </span>
          <span>
            Leilões<span className="text-primary">.Imóveis</span>
          </span>
        </Link>
        <Link
          to="/sync"
          className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Sync
        </Link>
      </div>
    </header>
  );
}
