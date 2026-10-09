# Email templates

The emails byome sends for accounts, kept here as a backup. They're sent through Resend from `no-reply@byome.xyz`.

To change one, edit the file here, then paste its contents into **Supabase → Authentication → Email Templates** (and set the subject, which is written at the top of each file).

| File | Supabase template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Welcome to byome 🌱 Please confirm your email |
| `reset-password.html` | Reset password | Let's get you back into byome |

Notes:

- `{{ .ConfirmationURL }}` is the button link Supabase fills in. Keep it exactly as written.
- `{{ .Data.username }}` is the member's username, which is left out if it's missing.
- Styles are written on each tag (not in `style.css`) because email apps ignore separate stylesheets.
- The sprout picture loads from `https://byome.xyz/biome-assets/plant-welcome-sprout.png`, so don't rename that file.
