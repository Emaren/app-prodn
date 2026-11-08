        # Session B, nonfinancial only: bounded public-profile ingress.
        # Limits are global to the aoe2war.com vhost, not a per-IP bypass.
        limit_req zone=aoe2war_player_profile_rate burst=3 nodelay;
        limit_conn aoe2war_player_profile_conn 2;
        limit_req_status 429;
        limit_conn_status 429;
