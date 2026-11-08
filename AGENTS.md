# Humperdinck project agent instructions

## Cloudflare development

- The website and API use Cloudflare Workers with static assets; the Wrangler configuration is `wrangler.jsonc` in the repository root.
- Use Cloudflare's official `wrangler` skill and current Cloudflare documentation for Workers, D1, secrets, deployment and migrations.
- The Cloudflare API MCP endpoint is `https://mcp.cloudflare.com/mcp`; documentation MCP is `https://docs.mcp.cloudflare.com/mcp`. Authenticate through the supported browser OAuth flow, with only the required scopes.
- For this existing Wrangler project, prefer `npx wrangler` for local development, Workers deployment and D1 management. Use the Cloudflare MCP server for account APIs when available.
- Account setup instructions: `docs/ACCOUNTS_SETUP.md`. OAuth sessions and browser sign-in are separate from permanent offline Pro licensing.
- Never commit Cloudflare API tokens, OAuth client secrets, private signing keys, user session tokens, .dev.vars, or account authorization artifacts. Use secrets and environment-specific bindings.
- Before running migrations, deployments, modifying DNS, or changing production environment bindings, inspect the target environment and verify it matches the requested project. Avoid destructive operations without user approval.
- Never require a Cloudflare account or a network request for Free desktop narration. Users' local voice recordings, project files, and AI model weights stay local unless the user explicitly shares them.

See `docs/CLOUDFLARE_AGENT_SETUP.md` for how to connect your coding agent.
