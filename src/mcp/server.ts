#!/usr/bin/env node

// Copyright 2025
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CacheManager } from '../client/cache.js';
import { FigmaApiClient } from '../client/figma-api.js';
import type { Node } from '../client/types.js';
import { ImageExporter } from '../core/image-exporter.js';
import { normalizeNodeId, parseFileKey, parseNodeId } from '../core/url-parser.js';

// Zod schemas for tool inputs
const ExportImageSchema = z.object({
  figmaUrl: z.string().describe('Figma file URL (e.g., https://www.figma.com/file/...)'),
  nodeIds: z
    .array(z.string())
    .optional()
    .describe('Node IDs to export (optional if URL contains node-id)'),
  scale: z.number().min(1).max(4).default(2).describe('Scale factor (1-4, default: 2)'),
  format: z.enum(['png', 'jpg', 'svg', 'pdf']).default('png').describe('Image format'),
  outputDir: z.string().default('./output').describe('Output directory path'),
  withMetadata: z.boolean().default(true).describe('Save metadata JSON alongside images'),
  useCache: z.boolean().default(true).describe('Use cached API responses'),
});

const GetNodeInfoSchema = z.object({
  figmaUrl: z.string().describe('Figma file URL'),
  nodeIds: z
    .array(z.string())
    .optional()
    .describe('Node IDs to get info for (optional if URL contains node-id)'),
  useCache: z.boolean().default(true).describe('Use cached API responses'),
  includeChildren: z
    .boolean()
    .default(true)
    .describe('Include child nodes in hierarchy (default: true)'),
  maxDepth: z.number().default(10).describe('Maximum depth of node tree to return (default: 10)'),
});

const ListExportsSchema = z.object({
  outputDir: z.string().default('./output').describe('Output directory to list'),
  fileKey: z.string().optional().describe('Filter by file key (optional)'),
});

// Helper function to build node hierarchy for AI consumption
interface NodeInfo {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  children?: NodeInfo[];
}

function buildNodeHierarchy(
  node: Node,
  origin: { x: number; y: number },
  depth: number,
  maxDepth: number,
  includeChildren: boolean,
): NodeInfo {
  const nodeInfo: NodeInfo = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
  };

  // Add bounds if available (relative to origin)
  if (node.absoluteBoundingBox) {
    const bbox = node.absoluteBoundingBox;
    nodeInfo.bounds = {
      x: Math.round(bbox.x - origin.x),
      y: Math.round(bbox.y - origin.y),
      width: Math.round(bbox.width),
      height: Math.round(bbox.height),
    };
  }

  // Add children recursively if requested and within depth limit
  if (includeChildren && node.children && node.children.length > 0 && depth < maxDepth) {
    nodeInfo.children = node.children.map((child) =>
      buildNodeHierarchy(child, origin, depth + 1, maxDepth, includeChildren),
    );
  }

  return nodeInfo;
}

export class FigmaMCPServer {
  private server: Server;
  private cacheManager: CacheManager;
  private figmaToken: string;

