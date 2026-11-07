import { Link, useNavigate } from 'react-router-dom';
import { Gavel, Home, RefreshCw } from 'lucide-react';
import { useFilters, type Filters } from '@/store/useFilters';

const STATES: [string, string][] = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];

// ponytail: cidade/marca no banco vêm com grafias misturadas ("SAO PAULO", "São Paulo"),
// então filtramos por UF + busca textual; normalizar no import se precisar de match exato.
const CITIES: [string, string][] = [
  ['São Paulo', 'SP'], ['Rio de Janeiro', 'RJ'], ['Belo Horizonte', 'MG'], ['Curitiba', 'PR'],
  ['Porto Alegre', 'RS'], ['Salvador', 'BA'], ['Fortaleza', 'CE'], ['Recife', 'PE'],
  ['Goiânia', 'GO'], ['Campinas', 'SP'], ['Brasília', 'DF'], ['Manaus', 'AM'],
  ['Florianópolis', 'SC'], ['Belém', 'PA'], ['Natal', 'RN'], ['Maceió', 'AL'],
  ['São Luís', 'MA'], ['Guarulhos', 'SP'],
];

const BRANDS = [
  'Fiat', 'Chevrolet', 'Volkswagen', 'Honda', 'Ford', 'Renault', 'Toyota', 'Hyundai',
  'Mercedes-Benz', 'Peugeot', 'Nissan', 'Yamaha', 'Jeep', 'Citroën', 'Mitsubishi', 'BMW',
];

const TYPES: [string, Partial<Filters>][] = [
  ['Leilões de Imóveis', { kind: 'realstate' }],
  ['Leilões de Veículos', { kind: 'vehicles' }],
  ['Equipamentos', { kind: 'equipments' }],
  ['Aeronaves', { kind: 'aircraft' }],
  ['Embarcações', { kind: 'boat' }],
  ['Leilão Judicial', { saleModality: 'Leilão Judicial' }],
  ['Leilão Extrajudicial', { saleModality: 'Leilão Extrajudicial' }],
  ['Venda Direta', { saleModality: 'Venda Direta' }],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50">{title}</h3>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}

export function Footer() {
  const navigate = useNavigate();
  const { reset, set } = useFilters();

  const go = (patch: Partial<Filters>) => {
    reset();
    set(patch);
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chip = (key: string, label: React.ReactNode, patch: Partial<Filters>) => (
    <button
      key={key}
      type="button"
      onClick={() => go(patch)}
      className="rounded-md border border-white/15 px-3.5 py-1.5 text-sm text-white/85 transition hover:border-white/40 hover:bg-white/5 hover:text-white"
    >
      {label}
    </button>
  );

  const navLink = 'flex items-center gap-2.5 text-white/85 transition hover:text-white';

  return (
    <footer className="mt-16 bg-[#10261f] text-white">
      <div className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid gap-10 border-b border-white/10 pb-12 md:grid-cols-3">
          <div>
            <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 font-bold text-[#10261f]">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Gavel className="h-4 w-4" />
              </span>
              <span>
                Leilões<span className="text-primary">.Imóveis</span>
              </span>
            </Link>
            <p className="mt-5 max-w-xs leading-relaxed text-white/70">
              Encontre as melhores oportunidades em leilões de imóveis e veículos em todo o Brasil.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50">Navegação</h3>
            <ul className="space-y-3">
              <li>
                <button type="button" onClick={() => go({})} className={navLink}>
                  <Home className="h-4 w-4 text-white/50" /> Todos os Leilões
                </button>
              </li>
              <li>
                <Link to="/sync" className={navLink}>
                  <RefreshCw className="h-4 w-4 text-white/50" /> Sincronização
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-10 pt-12">
          <Section title="Leilões por estado">
            {STATES.map(([uf, name]) =>
              chip(uf, <><b className="font-semibold">{uf}</b> {name}</>, { state: uf }),
            )}
          </Section>
          <Section title="Principais cidades">
            {CITIES.map(([city, uf]) => chip(city, `${city} - ${uf}`, { state: uf, search: city }))}
          </Section>
          <Section title="Leilões de veículos por marca">
            {BRANDS.map((b) => chip(b, b, { kind: 'vehicles', search: b }))}
          </Section>
          <Section title="Tipos de leilão">
            {TYPES.map(([label, patch]) => chip(label, label, patch))}
          </Section>
        </div>

        <p className="mt-12 border-t border-white/10 pt-6 text-sm text-white/40">
          © {new Date().getFullYear()} Leilões.Imóveis
        </p>
      </div>
    </footer>
  );
}
