# mcp-figma-demo

Export PNG images from Figma with caching support. A CLI tool (Phase 1) with planned MCP Server support (Phase 2) for AI integration.

## Features

- 🖼️ Export high-resolution PNG images from Figma
- 💾 Smart caching to avoid hitting rate limits
- 📊 Optional metadata export (JSON)
- ⚡ Rate limit handling with automatic retry
- 🔐 Secure token management via environment variables

## Prerequisites

- Node.js >= 22.0.0
- pnpm (recommended) or npm
- Figma Personal Access Token

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd mcp-figma-demo

# Install dependencies
pnpm install

# Set up Git hooks (for development)
pnpm simple-git-hooks

# Build the project
pnpm build
```

## Configuration

### Figma Token

Set your Figma Personal Access Token as an environment variable:

```bash
export FIGMA_PERSONAL_TOKEN="your-token-here"
```

Or pass it via the `--token` option (not recommended for security reasons).

### Get Your Figma Personal Access Token

1. Go to [Figma Account Settings](https://www.figma.com/settings)
2. Scroll to "Personal access tokens"
3. Click "Create a new personal access token"
4. Give it a name and click "Create"
5. Copy the token (you won't be able to see it again!)

## Usage

### Basic Usage

```bash
# Export a single node
mcp-figma-demo "https://www.figma.com/file/ABC123/..." --nodes "1:2"

# Export multiple nodes
mcp-figma-demo "https://www.figma.com/file/ABC123/..." --nodes "1:2,1:3,1:4"

# Export with metadata
mcp-figma-demo "https://www.figma.com/file/ABC123/..." --nodes "1:2" --with-metadata
```

### Options

```
-o, --output <dir>         Output directory (default: ./output)
-t, --token <token>        Figma Personal Access Token (or use FIGMA_PERSONAL_TOKEN env var)
-n, --nodes <ids>          Comma-separated list of node IDs
-s, --scale <number>       Scale factor 1-4 (default: 2)
--format <format>          Image format: png, jpg, svg, pdf (default: png)
--no-cache                 Do not use cache
--with-metadata            Save metadata JSON alongside images
--verbose                  Show verbose output
```

### Advanced Examples

```bash
# High-resolution export (scale=3)
mcp-figma-demo "https://www.figma.com/file/ABC123/..." \
  --nodes "1:2" \
  --scale 3 \
  --with-metadata

# Custom output directory
mcp-figma-demo "https://www.figma.com/file/ABC123/..." \
  --nodes "1:2" \
  --output ./my-exports

# Force refresh (ignore cache)
mcp-figma-demo "https://www.figma.com/file/ABC123/..." \
  --nodes "1:2" \
  --no-cache
```

## File Naming

Exported files are named with the following format:

```
{fileKey}_{nodeId}_{nodeName}.png
{fileKey}_{nodeId}_{nodeName}.json  # Metadata (if --with-metadata)
```

Example:
```
ABC123_1-2_login_screen.png
ABC123_1-2_login_screen.json
```

## Caching

- API responses are cached in `.cache/` directory
- Default TTL: 24 hours
- Cache is automatically used on subsequent runs
- Use `--no-cache` to force a fresh API call

## Rate Limits

Figma API has rate limits (Tier 1: 10-20 req/min). This tool:

- ✅ Caches API responses to minimize requests
- ✅ Automatically retries on 429 errors
- ✅ Respects `Retry-After` headers
- ✅ Batches multiple nodes in a single API call

## Development

```bash
# Run in development mode
pnpm dev

# Format code
pnpm format

# Lint code
pnpm lint

# Check code (format + lint)
pnpm check
```

## Project Structure

```
mcp-figma-demo/
├── src/
│   ├── cli/              # CLI implementation
│   ├── client/           # Figma API client & cache
│   ├── core/             # Core functionality
│   └── utils/            # Utilities
├── .cache/               # API response cache (gitignored)
├── output/               # Exported images (gitignored)
└── dist/                 # Compiled output (gitignored)
```

## Troubleshooting

### "Figma token is required"

Make sure you've set the `FIGMA_PERSONAL_TOKEN` environment variable or pass `--token` option.

### "Invalid Figma URL"

Ensure your URL follows the format:
- `https://www.figma.com/file/{fileKey}/...`
- `https://www.figma.com/design/{fileKey}/...`

### "No image URL for node"

The node ID might be invalid or the node doesn't exist in the file. Check:
1. The node ID is correct (you can get it from Figma by right-clicking a layer)
2. You have access to the file

### Rate limit errors (429)

The tool automatically retries, but if you're making many requests:
1. Let the cache do its job (don't use `--no-cache` unnecessarily)
2. Wait a few minutes between large batch exports

## Future Plans (Phase 2)

- 🤖 MCP Server implementation for AI integration
- ✂️ Image cropping functionality using sharp
- ⚙️ Configuration file support
- 📝 Batch operations with config files

## License

Apache 2.0
