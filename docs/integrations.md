# Connecting other software to DockyDoc

DockyDoc can act for you inside other tools: a WhatsApp bot, an assistant, a
script. You give the tool a personal API key; from then on it can find your
documents from a plain sentence, get a download link for them, and store new
ones. Everything it does, it does as you, in the workspaces you belong to.

Two ways in, same key for both.

- **REST**, for anything that can make an HTTP call.
- **MCP**, for assistants that speak the Model Context Protocol (Claude, and
  bots built on it). The MCP server exposes the same operations as tools.

## 1. Make a key

Settings → Integrations → New key. Name it after the thing you are
connecting ("Clawdbot on WhatsApp"). Leave "Allow uploads and changes" off
unless the tool needs to save files; a read-only key can find and download but
cannot change anything, so a leak costs less.

The key is shown once. Copy it into the other tool. If you lose it, revoke it
and make another; the old one stops working the moment you revoke it.

Keys look like `dd_live_` followed by 40 characters. Send one as
`Authorization: Bearer dd_live_…` on every request.

## 2. REST

Base URL: `https://dockydoc.app/api/v1/integrations`

### The one call a bot needs

```
POST /integrations/fetch
{ "query": "my passport and UK visa", "expiresInMinutes": 15 }
```

Response, one item per document asked for:

```json
{
  "mode": "ai",
  "items": [
    {
      "ask": "passport",
      "match": { "id": "…", "name": "Alice passport", "fileName": "passport.pdf", "confidence": 0.95, "labels": ["passport", "travel"], "workspace": { "id": "…", "name": "Alice's Workspace" } },
      "alternatives": [],
      "delivery": { "url": "https://dockydoc.app/api/v1/public/shares/…/download", "fileName": "passport.pdf", "mimeType": "application/pdf", "expiresAt": "2026-09-17T18:45:00Z" },
      "needsChoice": false
    },
    {
      "ask": "UK visa",
      "match": { "name": "UK visa 2024", "confidence": 0.55, "…": "…" },
      "alternatives": [{ "name": "UK visa 2019", "…": "…" }],
      "delivery": null,
      "needsChoice": true
    }
  ]
}
```

Read it like this. When `delivery` is set, send the person the `url`; it needs
no login and dies at `expiresAt` (default 15 minutes, up to a day). When
`needsChoice` is true, DockyDoc was not sure enough to hand a document over:
show `match` and `alternatives` to the person, let them pick, then call
`/integrations/deliver` with the id they chose. That is the whole protocol.
Sending the wrong passport is worse than asking.

`mode` says how the matching was done. `ai` uses Claude; `lexical` is a
word-overlap fallback used when the server has no Anthropic key or the call
failed. Both return the same shape.

### The other calls

| Call | Purpose |
|---|---|
| `GET /integrations/me` | Who the key belongs to, whether it can write, and their workspaces. Use it to check a key works. |
| `POST /integrations/find` `{query, workspaceId?}` | Matching only, no links. Same items as `fetch` minus `delivery`. |
| `POST /integrations/deliver` `{documentIds[], expiresInMinutes?}` | Links for documents you already know the ids of. Up to 10 at a time. |
| `POST /integrations/upload` (multipart: `file`, `name?`, `description?`, `labels?`, `workspaceId?`) | Store a file as a new document. `labels` is comma-separated names, created if missing. Needs a key with write access. |

Every other endpoint in the API also accepts a key, with one rule: a
read-only key can only make GET requests there. The interactive reference is
at https://dockydoc.app/api/docs (OpenAPI JSON at /api/docs-json); the public
guide with examples is https://dockydoc.app/developers.

### Example with curl

```bash
KEY=dd_live_…
curl -s https://dockydoc.app/api/v1/integrations/fetch \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"query": "my passport"}'
```

## 3. MCP

Server URL: `https://dockydoc.app/api/v1/mcp`, transport Streamable HTTP,
header `Authorization: Bearer dd_live_…`. Stateless, so no session handling.

Tools:

| Tool | Does |
|---|---|
| `whoami` | Same as `GET /integrations/me`. |
| `find_documents` `{query, workspaceId?}` | Same as `POST /integrations/find`. |
| `get_download_links` `{documentIds, expiresInMinutes?}` | Same as `POST /integrations/deliver`. |
| `fetch_documents` `{query, workspaceId?, expiresInMinutes?}` | Same as `POST /integrations/fetch`. The tool description tells the assistant to put alternatives to the person when `needsChoice` is true. |
| `upload_document` `{fileName, mimeType, contentBase64, name?, labels?, workspaceId?}` | Same as `POST /integrations/upload`, with the file as base64. |

## 4. Clawdbot, or any WhatsApp bot

The bot receives "Provide me my passport and UK visa" from your number. It
should:

1. Call `POST /integrations/fetch` with that sentence as `query`.
2. For each item with `delivery`, send the `url` (or download the file and
   attach it, the link serves the bytes with the right file name).
3. For each item with `needsChoice`, list `match` and `alternatives` by name
   and ask which one. When the person answers, call `/integrations/deliver`
   with that document's id.

If Clawdbot supports MCP servers, add `https://dockydoc.app/api/v1/mcp` with
the key and it gets the same behaviour through `fetch_documents` without any
of the above being written by hand. If it supports "HTTP tools" or webhooks,
give it the REST call in step 1.

Whose documents: the key's owner's. A bot serving several people needs one
key per person, each made from that person's DockyDoc account.

## 5. What is logged and what to watch

Every link handed out is an ordinary external share on the document, visible
in its share list and revocable there, and each download of it is recorded
with time, IP and user agent. Key creation and use show up on the key itself
(`lastUsedAt`). Revoking a key is instant.

Links are bearer tokens: anyone holding one can download until it expires.
Keep `expiresInMinutes` short for anything like a passport. The default is 15.

Rate limit: 100 requests a minute per IP, shared with the rest of the API.
