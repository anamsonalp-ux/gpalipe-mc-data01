# Gibson Palipe Voter Database

A single-page, real-time voter ledger for the Mendi Central Open campaign, built on Supabase.

`index.html` connects to Supabase with the project URL and the **publishable** key. Both are safe to ship to the browser. Access is controlled by Row Level Security on the `voters` table.

Never commit secret or service-role keys to this repository. Keep them in Netlify environment variables or the Supabase dashboard.
