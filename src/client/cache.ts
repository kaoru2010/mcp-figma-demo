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

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CachedNodeResponse, GetNodesResponse } from './types.js';

export class CacheManager {
  private cacheDir: string;
  private ttl: number; // Time to live in milliseconds

  constructor(cacheDir = '.cache', ttl = 86400000) {
    // Default TTL: 24 hours
    this.cacheDir = cacheDir;
    this.ttl = ttl;
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  generateKey(fileKey: string, nodeIds: string[]): string {
    const sortedIds = [...nodeIds].sort();
    const content = `${fileKey}:${sortedIds.join(',')}`;
    return createHash('sha256').update(content).digest('hex');
  }

  get(fileKey: string, nodeIds: string[]): GetNodesResponse | null {
    const key = this.generateKey(fileKey, nodeIds);
    const cachePath = join(this.cacheDir, `${key}.json`);

    if (!existsSync(cachePath)) {
      return null;
    }

    try {
      const content = readFileSync(cachePath, 'utf-8');
      const cached: CachedNodeResponse = JSON.parse(content);

      // Check if cache is expired
      const now = Date.now();
      if (now - cached.metadata.timestamp > cached.metadata.ttl) {
        return null;
      }

      return cached.data;
    } catch (error) {
      console.error(`Failed to read cache: ${error}`);
      return null;
    }
  }

  set(fileKey: string, nodeIds: string[], data: GetNodesResponse): void {
    const key = this.generateKey(fileKey, nodeIds);
    const cachePath = join(this.cacheDir, `${key}.json`);

    const cached: CachedNodeResponse = {
      metadata: {
        fileKey,
        nodeIds,
        timestamp: Date.now(),
        ttl: this.ttl,
      },
      data,
    };

    try {
      writeFileSync(cachePath, JSON.stringify(cached, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to write cache: ${error}`);
    }
  }

  clear(): void {
    // TODO: Implement cache clearing logic if needed
    console.log('Cache clearing not yet implemented');
  }
}
