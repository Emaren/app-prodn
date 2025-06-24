// /var/www/app-prodn/ecosystem.config.js
module.exports = {
  apps: [
    {
      /* ──────────────── process meta ──────────────── */
      name : 'app-prodn',
      cwd  : '/var/www/app-prodn',

      // Run the server produced by `next build`
      script : 'node_modules/.bin/next',
      args   : 'start -H 127.0.0.1 -p 3004',

      /* ──────────────── environment ──────────────── */
      env: {
        NODE_ENV: 'production',

        /* Next.js → FastAPI */
        NEXT_PUBLIC_API_BASE_URL: 'https://api-prodn.aoe2hdbets.com',
        NEXT_PUBLIC_CHAIN_ID    : '11865',

        /* Firebase Admin (server only) */
        GOOGLE_APPLICATION_CREDENTIALS: '/etc/keys/firebase-admin.json',

        /* Firebase Web SDK (browser) */
        NEXT_PUBLIC_FIREBASE_API_KEY            : 'AIzaSyC_7CGvSRBY2t3Riy5IMtrfTXcd2BZbdA8',
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        : 'aoe2hd.firebaseapp.com',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID         : 'aoe2hd',
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     : 'aoe2hd.appspot.com',
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '640514020315',
        NEXT_PUBLIC_FIREBASE_APP_ID             : '1:640514020315:web:223fa4c08cd8c85e080dfe'
      },

      /* ──────────────── PM2 niceties ──────────────── */
      instances    : 1,      // keep it single-instance; Nginx handles load-balancing
      exec_mode    : 'fork',
      restart_delay: 500
    }
  ]
};
