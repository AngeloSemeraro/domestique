# Deploying Domestique

Two things ship on every change: the **GitHub repo** and the **live WordPress
site**. The GitHub side works from anywhere. The WordPress side (SFTP/FTP)
needs real outbound SSH/FTP access, which the **cloud** Claude Code
environment does not have — so the upload must run from a **local** session
(Claude Code on your own computer) or your own terminal.

## One-time setup (local machine)

1. Install `lftp`:
   - macOS: `brew install lftp`
   - Debian/Ubuntu: `sudo apt-get install lftp`
2. Copy the credentials template and fill it in:
   ```bash
   cp scripts/.env.deploy.example scripts/.env.deploy
   # edit scripts/.env.deploy — it is gitignored, stays on your machine
   ```
   If `DEPLOY_METHOD=sftp` fails to authenticate (some shared hosts only allow
   the FTP sub-account over FTP, not SSH), switch to `DEPLOY_METHOD=ftps` and
   `DEPLOY_PORT=21`.

## Deploy

```bash
./scripts/deploy.sh
```

Builds the plugin bundle and mirrors `wordpress-plugin/domestique/` to the
server. That's the whole WordPress deploy — no zip, no wp-admin upload.

## End-of-session routine (what Claude does locally)

When work is done and verified, from a local session:

1. Commit the changes.
2. Push the branch to GitHub (and open/merge the PR as usual).
3. Run `./scripts/deploy.sh` to publish the plugin to the live site.

## Security

`scripts/.env.deploy` holds the host password and is gitignored — it must
never be committed or pasted into a chat transcript. Prefer SSH-key auth if
your host supports it (then you can leave `DEPLOY_PASS` as a dummy and add
`-i ~/.ssh/yourkey` handling). Rotate any password that has been shared in
plaintext anywhere.
