
-- GESTIONALE MAGYC v0.2
-- Eseguire tutto nel Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  starting_credits integer not null default 500 check (starting_credits > 0),
  max_players integer not null default 25 check (max_players > 0),
  win_points integer not null default 3 check (win_points >= 0),
  status text not null default 'active' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','coach','viewer')),
  created_at timestamptz not null default now(),
  unique (league_id,user_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  coach_name text,
  coach_user_id uuid references auth.users(id) on delete set null,
  credits integer not null default 500 check (credits >= 0),
  player_count integer not null default 0 check (player_count >= 0),
  created_at timestamptz not null default now(),
  unique (league_id,name)
);

create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_name text not null,
  minimum_bid integer not null default 1 check (minimum_bid > 0),
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('draft','open','closed','assigned','cancelled','tied')),
  created_by uuid not null references auth.users(id),
  winner_team_id uuid references public.teams(id) on delete set null,
  winner_team_name text,
  winning_bid integer,
  created_at timestamptz not null default now()
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auction_id,user_id)
);

create table if not exists public.roster_players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_name text not null,
  purchase_price integer not null default 0 check (purchase_price >= 0),
  acquired_via text not null default 'auction',
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  scheduled_at timestamptz not null,
  home_score integer check (home_score >= 0),
  away_score integer check (away_score >= 0),
  status text not null default 'scheduled' check (status in ('scheduled','played','postponed','cancelled')),
  created_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  title text not null,
  category text not null default 'Altro',
  url text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_league_member(p_league uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.league_members where league_id=p_league and user_id=auth.uid()); $$;

create or replace function public.is_league_admin(p_league uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.league_members where league_id=p_league and user_id=auth.uid() and role in ('owner','admin')); $$;

create or replace function public.current_team_id(p_league uuid)
returns uuid language sql stable security definer set search_path=public
as $$ select id from public.teams where league_id=p_league and coach_user_id=auth.uid() limit 1; $$;

create or replace function public.create_league(p_name text,p_starting_credits integer default 500,p_max_players integer default 25)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  v_code := 'MAGYC-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  insert into public.leagues(name,invite_code,owner_id,starting_credits,max_players)
  values(trim(p_name),v_code,auth.uid(),p_starting_credits,p_max_players) returning id into v_id;
  insert into public.league_members(league_id,user_id,role) values(v_id,auth.uid(),'owner');
  insert into public.activity_log(league_id,text) values(v_id,'Campionato creato');
  return v_id;
end $$;

