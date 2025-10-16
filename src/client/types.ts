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

// Figma API Response Types

export interface GetNodesResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: Record<string, NodeData>;
  err?: string;
}

export interface NodeData {
  document: Node;
  components?: Record<string, Component>;
  componentSets?: Record<string, ComponentSet>;
  schemaVersion: number;
  styles?: Record<string, Style>;
}

export interface Node {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  absoluteBoundingBox?: AbsoluteBoundingBox;
  children?: Node[];
  [key: string]: unknown;
}

export interface AbsoluteBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Component {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
  documentationLinks?: unknown[];
}

export interface ComponentSet {
  key: string;
  name: string;
  description: string;
  documentationLinks?: unknown[];
}

export interface Style {
  key: string;
  name: string;
  description: string;
  styleType: string;
}

export interface GetImagesResponse {
  err: string | null;
  images: Record<string, string>; // node_id -> image_url
  status?: number;
}

// Export Options
export interface ExportOptions {
  scale: number;
  format: 'png' | 'jpg' | 'svg' | 'pdf';
  withMetadata: boolean;
  useCache: boolean;
}

// Cached Response Metadata
export interface CacheMetadata {
  fileKey: string;
  nodeIds: string[];
  timestamp: number;
  ttl: number;
}

export interface CachedNodeResponse {
  metadata: CacheMetadata;
  data: GetNodesResponse;
}

// Output Metadata
export interface OutputMetadata {
  fileKey: string;
  nodeId: string;
  nodeName: string;
  exportedAt: string;
  scale: number;
  format: string;
  nodeData?: NodeData;
}
