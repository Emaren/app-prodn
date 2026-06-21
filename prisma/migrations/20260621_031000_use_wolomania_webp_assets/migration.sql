update event_tiles
set player_one_avatar_url = '/uploads/managed-assets/wolomania/jim_warrior.webp',
    updated_at = now()
where player_one_avatar_url = '/uploads/managed-assets/wolomania/jim_warrior.png';

update event_tiles
set player_two_avatar_url = '/uploads/managed-assets/wolomania/julio_warrior.webp',
    updated_at = now()
where player_two_avatar_url = '/uploads/managed-assets/wolomania/julio_warrior.png';

update event_tiles
set commissioner_avatar_url = '/uploads/managed-assets/wolomania/emaren_warrior_2.webp',
    updated_at = now()
where commissioner_avatar_url = '/uploads/managed-assets/wolomania/emaren_warrior_2.png';

update event_tiles
set background_image_url = '/uploads/managed-assets/wolomania/wolomania.webp',
    updated_at = now()
where background_image_url = '/uploads/managed-assets/wolomania/wolomania.png';

update event_tiles
set mobile_background_image_url = '/uploads/managed-assets/wolomania/wolomania.webp',
    updated_at = now()
where mobile_background_image_url = '/uploads/managed-assets/wolomania/wolomania.png';