create or replace function public.join_league_by_code(p_invite_code text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_league uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  select id,name into v_league,v_name from public.leagues where upper(invite_code)=upper(trim(p_invite_code));
  if v_league is null then raise exception 'Codice invito non valido'; end if;
  insert into public.league_members(league_id,user_id,role) values(v_league,auth.uid(),'coach')
  on conflict(league_id,user_id) do nothing;
  return jsonb_build_object('league_id',v_league,'message','Sei entrato in '||v_name);
end $$;

create or replace function public.place_bid(p_auction_id uuid,p_amount integer)
returns void language plpgsql security definer set search_path=public
as $$
declare v_a public.auctions%rowtype; v_team uuid; v_credits integer;
begin
  select * into v_a from public.auctions where id=p_auction_id;
  if v_a.id is null then raise exception 'Asta non trovata'; end if;
  if v_a.status<>'open' or v_a.deadline<=now() then raise exception 'Asta chiusa'; end if;
  if not public.is_league_member(v_a.league_id) then raise exception 'Non autorizzato'; end if;
  select id,credits into v_team,v_credits from public.teams where league_id=v_a.league_id and coach_user_id=auth.uid() limit 1;
  if v_team is null then raise exception 'Nessuna squadra assegnata al tuo account'; end if;
  if p_amount<v_a.minimum_bid then raise exception 'Offerta inferiore al minimo'; end if;
  if p_amount>v_credits then raise exception 'Crediti insufficienti'; end if;
  insert into public.bids(auction_id,user_id,team_id,amount) values(p_auction_id,auth.uid(),v_team,p_amount)
  on conflict(auction_id,user_id) do update set amount=excluded.amount,team_id=excluded.team_id,updated_at=now();
end $$;

create or replace function public.close_auction(p_auction_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_a public.auctions%rowtype; v_max integer; v_count integer; v_team uuid; v_team_name text; v_credits integer; v_max_players integer; v_player_count integer;
begin
  select * into v_a from public.auctions where id=p_auction_id for update;
  if v_a.id is null then raise exception 'Asta non trovata'; end if;
  if not public.is_league_admin(v_a.league_id) then raise exception 'Solo proprietario o amministratore'; end if;
  if v_a.status<>'open' then raise exception 'Asta già chiusa'; end if;

  select max(amount) into v_max from public.bids where auction_id=p_auction_id;
  if v_max is null then
    update public.auctions set status='closed' where id=p_auction_id;
    return jsonb_build_object('message','Asta chiusa senza offerte');
  end if;

  select count(*) into v_count from public.bids where auction_id=p_auction_id and amount=v_max;
  if v_count>1 then
    update public.auctions set status='tied',winning_bid=v_max where id=p_auction_id;
    return jsonb_build_object('message','Parità sulla migliore offerta: assegnazione sospesa');
  end if;

  select b.team_id,t.name,t.credits,t.player_count into v_team,v_team_name,v_credits,v_player_count
  from public.bids b join public.teams t on t.id=b.team_id
  where b.auction_id=p_auction_id and b.amount=v_max limit 1;
  select max_players into v_max_players from public.leagues where id=v_a.league_id;
  if v_credits<v_max then raise exception 'Il vincitore non ha più crediti sufficienti'; end if;
  if v_player_count>=v_max_players then raise exception 'Rosa del vincitore già completa'; end if;

  update public.teams set credits=credits-v_max,player_count=player_count+1 where id=v_team;
  insert into public.roster_players(league_id,team_id,player_name,purchase_price) values(v_a.league_id,v_team,v_a.player_name,v_max);
  update public.auctions set status='assigned',winner_team_id=v_team,winner_team_name=v_team_name,winning_bid=v_max where id=p_auction_id;
  insert into public.activity_log(league_id,text) values(v_a.league_id,v_a.player_name||' assegnato a '||v_team_name||' per '||v_max||' crediti');
  return jsonb_build_object('message',v_a.player_name||' assegnato a '||v_team_name);
end $$;

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.teams enable row level security;
alter table public.auctions enable row level security;
alter table public.bids enable row level security;
alter table public.roster_players enable row level security;
alter table public.matches enable row level security;
alter table public.documents enable row level security;
alter table public.activity_log enable row level security;

create policy "league members read leagues" on public.leagues for select to authenticated using(owner_id=auth.uid() or public.is_league_member(id));
create policy "league admins update leagues" on public.leagues for update to authenticated using(owner_id=auth.uid() or public.is_league_admin(id));
create policy "members read memberships" on public.league_members for select to authenticated using(user_id=auth.uid() or public.is_league_admin(league_id));
create policy "admins manage memberships" on public.league_members for update to authenticated using(public.is_league_admin(league_id));
create policy "members read teams" on public.teams for select to authenticated using(public.is_league_member(league_id));
create policy "admins insert teams" on public.teams for insert to authenticated with check(public.is_league_admin(league_id));
create policy "admins update teams" on public.teams for update to authenticated using(public.is_league_admin(league_id));
create policy "members read auctions" on public.auctions for select to authenticated using(public.is_league_member(league_id));
create policy "admins create auctions" on public.auctions for insert to authenticated with check(public.is_league_admin(league_id) and created_by=auth.uid());
create policy "admins update auctions" on public.auctions for update to authenticated using(public.is_league_admin(league_id));
create policy "own bids only" on public.bids for select to authenticated using(user_id=auth.uid());
create policy "members read rosters" on public.roster_players for select to authenticated using(public.is_league_member(league_id));
create policy "members read matches" on public.matches for select to authenticated using(public.is_league_member(league_id));
create policy "admins create matches" on public.matches for insert to authenticated with check(public.is_league_admin(league_id));
create policy "admins update matches" on public.matches for update to authenticated using(public.is_league_admin(league_id));
create policy "members read documents" on public.documents for select to authenticated using(public.is_league_member(league_id));
create policy "admins create documents" on public.documents for insert to authenticated with check(public.is_league_admin(league_id) and created_by=auth.uid());
create policy "members read activity" on public.activity_log for select to authenticated using(public.is_league_member(league_id));

grant execute on function public.create_league(text,integer,integer) to authenticated;
grant execute on function public.join_league_by_code(text) to authenticated;
grant execute on function public.place_bid(uuid,integer) to authenticated;
grant execute on function public.close_auction(uuid) to authenticated;


alter table public.roster_players add column if not exists player_role text;

create or replace view public.league_member_view
with (security_invoker=true) as
select lm.league_id,lm.user_id,lm.role,u.email
from public.league_members lm
join auth.users u on u.id=lm.user_id;

create or replace function public.add_member_by_email(p_league_id uuid,p_email text,p_role text)
returns void language plpgsql security definer set search_path=public
as $$
declare v_user uuid;
begin
  if not public.is_league_admin(p_league_id) then raise exception 'Solo proprietario o amministratore'; end if;
  if p_role not in ('admin','coach','viewer') then raise exception 'Ruolo non valido'; end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email));
  if v_user is null then raise exception 'L’utente deve accedere almeno una volta prima di essere aggiunto'; end if;
  insert into public.league_members(league_id,user_id,role) values(p_league_id,v_user,p_role)
  on conflict(league_id,user_id) do update set role=excluded.role;
