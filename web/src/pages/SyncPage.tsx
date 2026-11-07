import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { api, type SyncRun } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function StatusBanner({ run }: { run?: SyncRun }) {
  if (!run) return <p className="text-sm text-muted-foreground">Nenhuma sincronização ainda.</p>;
  if (run.status === 'ok') {
    return (
      <div className="flex items-start gap-3 rounded-lg border p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-medium">Atualizado em {dateTime(run.createdAt)}</p>
          <p className="text-sm text-muted-foreground">
            {run.imported.toLocaleString('pt-BR')} imóveis importados,{' '}
            {run.removed.toLocaleString('pt-BR')} removidos ·{' '}
            {run.source === 'auto' ? 'download automático' : `upload de ${run.file}`}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div>
        <p className="font-medium">
          {run.status === 'running' ? 'Sincronização em andamento…' : `Falhou em ${dateTime(run.createdAt)}`}
        </p>
        {run.error && <p className="text-sm text-muted-foreground">{run.error}</p>}
        {run.status === 'error' && (
          <p className="mt-1 text-sm">Tente de novo mais tarde (Caixa: baixe os CSVs pelos links abaixo e envie).</p>
        )}
      </div>
    </div>
  );
}

export function SyncPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['sync'], queryFn: api.getSync });
  const [uploadMsg, setUploadMsg] = useState('');
  const refresh = () => qc.invalidateQueries();

  const runNow = useMutation({ mutationFn: api.runSync, onSettled: refresh });
  const originName = (key: string) => data?.origins.find((o) => o.key === key)?.name ?? key;

  // Envia um arquivo por vez: o servidor só processa um sync de cada vez.
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const failed: string[] = [];
      for (const [i, file] of files.entries()) {
        setUploadMsg(`Enviando ${file.name} (${i + 1}/${files.length})…`);
        const run = await api.uploadSync(file);
        if (run.status === 'error') failed.push(`${file.name}: ${run.error}`);
      }
      setUploadMsg(failed.length ? `Falhas — ${failed.join(' · ')}` : `${files.length} arquivo(s) importado(s).`);
    },
    onError: (err) => setUploadMsg(String(err)),
    onSettled: refresh,
  });

  const busy = runNow.isPending || upload.isPending;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Sincronização</h1>
        <p className="text-sm text-muted-foreground">
          O servidor atualiza cada origem 1x por dia. Se o site da Caixa bloquear, envie os CSVs manualmente.
        </p>
      </div>

      {isLoading && <Skeleton className="h-32" />}
      {data?.origins.map((o) => (
        <Card key={o.key}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{o.name}</CardTitle>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runNow.mutate(o.key)}>
              {runNow.isPending && runNow.variables === o.key ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar agora
            </Button>
          </CardHeader>
          <CardContent>
            <StatusBanner run={data.runs.find((r) => r.origin === o.key)} />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Upload manual · Caixa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center hover:bg-muted/50">
            {upload.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 text-primary" />}
            <span className="font-medium">Selecione um ou mais CSVs da Caixa</span>
            <span className="text-xs text-muted-foreground">
              Vale o geral ou por estado — só são removidos imóveis das UFs presentes no arquivo.
            </span>
            <input
              type="file"
              accept=".csv"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (files.length) upload.mutate(files);
              }}
            />
          </label>
          {uploadMsg && <p className="text-sm">{uploadMsg}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links para download · Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7">
            {data?.links.map((l) => (
              <Button
                key={l.uf}
                asChild
                variant={l.uf === 'Todos' ? 'default' : 'outline'}
                size="sm"
                className={l.uf === 'Todos' ? 'col-span-3 sm:col-span-5 md:col-span-7' : ''}
              >
                <a href={l.url} target="_blank" rel="noreferrer">
                  <Download className="h-3.5 w-3.5" />
                  {l.uf === 'Todos' ? 'Todos os estados (geral)' : l.uf}
                </a>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Quando</th>
                <th className="py-2 pr-4 font-medium">Origem</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 text-right font-medium">Importados</th>
                <th className="py-2 text-right font-medium">Removidos</th>
              </tr>
            </thead>
            <tbody>
              {data?.runs.map((r) => (
                <tr key={r._id} className="border-t" title={r.error || r.states.join(', ')}>
                  <td className="py-2 pr-4 whitespace-nowrap">{dateTime(r.createdAt)}</td>
                  <td className="py-2 pr-4">{originName(r.origin)}</td>
                  <td className="py-2 pr-4">{r.source === 'auto' ? 'Automático' : r.file}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={r.status === 'ok' ? 'success' : r.status === 'error' ? 'destructive' : 'secondary'}>
                      {r.status === 'ok' ? 'OK' : r.status === 'error' ? 'Erro' : 'Rodando'}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.imported.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums">{r.removed.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
