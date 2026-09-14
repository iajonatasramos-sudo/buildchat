-- BuildChat — limite de assentos garantido no banco
--
-- Agora o admin cria o usuário direto (e-mail + senha) em vez de convidar, então
-- a checagem que existia dentro de `aceitar_convite` precisa valer para qualquer
-- inserção ou reativação.

create or replace function public.checar_assentos() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_usados integer;
  v_limite integer;
begin
  -- só interessa quando o usuário passa a ocupar assento
  if tg_op = 'UPDATE' and not (new.ativo and not old.ativo) then
    return new;
  end if;
  if tg_op = 'INSERT' and not new.ativo then
    return new;
  end if;

  select count(*) into v_usados
    from usuarios u
   where u.empresa_id = new.empresa_id and u.ativo and u.id <> new.id;

  select assentos into v_limite from empresas where id = new.empresa_id;

  if v_usados >= coalesce(v_limite, 0) then
    raise exception 'limite de assentos da empresa atingido';
  end if;
  return new;
end $$;

drop trigger if exists trg_usuarios_assentos on usuarios;
create trigger trg_usuarios_assentos
  before insert or update of ativo on usuarios
  for each row execute function public.checar_assentos();