end $$;

create or replace function public.add_roster_player(
  p_league_id uuid,
  p_team_id uuid,
  p_player_name text,
  p_player_role text default null,
  p_purchase_price integer default 0
)
returns void language plpgsql security definer set search_path=public
as $$
declare v_max integer; v_count integer; v_credits integer;
begin
  if not public.is_league_admin(p_league_id) then raise exception 'Solo proprietario o amministratore'; end if;
  select max_players into v_max from public.leagues where id=p_league_id;
  select count(*) into v_count from public.roster_players where team_id=p_team_id;
  if v_count>=v_max then raise exception 'Rosa già completa'; end if;
  select credits into v_credits from public.teams where id=p_team_id and league_id=p_league_id;
  if v_credits is null then raise exception 'Squadra non valida'; end if;
  if p_purchase_price>v_credits then raise exception 'Crediti insufficienti'; end if;

  insert into public.roster_players(league_id,team_id,player_name,player_role,purchase_price,acquired_via)
  values(p_league_id,p_team_id,trim(p_player_name),nullif(trim(p_player_role),''),p_purchase_price,'manual');

  update public.teams set credits=credits-p_purchase_price,player_count=player_count+1 where id=p_team_id;
  insert into public.activity_log(league_id,text) values(p_league_id,p_player_name||' aggiunto manualmente alla rosa');
end $$;

grant select on public.league_member_view to authenticated;
grant execute on function public.add_member_by_email(uuid,text,text) to authenticated;
grant execute on function public.add_roster_player(uuid,uuid,text,text,integer) to authenticated;


create or replace function public.update_member_role(
  p_league_id uuid,
  p_user_id uuid,
  p_role text
)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_league_admin(p_league_id) then
    raise exception 'Solo proprietario o amministratore';
  end if;
  if p_role not in ('admin','coach','viewer') then
    raise exception 'Ruolo non valido';
  end if;
  if exists(
    select 1 from public.league_members
    where league_id=p_league_id and user_id=p_user_id and role='owner'
  ) then
    raise exception 'Il ruolo del proprietario non può essere modificato';
  end if;
  update public.league_members set role=p_role
  where league_id=p_league_id and user_id=p_user_id;
end $$;

create or replace function public.remove_league_member(
  p_league_id uuid,
  p_user_id uuid
)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_league_admin(p_league_id) then
    raise exception 'Solo proprietario o amministratore';
  end if;
  if exists(
    select 1 from public.league_members
    where league_id=p_league_id and user_id=p_user_id and role='owner'
  ) then
    raise exception 'Il proprietario non può essere rimosso';
  end if;
  delete from public.league_members
  where league_id=p_league_id and user_id=p_user_id;
end $$;

grant execute on function public.update_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.remove_league_member(uuid,uuid) to authenticated;