  constructor() {
    this.figmaToken = process.env.FIGMA_PERSONAL_TOKEN || '';
    if (!this.figmaToken) {
      throw new Error(
        'FIGMA_PERSONAL_TOKEN environment variable is required. Please set it before starting the MCP server.',
      );
    }

    this.cacheManager = new CacheManager();
    this.server = new Server(
      {
        name: 'figma-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'figma_export_image',
            description:
              'Export images from Figma. Returns exported file paths and metadata. Use this when you need to download and save Figma designs as image files.',
            inputSchema: {
              type: 'object',
              properties: {
                figmaUrl: {
                  type: 'string',
                  description: 'Figma file URL (e.g., https://www.figma.com/file/...)',
                },
                nodeIds: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Node IDs to export (optional if URL contains node-id parameter)',
                },
                scale: {
                  type: 'number',
                  description: 'Scale factor (1-4, default: 2)',
                  default: 2,
                  minimum: 1,
                  maximum: 4,
                },
                format: {
                  type: 'string',
                  enum: ['png', 'jpg', 'svg', 'pdf'],
                  description: 'Image format (default: png)',
                  default: 'png',
                },
                outputDir: {
                  type: 'string',
                  description: 'Output directory path (default: ./output)',
                  default: './output',
                },
                withMetadata: {
                  type: 'boolean',
                  description: 'Save metadata JSON alongside images (default: true)',
                  default: true,
                },
                useCache: {
                  type: 'boolean',
                  description: 'Use cached API responses to avoid rate limits (default: true)',
                  default: true,
                },
              },
              required: ['figmaUrl'],
            },
          },
          {
            name: 'figma_get_node_info',
            description:
              'Get detailed node information and hierarchy from Figma. Returns structured node data including names, types, positions, sizes, and child elements. Useful for understanding the structure of a Figma design before exporting.',
            inputSchema: {
              type: 'object',
              properties: {
                figmaUrl: {
                  type: 'string',
                  description: 'Figma file URL',
                },
                nodeIds: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Node IDs to get info for (optional if URL contains node-id)',
                },
                useCache: {
                  type: 'boolean',
                  description: 'Use cached API responses (default: true)',
                  default: true,
                },
                includeChildren: {
                  type: 'boolean',
                  description: 'Include child nodes in hierarchy (default: true)',
                  default: true,
                },
                maxDepth: {
                  type: 'number',
                  description: 'Maximum depth of node tree to return (default: 10)',
                  default: 10,
                  minimum: 1,
                  maximum: 50,
                },
              },
              required: ['figmaUrl'],
            },
          },
          {
            name: 'figma_list_exports',
            description:
              'List previously exported images and their metadata. Returns a list of exported files with their metadata. Useful for checking what has been exported.',
            inputSchema: {
              type: 'object',
              properties: {
                outputDir: {
                  type: 'string',
                  description: 'Output directory to list (default: ./output)',
                  default: './output',
                },
                fileKey: {
                  type: 'string',
                  description: 'Filter by Figma file key (optional)',
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'figma_export_image':
            return await this.handleExportImage(args);
          case 'figma_get_node_info':
            return await this.handleGetNodeInfo(args);
          case 'figma_list_exports':
            return await this.handleListExports(args);
          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: `Unknown tool: ${name}`,
                  }),
                },
              ],
              isError: true,
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleExportImage(args: unknown): Promise<CallToolResult> {
    const params = ExportImageSchema.parse(args);

    // Parse Figma URL
    const fileKey = parseFileKey(params.figmaUrl);
    const urlNodeId = parseNodeId(params.figmaUrl);

    // Determine node IDs to export
    let nodeIds: string[];
    if (params.nodeIds && params.nodeIds.length > 0) {
      nodeIds = params.nodeIds.map((id) => normalizeNodeId(id));
    } else if (urlNodeId) {
      nodeIds = [normalizeNodeId(urlNodeId)];
    } else {
      throw new Error(
        'Node IDs are required. Please provide nodeIds parameter or include node-id in the URL.',
      );
    }

    // Initialize API client and exporter
    const apiClient = new FigmaApiClient(this.figmaToken, this.cacheManager);
    const exporter = new ImageExporter(apiClient);

    // Export images
    const outputDir = params.outputDir;
    await exporter.exportImages(fileKey, nodeIds, outputDir, {
      scale: params.scale,
      format: params.format,
      withMetadata: params.withMetadata,
      useCache: params.useCache,
      verbose: false, // Don't show verbose output in MCP mode
    });

    // Collect exported files
    const exportedFiles: Array<{ image: string; metadata?: string; nodeId: string }> = [];
    for (const nodeId of nodeIds) {
      const nodesResponse = await apiClient.getNodes(fileKey, [nodeId], params.useCache);
      const nodeData = nodesResponse.nodes[nodeId];
      if (nodeData) {
        const nodeName = nodeData.document.name;
        const safeNodeId = nodeId.replace(/:/g, '-');
        const safeNodeName = this.sanitizeFileName(nodeName);
        const fileName = `${fileKey}_${safeNodeId}_${safeNodeName}.${params.format}`;
        const imagePath = join(outputDir, fileName);

        const fileInfo: { image: string; metadata?: string; nodeId: string } = {
          image: imagePath,
          nodeId,
        };

        if (params.withMetadata) {
          const metadataPath = join(outputDir, `${this.stripExtension(fileName)}.json`);
          fileInfo.metadata = metadataPath;
        }

        exportedFiles.push(fileInfo);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              fileKey,
              nodeIds,
              outputDir,
              exportedFiles,
              message: `Successfully exported ${nodeIds.length} image(s)`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private async handleGetNodeInfo(args: unknown): Promise<CallToolResult> {
    const params = GetNodeInfoSchema.parse(args);

    // Parse Figma URL
    const fileKey = parseFileKey(params.figmaUrl);
    const urlNodeId = parseNodeId(params.figmaUrl);

    // Determine node IDs
    let nodeIds: string[];
    if (params.nodeIds && params.nodeIds.length > 0) {
      nodeIds = params.nodeIds.map((id) => normalizeNodeId(id));
    } else if (urlNodeId) {
      nodeIds = [normalizeNodeId(urlNodeId)];
    } else {
      throw new Error(
        'Node IDs are required. Please provide nodeIds parameter or include node-id in the URL.',
      );
    }

    // Get node information
    const apiClient = new FigmaApiClient(this.figmaToken, this.cacheManager);
    const nodesResponse = await apiClient.getNodes(fileKey, nodeIds, params.useCache);

    // Build structured hierarchy for each node
    const nodes: Array<{
      nodeId: string;
      hierarchy: NodeInfo;
      rawData?: unknown;
    }> = [];

    for (const nodeId of nodeIds) {
      const nodeData = nodesResponse.nodes[nodeId];
      if (nodeData) {
        const rootNode = nodeData.document;
        const origin = rootNode.absoluteBoundingBox
          ? { x: rootNode.absoluteBoundingBox.x, y: rootNode.absoluteBoundingBox.y }
          : { x: 0, y: 0 };

        const hierarchy = buildNodeHierarchy(
          rootNode,
          origin,
          0,
          params.maxDepth,
          params.includeChildren,
        );

        nodes.push({
          nodeId,
          hierarchy,
        });
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              fileKey,
              fileName: nodesResponse.name,
              lastModified: nodesResponse.lastModified,
              nodes,
              message: `Retrieved information for ${nodes.length} node(s)`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private async handleListExports(args: unknown): Promise<CallToolResult> {
    const params = ListExportsSchema.parse(args);
    const outputDir = params.outputDir;

    if (!existsSync(outputDir)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              outputDir,
              exports: [],
              message: 'Output directory does not exist',
            }),
          },
        ],
      };
    }

    // List all exported files
    const files = readdirSync(outputDir);
    const exports: Array<{
      image: string;
      metadata?: string;
      fileKey?: string;
      nodeId?: string;
      nodeName?: string;
      exportedAt?: string;
      size?: number;
    }> = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        continue; // Skip metadata files in listing
      }

      const imagePath = join(outputDir, file);
      const stats = statSync(imagePath);

      // Parse filename to extract info
      const match = file.match(/^([^_]+)_(\d+-\d+)_(.+)\.(png|jpg|svg|pdf)$/);
      if (!match) {
        continue;
      }

      const [, fileKey, nodeIdDash, nodeName] = match;
      if (!nodeIdDash || !nodeName) {
        continue;
      }

      const nodeId = nodeIdDash.replace(/-/g, ':');

      // Apply filter if specified
      if (params.fileKey && fileKey !== params.fileKey) {
        continue;
      }

      const exportInfo: {
        image: string;
        metadata?: string;
        fileKey?: string;
        nodeId?: string;
        nodeName?: string;
        exportedAt?: string;
        size?: number;
      } = {
        image: imagePath,
        fileKey,
        nodeId,
        nodeName: nodeName.replace(/\.[^.]+$/, ''),
        size: stats.size,
      };

      // Check for metadata file
      const metadataPath = join(outputDir, `${this.stripExtension(file)}.json`);
      if (existsSync(metadataPath)) {
        exportInfo.metadata = metadataPath;
        try {
          const metadataContent = readFileSync(metadataPath, 'utf-8');
          const metadata = JSON.parse(metadataContent);
          exportInfo.exportedAt = metadata.exportedAt;
        } catch {
          // Ignore metadata parsing errors
        }
      }

      exports.push(exportInfo);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              outputDir,
              exports,
              count: exports.length,
              message: `Found ${exports.length} exported image(s)`,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase()
      .substring(0, 50);
  }

  private stripExtension(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '');
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Figma MCP Server running on stdio');
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new FigmaMCPServer();
  server.run().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
