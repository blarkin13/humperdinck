# Cloudflare agent integration — Humperdinck

Based on Cloudflare's official [agent setup](https://developers.cloudflare.com/agent-setup/) and [Codex](https://developers.cloudflare.com/agent-setup/codex/) / [Claude Code](https://developers.cloudflare.com/agent-setup/claude-code/) guides.

## Project configuration already committed

The repository includes `.codex/config.toml` for Codex and `.mcp.json` for MCP-aware tools including Claude Code. Both declare:

- Cloudflare API MCP: `https://mcp.cloudflare.com/mcp`
- Cloudflare documentation MCP: `https://docs.mcp.cloudflare.com/mcp`

These contain **only public server URLs**. They do not authenticate anyone or create a D1 database. You must open the project in a compatible agent, approve the project's MCP configuration, and authorize Cloudflare through the OAuth browser screen.

## Choose your local coding agent

### Codex (CLI or desktop)

Open the Humperdinck repository in Codex. In the CLI, run:

```sh
cd ~/Projects/humperdinck
git pull
codex mcp list
codex
```

The MCP URLs are in the trusted project's `.codex/config.toml`. If your Codex installation does not load project-level MCP configuration, register them in your user config:

```sh
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp
codex mcp add cloudflare-docs --url https://docs.mcp.cloudflare.com/mcp
codex mcp list
```

To install **Cloudflare Skills**, run `/plugins` inside Codex, search for **Cloudflare**, and install the Cloudflare plugin. Complete the Cloudflare OAuth browser flow when prompted.

### Claude Code

Open the project in Claude Code:

```sh
cd ~/Projects/humperdinck
git pull
claude
```

Inside Claude Code, follow Cloudflare's official commands in order:

```text
/plugin marketplace add cloudflare/skills
/plugin install cloudflare@cloudflare
```

Restart/reload plugins as instructed, and authorize the Cloudflare MCP connection in your browser. `claude mcp list` can confirm registered servers. The repository `.mcp.json` also declares the Cloudflare MCP URLs for compatible clients.

### ChatGPT (this web chat)

ChatGPT cannot inherit a Codex/Claude local MCP configuration. To use Cloudflare directly in ChatGPT, connect a compatible Cloudflare plugin in **Settings → Plugins** if offered, or add Cloudflare's remote MCP server as a custom connection if your workspace supports custom MCP connections. Complete its OAuth flow and approve only the permissions you need. If no Cloudflare integration or custom MCP option is available, account management must be done from your connected coding agent or authenticated Wrangler CLI.

## Finish Humperdinck customer accounts

After Cloudflare MCP has been authorized, ask the connected coding agent:

> In blarkin13/humperdinck, follow docs/ACCOUNTS_SETUP.md. Inspect the active Cloudflare account and the humperdinck.studio Worker. Create the humperdinck-accounts D1 database if missing, apply migrations, add the real AUTH_DB binding to wrangler.jsonc, and configure the Worker secret AUTH_RATE_SECRET. Do not publish OAuth login until Google client credentials are configured; do not expose or commit any secrets. Validate /api/account/config and test Google OAuth.

This is a separate step from agent integration. OAuth **requires user-provisioned provider credentials** and signing in to the relevant account.

## Verification

- `codex mcp list` or `claude mcp list` shows the Cloudflare MCP endpoint.
- A Cloudflare API tool prompts for account authorization when first used.
- `npx wrangler whoami` checks Wrangler's authentication separately. Do not paste access tokens into chat.
- Confirm `https://humperdinck.studio/api/account/config` after D1 and OAuth setup; actual account login is not activated by these project files alone.

Cloudflare skills and server integration give an agent account access **only after** the user authenticates. No automatic production deployment or account modification is performed by adding these configuration files.
