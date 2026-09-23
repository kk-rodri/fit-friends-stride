-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "Profiles readable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "Users insert their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Friendships
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (user_id, friend_id),
  constraint no_self_friend check (user_id <> friend_id),
  constraint valid_status check (status in ('pending', 'accepted'))
);

grant select, insert, update, delete on public.friendships to authenticated;
grant all on public.friendships to service_role;

alter table public.friendships enable row level security;

create policy "See own friendships"
  on public.friendships for select to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);
create policy "Send friend request"
  on public.friendships for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');
create policy "Recipient accepts request"
  on public.friendships for update to authenticated
  using (auth.uid() = friend_id);
create policy "Either side can remove friendship"
  on public.friendships for delete to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Workouts (proof photos)
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  photo_path text,
  note text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.workouts to authenticated;
grant all on public.workouts to service_role;

alter table public.workouts enable row level security;

create policy "See own and friends' workouts"
  on public.workouts for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.user_id = auth.uid() and f.friend_id = workouts.user_id)
          or (f.friend_id = auth.uid() and f.user_id = workouts.user_id))
    )
  );
create policy "Log own workouts"
  on public.workouts for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Delete own workouts"
  on public.workouts for delete to authenticated
  using (auth.uid() = user_id);

-- Proof photo storage policies (bucket: proofs, per-user folders)
create policy "Upload proof photos to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Signed-in users can view proof photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'proofs');
create policy "Delete own proof photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);