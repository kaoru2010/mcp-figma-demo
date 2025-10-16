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

/**
 * Parse Figma file key from URL
 * @param url Figma URL (e.g., https://www.figma.com/file/ABC123/...)
 * @returns File key
 */
export function parseFileKey(url: string): string {
  const patterns = [
    /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/,
    /figma\.com\/proto\/([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error(`Invalid Figma URL: ${url}`);
}

/**
 * Parse node ID from URL if present
 * @param url Figma URL with optional node-id parameter
 * @returns Node ID or null
 */
export function parseNodeId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('node-id');
  } catch {
    return null;
  }
}

/**
 * Validate Figma URL format
 * @param url URL to validate
 * @returns true if valid
 */
export function isValidFigmaUrl(url: string): boolean {
  try {
    parseFileKey(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize node ID to Figma API format (colon-separated)
 * Converts "763-6581" to "763:6581"
 * @param nodeId Node ID in either format
 * @returns Normalized node ID with colon
 */
export function normalizeNodeId(nodeId: string): string {
  // Replace first hyphen with colon if it looks like a Figma node ID
  // Format: number-number or number:number
  return nodeId.replace(/^(\d+)-(\d+)/, '$1:$2');
}
