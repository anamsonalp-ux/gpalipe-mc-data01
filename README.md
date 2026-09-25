# Voter Tracker

Single-page voter tracking app (`index.html`) backed by Supabase with real-time sync.

Supabase credentials must never be committed to this repository. The browser only
needs the project URL and the **publishable** key (already embedded in `index.html`).
Secret / service-role keys belong in Netlify environment variables or a local,
git-ignored `.env.local` file.