create table if not exists public.market_transactions(
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  transaction_type text not null check(transaction_type in ('purchase','sale','release','transfer')),
  roster_player_id uuid references public.roster_players(id) on delete set null,
  player_name text not null,
  player_role text,
  from_team_id uuid references public.teams(id) on delete set null,
  to_team_id uuid references public.teams(id) on delete set null,
  credits integer not null default 0 check(credits>=0),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.market_transactions enable row level security;

drop policy if exists "members read market" on public.market_transactions;
create policy "members read market" on public.market_transactions
for select using(public.is_league_member(league_id));

drop policy if exists "admins manage market" on public.market_transactions;
create policy "admins manage market" on public.market_transactions
for all using(public.is_league_admin(league_id))
with check(public.is_league_admin(league_id));

create or replace function public.register_market_transaction(
  p_league_id uuid,
  p_transaction_type text,
  p_roster_player_id uuid default null,
  p_player_name text default null,
  p_player_role text default null,
  p_from_team_id uuid default null,
  p_to_team_id uuid default null,
  p_credits integer default 0,
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  v_id uuid;
  v_player public.roster_players%rowtype;
  v_from_credits integer;
  v_to_credits integer;
  v_max integer;
  v_to_count integer;
begin
  if not public.is_league_admin(p_league_id) then
    raise exception 'Solo proprietario o amministratore';
  end if;
  if p_transaction_type not in ('purchase','sale','release','transfer') then
    raise exception 'Tipo operazione non valido';
  end if;
  if p_credits<0 then raise exception 'Crediti non validi'; end if;

  if p_roster_player_id is not null then
    select * into v_player from public.roster_players
    where id=p_roster_player_id and league_id=p_league_id;
    if not found then raise exception 'Giocatore non trovato'; end if;
  end if;

  if p_transaction_type='purchase' then
    if p_to_team_id is null then raise exception 'Squadra di destinazione obbligatoria'; end if;
    select credits into v_to_credits from public.teams where id=p_to_team_id and league_id=p_league_id for update;
    if v_to_credits is null then raise exception 'Squadra non valida'; end if;
    if v_to_credits<p_credits then raise exception 'Crediti insufficienti'; end if;
    select max_players into v_max from public.leagues where id=p_league_id;
    select count(*) into v_to_count from public.roster_players where team_id=p_to_team_id;
    if v_to_count>=v_max then raise exception 'Rosa completa'; end if;

    insert into public.roster_players(league_id,team_id,player_name,player_role,purchase_price,acquired_via)
    values(p_league_id,p_to_team_id,trim(p_player_name),nullif(trim(p_player_role),''),p_credits,'market')
    returning id into p_roster_player_id;
    update public.teams set credits=credits-p_credits, player_count=player_count+1 where id=p_to_team_id;

  elsif p_transaction_type in ('sale','release') then
    if p_roster_player_id is null then raise exception 'Seleziona un giocatore della rosa'; end if;
    p_from_team_id:=v_player.team_id;
    update public.teams set credits=credits+p_credits, player_count=greatest(0,player_count-1) where id=p_from_team_id;
    delete from public.roster_players where id=p_roster_player_id;

  elsif p_transaction_type='transfer' then
    if p_roster_player_id is null or p_to_team_id is null then raise exception 'Giocatore e destinazione obbligatori'; end if;
    p_from_team_id:=v_player.team_id;
    if p_from_team_id=p_to_team_id then raise exception 'Le squadre devono essere diverse'; end if;
    select credits into v_to_credits from public.teams where id=p_to_team_id and league_id=p_league_id for update;
    if v_to_credits<p_credits then raise exception 'Crediti insufficienti'; end if;
    select max_players into v_max from public.leagues where id=p_league_id;
    select count(*) into v_to_count from public.roster_players where team_id=p_to_team_id;
    if v_to_count>=v_max then raise exception 'Rosa destinazione completa'; end if;

    update public.teams set credits=credits+p_credits, player_count=greatest(0,player_count-1) where id=p_from_team_id;
    update public.teams set credits=credits-p_credits, player_count=player_count+1 where id=p_to_team_id;
    update public.roster_players set team_id=p_to_team_id where id=p_roster_player_id;
  end if;

  insert into public.market_transactions(
    league_id,transaction_type,roster_player_id,player_name,player_role,
    from_team_id,to_team_id,credits,notes
  ) values(
    p_league_id,p_transaction_type,p_roster_player_id,
    coalesce(nullif(trim(p_player_name),''),v_player.player_name),
    coalesce(nullif(trim(p_player_role),''),v_player.player_role),
    p_from_team_id,p_to_team_id,p_credits,nullif(trim(p_notes),'')
  ) returning id into v_id;

  insert into public.activity_log(league_id,text)
  values(p_league_id,coalesce(nullif(trim(p_player_name),''),v_player.player_name)||' · operazione di mercato');

  return v_id;
end $$;

grant select on public.market_transactions to authenticated;
grant execute on function public.register_market_transaction(uuid,text,uuid,text,text,uuid,uuid,integer,text) to authenticated;


alter table public.auctions
  add column if not exists player_role text,
  add column if not exists minimum_bid integer not null default 1,
  add column if not exists deadline timestamptz,
  add column if not exists notes text,
  add column if not exists status text not null default 'open',
  add column if not exists winner_team_id uuid references public.teams(id) on delete set null,
  add column if not exists winning_bid integer;

create table if not exists public.auction_bids(
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  amount integer not null check(amount>=0),
  submitted_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(auction_id,team_id)
);

alter table public.auction_bids enable row level security;

drop policy if exists "team sees own bid" on public.auction_bids;
create policy "team sees own bid" on public.auction_bids
for select using(
  public.is_league_admin(league_id)
  or exists(
    select 1 from public.teams t
    where t.id=team_id and t.owner_user_id=auth.uid()
  )
);

drop policy if exists "team submits own bid" on public.auction_bids;
create policy "team submits own bid" on public.auction_bids
for insert with check(
  public.is_league_member(league_id)
  and (
    public.is_league_admin(league_id)
    or exists(
      select 1 from public.teams t
      where t.id=team_id and t.owner_user_id=auth.uid()
    )
  )
);

drop policy if exists "team updates own bid" on public.auction_bids;
create policy "team updates own bid" on public.auction_bids
for update using(
  public.is_league_admin(league_id)
  or exists(
    select 1 from public.teams t
    where t.id=team_id and t.owner_user_id=auth.uid()
  )
);

create or replace function public.submit_sealed_bid(
  p_auction_id uuid,
  p_team_id uuid,
  p_amount integer
)
returns void language plpgsql security definer set search_path=public
as $$
declare
  v_auction public.auctions%rowtype;
  v_team public.teams%rowtype;
begin
  select * into v_auction from public.auctions where id=p_auction_id for update;
  if not found then raise exception 'Asta non trovata'; end if;
  if v_auction.status<>'open' or v_auction.deadline<=now() then raise exception 'Asta chiusa'; end if;

  select * into v_team from public.teams where id=p_team_id and league_id=v_auction.league_id;
  if not found then raise exception 'Squadra non valida'; end if;

  if not public.is_league_admin(v_auction.league_id) and v_team.owner_user_id<>auth.uid() then
    raise exception 'Non puoi offrire per questa squadra';
  end if;
  if p_amount<v_auction.minimum_bid then raise exception 'Offerta inferiore al minimo'; end if;
  if p_amount>v_team.credits then raise exception 'Crediti insufficienti'; end if;

  insert into public.auction_bids(league_id,auction_id,team_id,amount)
  values(v_auction.league_id,p_auction_id,p_team_id,p_amount)
  on conflict(auction_id,team_id)
  do update set amount=excluded.amount,submitted_by=auth.uid(),updated_at=now();
end $$;

create or replace function public.close_sealed_auction(p_auction_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare
  v_auction public.auctions%rowtype;
  v_bid public.auction_bids%rowtype;
  v_max integer;
  v_count integer;
begin
  select * into v_auction from public.auctions where id=p_auction_id for update;
  if not found then raise exception 'Asta non trovata'; end if;
  if not public.is_league_admin(v_auction.league_id) then raise exception 'Solo amministratore'; end if;
  if v_auction.status='closed' then raise exception 'Asta già chiusa'; end if;
  if v_auction.deadline>now() then raise exception 'L''asta non è ancora scaduta'; end if;

  select * into v_bid
  from public.auction_bids
  where auction_id=p_auction_id
  order by amount desc, created_at asc
  limit 1;

  if found then
    if (select credits from public.teams where id=v_bid.team_id)<v_bid.amount then
      raise exception 'Il vincitore non ha più crediti sufficienti';
    end if;
    select max_players into v_max from public.leagues where id=v_auction.league_id;
    select count(*) into v_count from public.roster_players where team_id=v_bid.team_id;
    if v_count>=v_max then raise exception 'La rosa del vincitore è completa'; end if;

    update public.teams
    set credits=credits-v_bid.amount, player_count=player_count+1
    where id=v_bid.team_id;

    insert into public.roster_players(
      league_id,team_id,player_name,player_role,purchase_price,acquired_via
    ) values(
      v_auction.league_id,v_bid.team_id,v_auction.player_name,v_auction.player_role,v_bid.amount,'auction'
    );

    update public.auctions
    set status='closed',winner_team_id=v_bid.team_id,winning_bid=v_bid.amount
    where id=p_auction_id;

    insert into public.market_transactions(
      league_id,transaction_type,player_name,player_role,to_team_id,credits,notes
    ) values(
      v_auction.league_id,'purchase',v_auction.player_name,v_auction.player_role,v_bid.team_id,v_bid.amount,'Acquisto tramite asta a buste chiuse'
    );
  else
    update public.auctions set status='closed' where id=p_auction_id;
  end if;
end $$;

grant select on public.auction_bids to authenticated;
grant execute on function public.submit_sealed_bid(uuid,uuid,integer) to authenticated;
grant execute on function public.close_sealed_auction(uuid) to authenticated;


alter table public.matches
  add column if not exists matchday integer not null default 1,
  add column if not exists match_date timestamptz,
  add column if not exists home_score integer,
  add column if not exists away_score integer,
  add column if not exists notes text;

alter table public.matches
  drop constraint if exists matches_different_teams;
alter table public.matches
  add constraint matches_different_teams check(home_team_id<>away_team_id);

alter table public.matches
  drop constraint if exists matches_scores_nonnegative;
alter table public.matches
  add constraint matches_scores_nonnegative check(
    (home_score is null and away_score is null)
    or (home_score>=0 and away_score>=0)
  );

create index if not exists matches_league_matchday_idx
on public.matches(league_id,matchday,match_date);

drop policy if exists "members read matches" on public.matches;
create policy "members read matches" on public.matches
for select using(public.is_league_member(league_id));

drop policy if exists "admins manage matches" on public.matches;
create policy "admins manage matches" on public.matches
for all using(public.is_league_admin(league_id))
with check(public.is_league_admin(league_id));


-- =========================================================
-- BETA 1 — MIGRAZIONE DI STABILIZZAZIONE
-- =========================================================

-- Compatibilità tra il vecchio scheduled_at e il nuovo match_date.
alter table public.matches alter column scheduled_at drop not null;
update public.matches
set match_date = coalesce(match_date, scheduled_at),
    scheduled_at = coalesce(scheduled_at, match_date)
where match_date is null or scheduled_at is null;

create or replace function public.sync_match_dates()
returns trigger language plpgsql as $$
begin
  new.match_date := coalesce(new.match_date, new.scheduled_at);
  new.scheduled_at := coalesce(new.scheduled_at, new.match_date);
  return new;
end $$;

drop trigger if exists sync_match_dates_trigger on public.matches;
create trigger sync_match_dates_trigger
before insert or update on public.matches
for each row execute function public.sync_match_dates();

-- Correzione dei permessi asta: la squadra appartiene al coach_user_id.
drop policy if exists "team sees own bid" on public.auction_bids;
create policy "team sees own bid" on public.auction_bids
for select using(
  public.is_league_admin(league_id)
  or exists(
    select 1 from public.teams t
    where t.id=team_id and t.coach_user_id=auth.uid()
  )
);

drop policy if exists "team submits own bid" on public.auction_bids;
create policy "team submits own bid" on public.auction_bids
for insert with check(
  public.is_league_member(league_id)
  and (
    public.is_league_admin(league_id)
    or exists(
      select 1 from public.teams t
      where t.id=team_id and t.coach_user_id=auth.uid()
    )
  )
);

drop policy if exists "team updates own bid" on public.auction_bids;
create policy "team updates own bid" on public.auction_bids
for update using(
  public.is_league_admin(league_id)
  or exists(
    select 1 from public.teams t
    where t.id=team_id and t.coach_user_id=auth.uid()
  )
);

create or replace function public.submit_sealed_bid(
  p_auction_id uuid,
  p_team_id uuid,
  p_amount integer
)
returns void language plpgsql security definer set search_path=public
as $$
declare
  v_auction public.auctions%rowtype;
  v_team public.teams%rowtype;
begin
  select * into v_auction from public.auctions where id=p_auction_id for update;
  if not found then raise exception 'Asta non trovata'; end if;
  if v_auction.status<>'open' or v_auction.deadline<=now() then raise exception 'Asta chiusa'; end if;

  select * into v_team from public.teams where id=p_team_id and league_id=v_auction.league_id;
  if not found then raise exception 'Squadra non valida'; end if;

  if not public.is_league_admin(v_auction.league_id)
     and v_team.coach_user_id is distinct from auth.uid() then
    raise exception 'Non puoi offrire per questa squadra';
  end if;
  if p_amount<v_auction.minimum_bid then raise exception 'Offerta inferiore al minimo'; end if;
  if p_amount>v_team.credits then raise exception 'Crediti insufficienti'; end if;

  insert into public.auction_bids(league_id,auction_id,team_id,amount)
  values(v_auction.league_id,p_auction_id,p_team_id,p_amount)
  on conflict(auction_id,team_id)
  do update set amount=excluded.amount,submitted_by=auth.uid(),updated_at=now();
end $$;

-- Indici per le schermate principali.
create index if not exists auction_bids_league_auction_idx
on public.auction_bids(league_id,auction_id);

create index if not exists market_transactions_league_created_idx
on public.market_transactions(league_id,created_at desc);

create index if not exists roster_players_league_team_idx
on public.roster_players(league_id,team_id);


-- =========================================================
-- BETA 2 — IMPORTAZIONE BACKUP CONTROLLATA
-- =========================================================

create or replace function public.import_league_backup(
  p_target_league_id uuid,
  p_backup jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team jsonb;
  v_player jsonb;
  v_match jsonb;
  v_market jsonb;
  v_auction jsonb;
  v_old_id text;
  v_new_id uuid;
  v_team_map jsonb := '{}'::jsonb;
  v_team_count integer := 0;
  v_player_count integer := 0;
  v_match_count integer := 0;
  v_market_count integer := 0;
  v_auction_count integer := 0;
begin
  if not public.is_league_admin(p_target_league_id) then
    raise exception 'Solo proprietario o amministratore';
  end if;
  if coalesce(p_backup->>'format','') <> 'gestionale-magyc-backup' then
    raise exception 'Formato backup non valido';
  end if;

  for v_team in select value from jsonb_array_elements(coalesce(p_backup->'teams','[]'::jsonb))
  loop
    v_old_id := v_team->>'id';
    insert into public.teams(league_id,name,credits,player_count,coach_user_id)
    values(
      p_target_league_id,
      coalesce(nullif(trim(v_team->>'name'),''),'Squadra importata'),
      greatest(0,coalesce((v_team->>'credits')::integer,0)),
      0,
      null
    )
    returning id into v_new_id;
    v_team_map := v_team_map || jsonb_build_object(v_old_id,v_new_id::text);
    v_team_count := v_team_count + 1;
  end loop;

  for v_player in select value from jsonb_array_elements(coalesce(p_backup->'roster_players','[]'::jsonb))
  loop
    insert into public.roster_players(
      league_id,team_id,player_name,player_role,purchase_price,acquired_via
    ) values(
      p_target_league_id,
      nullif(v_team_map->>(v_player->>'team_id'),'')::uuid,
      coalesce(nullif(trim(v_player->>'player_name'),''),'Giocatore importato'),
      nullif(trim(v_player->>'player_role'),''),
      greatest(0,coalesce((v_player->>'purchase_price')::integer,0)),
      coalesce(nullif(v_player->>'acquired_via',''),'import')
    );
    v_player_count := v_player_count + 1;
  end loop;

  update public.teams t
  set player_count=(
    select count(*) from public.roster_players r where r.team_id=t.id
  )
  where t.league_id=p_target_league_id;

  for v_match in select value from jsonb_array_elements(coalesce(p_backup->'matches','[]'::jsonb))
  loop
    insert into public.matches(
      league_id,matchday,match_date,scheduled_at,home_team_id,away_team_id,
      home_score,away_score,notes
    ) values(
      p_target_league_id,
      greatest(1,coalesce((v_match->>'matchday')::integer,1)),
      coalesce((v_match->>'match_date')::timestamptz,(v_match->>'scheduled_at')::timestamptz),
      coalesce((v_match->>'scheduled_at')::timestamptz,(v_match->>'match_date')::timestamptz),
      nullif(v_team_map->>(v_match->>'home_team_id'),'')::uuid,
      nullif(v_team_map->>(v_match->>'away_team_id'),'')::uuid,
      nullif(v_match->>'home_score','')::integer,
      nullif(v_match->>'away_score','')::integer,
      nullif(trim(v_match->>'notes'),'')
    );
    v_match_count := v_match_count + 1;
  end loop;

  for v_market in select value from jsonb_array_elements(coalesce(p_backup->'market_transactions','[]'::jsonb))
  loop
    insert into public.market_transactions(
      league_id,transaction_type,player_name,player_role,
      from_team_id,to_team_id,credits,notes
    ) values(
      p_target_league_id,
      case when v_market->>'transaction_type' in ('purchase','sale','release','transfer')
        then v_market->>'transaction_type' else 'purchase' end,
      coalesce(nullif(trim(v_market->>'player_name'),''),'Giocatore importato'),
      nullif(trim(v_market->>'player_role'),''),
      nullif(v_team_map->>(v_market->>'from_team_id'),'')::uuid,
      nullif(v_team_map->>(v_market->>'to_team_id'),'')::uuid,
      greatest(0,coalesce((v_market->>'credits')::integer,0)),
      nullif(trim(v_market->>'notes'),'')
    );
    v_market_count := v_market_count + 1;
  end loop;

  for v_auction in select value from jsonb_array_elements(coalesce(p_backup->'auctions','[]'::jsonb))
  loop
    insert into public.auctions(
      league_id,player_name,player_role,minimum_bid,deadline,notes,status,
      winner_team_id,winning_bid
    ) values(
      p_target_league_id,
      coalesce(nullif(trim(v_auction->>'player_name'),''),'Giocatore importato'),
      nullif(trim(v_auction->>'player_role'),''),
      greatest(0,coalesce((v_auction->>'minimum_bid')::integer,1)),
      coalesce((v_auction->>'deadline')::timestamptz,now()),
      nullif(trim(v_auction->>'notes'),''),
      case when v_auction->>'status'='closed' then 'closed' else 'open' end,
      nullif(v_team_map->>(v_auction->>'winner_team_id'),'')::uuid,
      nullif(v_auction->>'winning_bid','')::integer
    );
    v_auction_count := v_auction_count + 1;
  end loop;

  insert into public.activity_log(league_id,text)
  values(
    p_target_league_id,
    format('Backup importato: %s squadre, %s giocatori, %s partite',
      v_team_count,v_player_count,v_match_count)
  );

  return jsonb_build_object(
    'teams',v_team_count,
    'players',v_player_count,
    'matches',v_match_count,
    'market_transactions',v_market_count,
    'auctions',v_auction_count
  );
end $$;

grant execute on function public.import_league_backup(uuid,jsonb) to authenticated;


-- =========================================================
-- RC1 — CONTROLLO DI COERENZA E INDICI
-- =========================================================

-- Garantisce che ogni partita abbia squadre della stessa lega.
create or replace function public.validate_match_teams()
returns trigger language plpgsql as $$
begin
  if not exists(
    select 1 from public.teams t
    where t.id=new.home_team_id and t.league_id=new.league_id
  ) then
    raise exception 'Squadra di casa non appartenente alla lega';
  end if;
  if not exists(
    select 1 from public.teams t
    where t.id=new.away_team_id and t.league_id=new.league_id
  ) then
    raise exception 'Squadra ospite non appartenente alla lega';
  end if;
  return new;
end $$;

drop trigger if exists validate_match_teams_trigger on public.matches;
create trigger validate_match_teams_trigger
before insert or update on public.matches
for each row execute function public.validate_match_teams();

create index if not exists matches_league_status_idx
on public.matches(league_id,home_score,away_score);

create index if not exists auctions_league_status_deadline_idx
on public.auctions(league_id,status,deadline);

create index if not exists teams_league_credits_idx
on public.teams(league_id,credits desc);
