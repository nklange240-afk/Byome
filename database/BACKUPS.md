# Backing up Byome (free plan)

Supabase's free plan doesn't keep backups, so this makes your own copy of everything members have written: reviews, posts, comments, profiles, points, shelves and settings. It takes about 2 minutes once it's set up. Do it **once a week**, and before running any big SQL file.

You need a computer (these steps are for Windows). It can't be done from a phone.

---

## One-time setup (about 10 minutes)

### 1. Install the backup tool
1. Go to **postgresql.org/download/windows** and click **Download the installer**. Pick the newest version (17 or higher).
2. Run the installer. When it asks which **components** to install, untick everything except **Command Line Tools**.
3. Click through the rest. You don't need to set up a database or remember any password it mentions.

### 2. Get your database's address
1. Open your project in the **Supabase dashboard** and click **Connect** at the top.
2. Choose **Session pooler**, and copy the address. It looks like:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
3. Replace `[YOUR-PASSWORD]` (including the brackets) with your **database password**.
   - Forgot it? **Project Settings → Database → Reset database password**. This doesn't affect the website, which uses a different key.
4. Keep this full address somewhere private, like a password manager. It opens your whole database, so **never** share it or put it on GitHub.

### 3. Make a folder for backups
Make a folder called **Byome backups** in your Documents. Ideally use one that syncs to OneDrive or Google Drive, so there's a copy off your computer too.

---

## Every week (about 2 minutes)

1. Open **PowerShell** (search for it in the Start menu).
2. Paste this, swapping in your address from step 2 between the quotes, and press Enter:

```
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" "PASTE-YOUR-ADDRESS-HERE" --schema=public --no-owner --no-privileges --file "$HOME\Documents\Byome backups\byome-$(Get-Date -Format yyyy-MM-dd).sql"
```

(If you installed a different version, change the `17` to that number.)

3. After a few seconds, a file like `byome-2026-10-23.sql` appears in your Byome backups folder. That's your backup.

**Tip:** save the full command, with your address in it, in your password manager. Then each week is just copy, paste and Enter.

### Check that it worked
Open the file in Notepad. It should start with `-- PostgreSQL database dump` and further down contain lines like `COPY public.reviews`. If it's only a few lines long, or PowerShell showed red text, send me the message and I'll help.

### Optional: member accounts too
The weekly backup has everyone's content, but not the login accounts (emails and scrambled passwords). For a copy of those as well, run this second command once a month:

```
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" "PASTE-YOUR-ADDRESS-HERE" --data-only --table=auth.users --table=auth.identities --no-owner --no-privileges --file "$HOME\Documents\Byome backups\byome-accounts-$(Get-Date -Format yyyy-MM-dd).sql"
```

---

## Keep them safe and tidy
- **These files contain members' information** (and the accounts file has email addresses). Keep them private: never post them, email them around, or upload them to GitHub.
- **Keep about the last 8 weekly files** and delete older ones.
- **Profile pictures** aren't included. They're in Supabase **Storage**, and losing them would only mean members re-uploading them.

## If you ever need to restore
Don't try it alone. Message me with the backup file's name and what happened, and we'll restore it carefully, ideally into a fresh project first, so nothing gets overwritten by mistake.

## When to switch to Pro instead
Supabase Pro (about $25 a month) makes automatic daily backups you can restore in a couple of taps, so you can stop doing this. It's worth it once the beta has regular members, or as soon as remembering every week feels like a chore.
