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

import type { CacheManager } from './cache.js';
import type { ExportOptions, GetImagesResponse, GetNodesResponse } from './types.js';

export class FigmaApiClient {
  private token: string;
  private baseUrl = 'https://api.figma.com/v1';
  private cacheManager: CacheManager;

  constructor(token: string, cacheManager: CacheManager) {
    this.token = token;
    this.cacheManager = cacheManager;
  }

  /**
   * Get node information with caching support
   */
  async getNodes(fileKey: string, nodeIds: string[], useCache = true): Promise<GetNodesResponse> {
    // Try cache first
    if (useCache) {
      const cached = this.cacheManager.get(fileKey, nodeIds);
      if (cached) {
        console.log('Using cached node data');
        return cached;
      }
    }

    const url = `${this.baseUrl}/files/${fileKey}/nodes?ids=${nodeIds.join(',')}`;
    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch nodes: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as GetNodesResponse;

    if (data.err) {
      throw new Error(`Figma API error: ${data.err}`);
    }

    // Cache the response
    if (useCache) {
      this.cacheManager.set(fileKey, nodeIds, data);
    }

    return data;
  }

  /**
   * Get image rendering URLs
   */
  async getImageUrls(
    fileKey: string,
    nodeIds: string[],
    options: Partial<ExportOptions>,
  ): Promise<Record<string, string>> {
    const { scale = 2, format = 'png' } = options;
    const url = `${this.baseUrl}/images/${fileKey}?ids=${nodeIds.join(',')}&format=${format}&scale=${scale}`;

    const response = await this.fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch image URLs: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as GetImagesResponse;

    if (data.err) {
      throw new Error(`Figma API error: ${data.err}`);
    }

    return data.images;
  }

  /**
   * Download image from URL
   */
  async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Fetch with retry logic for rate limiting (429)
   */
  private async fetchWithRetry(url: string, maxRetries = 3, retryDelay = 1000): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'X-FIGMA-TOKEN': this.token,
          },
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : retryDelay;

          console.log(`Rate limited. Retrying after ${waitTime}ms...`);
          await this.sleep(waitTime);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries - 1) {
          await this.sleep(retryDelay);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
