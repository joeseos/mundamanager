
declare
  _gang_id uuid;
  _gang_meat int;
begin
  -- Get gang info
  select gang_id, gangs.meat into _gang_id, _gang_meat
  from fighters
  join gangs on gangs.id = fighters.gang_id
  where fighters.id = fighter_id;

  -- Check if gang has meat
  if _gang_meat < 1 then
    return json_build_object(
      'success', false,
      'message', 'Not enough meat to feed fighter'
    );
  end if;

  -- Update gang meat and fighter status in a transaction
  update gangs set meat = meat - 1 where id = _gang_id;
  update fighters set starved = false where id = fighter_id;

  return json_build_object(
    'success', true,
    'message', 'Fighter has been fed'
  );
end;
