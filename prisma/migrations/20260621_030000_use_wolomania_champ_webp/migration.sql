update event_tiles
set belt_image_url = '/uploads/managed-assets/wolomania/aoe2war_champ.webp',
    updated_at = now()
where belt_image_url = '/uploads/managed-assets/wolomania/aoe2war_champ.png';
