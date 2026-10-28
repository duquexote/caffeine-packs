-- Gerador de Packs: o que é compartilhado com o time inteiro.
-- Já aplicado no projeto xklugwiabtdqziumwjsn (migrações "gerador_pack_uploads" e "gerador_pack_packs_e_tamanhos").
-- Ferramenta interna, sem conteúdo sensível: a chave pública pode ler, gravar e remover.

-- PNGs enviados pelo time (produtos e brindes).
create table public.pack_uploads (
  id text primary key,
  label text not null,
  kind text not null check (kind in ('produto', 'brinde')),
  type text not null,
  aspect double precision not null,
  bbox double precision[] not null,
  path text not null,
  -- grupo no catálogo: objeto do brinde (Caneca, Mixer…) ou linha do produto (SuperCoffee…)
  category text,
  created_at timestamptz not null default now()
);

alter table public.pack_uploads enable row level security;
grant select, insert, delete on public.pack_uploads to anon, authenticated;

create policy "gerador-pack: leitura" on public.pack_uploads for select to anon, authenticated using (true);
create policy "gerador-pack: envio" on public.pack_uploads for insert to anon, authenticated with check (true);
create policy "gerador-pack: remoção" on public.pack_uploads for delete to anon, authenticated using (true);

-- O mesmo bucket guarda os fundos em imagem, na pasta fundos/ (sem tabela: a lista vem do próprio storage).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pack-uploads', 'pack-uploads', true, 20971520, array['image/png', 'image/webp']);

create policy "gerador-pack: leitura" on storage.objects for select to anon, authenticated using (bucket_id = 'pack-uploads');
create policy "gerador-pack: envio" on storage.objects for insert to anon, authenticated with check (bucket_id = 'pack-uploads');
create policy "gerador-pack: atualização" on storage.objects for update to anon, authenticated using (bucket_id = 'pack-uploads') with check (bucket_id = 'pack-uploads');
create policy "gerador-pack: remoção" on storage.objects for delete to anon, authenticated using (bucket_id = 'pack-uploads');

-- Packs salvos (o pack inteiro fica em data).
create table public.packs (
  id text primary key,
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.packs enable row level security;
grant select, insert, update, delete on public.packs to anon, authenticated;
create policy "gerador-pack: leitura" on public.packs for select to anon, authenticated using (true);
create policy "gerador-pack: envio" on public.packs for insert to anon, authenticated with check (true);
create policy "gerador-pack: atualização" on public.packs for update to anon, authenticated using (true) with check (true);
create policy "gerador-pack: remoção" on public.packs for delete to anon, authenticated using (true);

-- "Salvar tamanho como padrão": multiplicador por forma de produto/brinde (ver shapeKey em src/catalog.ts).
create table public.pack_sizes (
  key text primary key,
  scale double precision not null
);
alter table public.pack_sizes enable row level security;
grant select, insert, update, delete on public.pack_sizes to anon, authenticated;
create policy "gerador-pack: leitura" on public.pack_sizes for select to anon, authenticated using (true);
create policy "gerador-pack: envio" on public.pack_sizes for insert to anon, authenticated with check (true);
create policy "gerador-pack: atualização" on public.pack_sizes for update to anon, authenticated using (true) with check (true);
create policy "gerador-pack: remoção" on public.pack_sizes for delete to anon, authenticated using (true);
