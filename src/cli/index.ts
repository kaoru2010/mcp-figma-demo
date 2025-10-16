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

import { Command } from 'commander';
import { CacheManager } from '../client/cache.js';
import { FigmaApiClient } from '../client/figma-api.js';
import { ImageExporter } from '../core/image-exporter.js';
import { normalizeNodeId, parseFileKey, parseNodeId } from '../core/url-parser.js';

const program = new Command();

program
  .name('mcp-figma-demo')
  .description('Export PNG images from Figma with caching support')
  .version('0.1.0')
  .argument('<figma-url>', 'Figma file URL')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option(
    '-t, --token <token>',
    'Figma Personal Access Token (or use FIGMA_PERSONAL_TOKEN env var)',
  )
  .option('-n, --nodes <ids>', 'Comma-separated list of node IDs')
  .option('-s, --scale <number>', 'Scale factor (1-4)', '2')
  .option('--format <format>', 'Image format (png, jpg, svg, pdf)', 'png')
  .option('--no-cache', 'Do not use cache')
  .option('--with-metadata', 'Save metadata JSON alongside images')
  .option('--verbose', 'Show verbose output')
  .action(async (figmaUrl: string, options) => {
    try {
      // Get token from options or environment variable
      const token = options.token || process.env.FIGMA_PERSONAL_TOKEN;

      if (!token) {
        console.error('Error: Figma token is required.');
        console.error(
          'Please provide --token option or set FIGMA_PERSONAL_TOKEN environment variable.',
        );
        process.exit(1);
      }

      // Parse Figma URL
      let fileKey: string;
      try {
        fileKey = parseFileKey(figmaUrl);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }

      // Parse root node ID from URL
      const rootNodeId = parseNodeId(figmaUrl);
      const normalizedRootNodeId = rootNodeId ? normalizeNodeId(rootNodeId) : null;

      // Parse node IDs and normalize them
      let nodeIds: string[];
      if (options.nodes) {
        nodeIds = options.nodes.split(',').map((id: string) => normalizeNodeId(id.trim()));
      } else {
        // Use root node ID from URL if no --nodes option
        if (normalizedRootNodeId) {
          nodeIds = [normalizedRootNodeId];
        } else {
          console.error('Error: Node IDs are required.');
          console.error('Please provide --nodes option or include node-id parameter in the URL.');
          process.exit(1);
        }
      }

      if (nodeIds.length === 0) {
        console.error('Error: At least one node ID is required.');
        process.exit(1);
      }

      // Parse scale
      const scale = Number.parseFloat(options.scale);
      if (Number.isNaN(scale) || scale < 1 || scale > 4) {
        console.error('Error: Scale must be a number between 1 and 4.');
        process.exit(1);
      }

      if (options.verbose) {
        console.log('Configuration:');
        console.log(`  File Key: ${fileKey}`);
        if (normalizedRootNodeId) {
          console.log(`  Root Node: ${normalizedRootNodeId}`);
        }
        console.log(`  Node IDs: ${nodeIds.join(', ')}`);
        console.log(`  Scale: ${scale}`);
        console.log(`  Format: ${options.format}`);
        console.log(`  Output: ${options.output}`);
        console.log(`  Cache: ${options.cache ? 'enabled' : 'disabled'}`);
        console.log(`  Metadata: ${options.withMetadata ? 'yes' : 'no'}`);
        console.log('');
      }

      // Initialize components
      const cacheManager = new CacheManager();
      const apiClient = new FigmaApiClient(token, cacheManager);
      const imageExporter = new ImageExporter(apiClient);

      // Export images
      await imageExporter.exportImages(fileKey, nodeIds, options.output, {
        scale,
        format: options.format,
        useCache: options.cache,
        withMetadata: options.withMetadata,
        verbose: options.verbose,
      });

      console.log('\n✓ Export completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('\n✗ Export failed:');
      console.error(error instanceof Error ? error.message : String(error));

      if (options.verbose && error instanceof Error && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }

      process.exit(1);
    }
  });

program.parse();
