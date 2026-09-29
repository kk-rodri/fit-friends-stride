-- Private bucket for workout proof photos (Lovable Cloud created this outside
-- the migrations; a fresh Supabase project needs it explicitly).
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;
