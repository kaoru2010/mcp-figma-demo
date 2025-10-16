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

## MCP Server (Phase 2)

This project now includes an MCP (Model Context Protocol) Server that allows AI assistants like Claude to directly interact with the Figma API.

### MCP Server Features

The MCP server provides three tools for AI interaction:

1. **`figma_export_image`** - Export images from Figma
2. **`figma_get_node_info`** - Get detailed node information and hierarchy
3. **`figma_list_exports`** - List previously exported images

### Starting the MCP Server

```bash
# Build the project first
pnpm build

# Start the MCP server
pnpm mcp
```

The server runs on stdio and communicates using the Model Context Protocol.

### Configuring MCP Server in Claude Desktop

Add the following configuration to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "figma": {
      "command": "node",
      "args": ["/path/to/mcp-figma-demo/dist/mcp/index.js"],
      "env": {
        "FIGMA_PERSONAL_TOKEN": "your-figma-token-here"
      }
    }
  }
}
```

Replace `/path/to/mcp-figma-demo` with the actual path to this project.

### Using MCP Server with AI

Once configured, you can ask Claude to:

```
Export this Figma design: https://www.figma.com/file/ABC123/...?node-id=1-2

Get information about the nodes in this Figma file: https://www.figma.com/file/ABC123/...

List all previously exported Figma images
```

The AI will use the MCP tools to interact with Figma and provide structured responses.

### MCP Tool Details

#### figma_export_image

Exports images from Figma and saves them locally.

**Parameters:**
- `figmaUrl` (required): Figma file URL
- `nodeIds` (optional): Array of node IDs to export
- `scale` (optional): Scale factor 1-4 (default: 2)
- `format` (optional): Image format - png, jpg, svg, pdf (default: png)
- `outputDir` (optional): Output directory (default: ./output)
- `withMetadata` (optional): Save metadata JSON (default: true)
- `useCache` (optional): Use cached responses (default: true)

**Returns:**
```json
{
  "success": true,
  "fileKey": "ABC123",
  "nodeIds": ["1:2"],
  "outputDir": "./output",
  "exportedFiles": [
    {
      "image": "./output/ABC123_1-2_screen.png",
      "metadata": "./output/ABC123_1-2_screen.json",
      "nodeId": "1:2"
    }
  ],
  "message": "Successfully exported 1 image(s)"
}
```

#### figma_get_node_info

Retrieves detailed node information including hierarchy, positions, and sizes.

**Parameters:**
- `figmaUrl` (required): Figma file URL
- `nodeIds` (optional): Array of node IDs
- `useCache` (optional): Use cached responses (default: true)
- `includeChildren` (optional): Include child nodes (default: true)
- `maxDepth` (optional): Maximum tree depth (default: 10)

**Returns:**
```json
{
  "success": true,
  "fileKey": "ABC123",
  "fileName": "Design File",
  "lastModified": "2025-01-01T00:00:00Z",
  "nodes": [
    {
      "nodeId": "1:2",
      "hierarchy": {
        "id": "1:2",
        "name": "Login Screen",
        "type": "FRAME",
        "bounds": {
          "x": 0,
          "y": 0,
          "width": 375,
          "height": 812
        },
        "children": [...]
      }
    }
  ],
  "message": "Retrieved information for 1 node(s)"
}
```

#### figma_list_exports

Lists previously exported images and their metadata.

**Parameters:**
- `outputDir` (optional): Directory to list (default: ./output)
- `fileKey` (optional): Filter by file key

**Returns:**
```json
{
  "success": true,
  "outputDir": "./output",
  "exports": [
    {
      "image": "./output/ABC123_1-2_screen.png",
      "metadata": "./output/ABC123_1-2_screen.json",
      "fileKey": "ABC123",
      "nodeId": "1:2",
      "nodeName": "screen",
      "exportedAt": "2025-01-01T00:00:00Z",
      "size": 123456
    }
  ],
  "count": 1,
  "message": "Found 1 exported image(s)"
}
```

## Future Plans

- ✂️ Image cropping functionality using sharp
- ⚙️ Configuration file support
- 📝 Batch operations with config files

## License

Apache 2.0
