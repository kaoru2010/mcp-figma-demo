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

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FigmaApiClient } from '../client/figma-api.js';
import type { ExportOptions, Node, OutputMetadata } from '../client/types.js';

export class ImageExporter {
  private client: FigmaApiClient;

  constructor(client: FigmaApiClient) {
    this.client = client;
  }

  /**
   * Export images from Figma
   */
  async exportImages(
    fileKey: string,
    nodeIds: string[],
    outputDir: string,
    options: Partial<ExportOptions> & { verbose?: boolean },
  ): Promise<void> {
    const {
      scale = 2,
      format = 'png',
      withMetadata = false,
      useCache = true,
      verbose = false,
    } = options;

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Exporting ${nodeIds.length} node(s) from Figma...`);

    // Get node information (with caching)
    const nodesResponse = await this.client.getNodes(fileKey, nodeIds, useCache);

    // Print node hierarchy in verbose mode
    if (verbose) {
      console.log('\nNode Hierarchy:');
      for (const nodeId of nodeIds) {
        const nodeData = nodesResponse.nodes[nodeId];
        if (nodeData) {
          const rootNode = nodeData.document;
          // Use the root node's position as the origin (0, 0)
          const origin = rootNode.absoluteBoundingBox
            ? { x: rootNode.absoluteBoundingBox.x, y: rootNode.absoluteBoundingBox.y }
            : { x: 0, y: 0 };

          console.log(`Root Node: ${rootNode.name || '[unnamed]'} (id: ${rootNode.id})`);
          this.printNodeTree(rootNode, 0, origin);
        }
      }
      console.log('');
    }

    // Get image URLs
    const imageUrls = await this.client.getImageUrls(fileKey, nodeIds, {
      scale,
      format,
      useCache,
      withMetadata,
    });

    // Download and save each image
    for (const nodeId of nodeIds) {
      const imageUrl = imageUrls[nodeId];
      if (!imageUrl) {
        console.warn(`No image URL for node ${nodeId}`);
        continue;
      }

      const nodeData = nodesResponse.nodes[nodeId];
      if (!nodeData) {
        console.warn(`No node data for ${nodeId}`);
        continue;
      }

      const nodeName = nodeData.document.name;
      const fileName = this.generateFileName(fileKey, nodeId, nodeName, format);

      console.log(`Downloading: ${fileName}`);

      // Download image
      const imageBuffer = await this.client.downloadImage(imageUrl);

      // Save image
      const imagePath = join(outputDir, fileName);
      writeFileSync(imagePath, imageBuffer);
      console.log(`Saved: ${imagePath}`);

      // Save metadata if requested
      if (withMetadata) {
        const metadata: OutputMetadata = {
          fileKey,
          nodeId,
          nodeName,
          exportedAt: new Date().toISOString(),
          scale,
          format,
          nodeData,
        };

        const metadataPath = join(outputDir, `${this.stripExtension(fileName)}.json`);
        writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
        console.log(`Saved metadata: ${metadataPath}`);
      }
    }

    console.log(`\nExported ${nodeIds.length} image(s) to ${outputDir}`);
  }

  /**
   * Generate safe filename from file key, node ID, and node name
   * Format: {fileKey}_{nodeId}_{nodeName}.{ext}
   */
  private generateFileName(
    fileKey: string,
    nodeId: string,
    nodeName: string,
    format: string,
  ): string {
    const safeNodeName = this.sanitizeFileName(nodeName);
    const safeNodeId = nodeId.replace(/:/g, '-');
    return `${fileKey}_${safeNodeId}_${safeNodeName}.${format}`;
  }

  /**
   * Sanitize file name by removing invalid characters
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace whitespace with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .toLowerCase()
      .substring(0, 50); // Limit length
  }

  /**
   * Strip file extension
   */
  private stripExtension(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '');
  }

  /**
   * Print node tree recursively with relative coordinates
   * @param node Current node
   * @param depth Current depth in tree
   * @param origin Origin point for relative coordinates (from root node)
   */
  private printNodeTree(node: Node, depth: number, origin: { x: number; y: number }): void {
    const indent = '  '.repeat(depth);
    const prefix = depth === 0 ? '└─' : '├─';

    // Filter out detailed shape types (too granular for hierarchy view)
    const excludedTypes = [
      'VECTOR',
      'RECTANGLE',
      'ELLIPSE',
      'LINE',
      'STAR',
      'BOOLEAN_OPERATION',
      'REGULAR_POLYGON',
    ];

    // Determine if this node should be printed
    const shouldPrint =
      !excludedTypes.includes(node.type) &&
      (node.name || // Has name
        (node.type === 'FRAME' && depth < 3)); // Or FRAME within 3 levels

    if (shouldPrint) {
      // Format node info
      const nodeName = node.name || '[unnamed]';
      const nodeInfo = `${indent}${prefix} ${nodeName} [${node.type}]`;
      const idInfo = ` (id: ${node.id})`;

      // Add bounding box info if available (relative to root node)
      let boundsInfo = '';
      if (node.absoluteBoundingBox) {
        const bbox = node.absoluteBoundingBox;
        // Calculate relative coordinates from origin
        const x = Math.round(bbox.x - origin.x);
        const y = Math.round(bbox.y - origin.y);
        const w = Math.round(bbox.width);
        const h = Math.round(bbox.height);
        // Format: x=100,y=200,width=300,height=400 (AI-friendly key-value format)
        boundsInfo = ` {x=${x},y=${y},width=${w},height=${h}}`;
      }

      console.log(nodeInfo + idInfo + boundsInfo);
    }

    // Recursively print children (always traverse, even if parent was excluded)
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        // Increment depth only if current node was printed
        const nextDepth = shouldPrint ? depth + 1 : depth;
        this.printNodeTree(child, nextDepth, origin);
      }
    }
  }
}
