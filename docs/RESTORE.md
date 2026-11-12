# Restoring a GlobeFolio database backup

Backups are made weekly by `.github/workflows/backup.yml` and kept 30 days as an encrypted artifact
(GitHub > Actions > "Database backup" > latest run > Artifacts > database-backup).

1. Download and unzip the artifact. You get `globefolio-YYYY-MM-DD.dump.enc`.
2. Decrypt (use the BACKUP_PASSPHRASE you saved):
   `openssl enc -d -aes-256-cbc -pbkdf2 -in globefolio-YYYY-MM-DD.dump.enc -out backup.dump -pass pass:YOUR_PASSPHRASE`
3. Restore into a NEW Supabase project (never over a live one by accident):
   `pg_restore --no-owner --no-acl -d "NEW_DB_URL" backup.dump`
4. Point `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env` at the new project, rebuild, redeploy,
   and re-add the Google sign-in client and the SMTP settings in the new project.

Test a restore once into a throwaway project so you know it works before you ever need it.
