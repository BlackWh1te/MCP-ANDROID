// BlackWhite — MCP DevKit
import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
import os from "os";

interface MemoryItem {
  key: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  summary?: string;
  relatedKeys?: string[];
  accessCount: number;
  lastAccessedAt: string;
}

function getMemoryPath(): string {
  const dataDir = path.join(os.homedir(), ".mcp-devkit");
  return path.join(dataDir, "memory.json");
}

async function ensureDataDir() {
  const dataDir = path.join(os.homedir(), ".mcp-devkit");
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch {
    // ignore
  }
}

async function loadMemory(): Promise<Record<string, MemoryItem>> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(getMemoryPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveMemory(data: Record<string, MemoryItem>) {
  await ensureDataDir();
  await fs.writeFile(getMemoryPath(), JSON.stringify(data, null, 2), "utf-8");
}

export function remember(key: string, content: string, tags: string[] = []): string {
  const data = loadMemorySync();
  const now = new Date().toISOString();
  data[key] = {
    key,
    content,
    tags,
    createdAt: data[key]?.createdAt ?? now,
    updatedAt: now,
    summary: data[key]?.summary,
    relatedKeys: data[key]?.relatedKeys,
    accessCount: data[key]?.accessCount ?? 0,
    lastAccessedAt: data[key]?.lastAccessedAt ?? now,
  };
  saveMemorySync(data);
  return `Remembered "${key}" (${tags.length ? `tags: ${tags.join(", ")}` : "no tags"}).`;
}

export async function recall(query: string, limit = 10): Promise<string> {
  const data = await loadMemory();
  const results: Array<{ item: MemoryItem; score: number }> = [];
  const q = query.toLowerCase();

  for (const item of Object.values(data)) {
    let score = 0;
    if (item.key.toLowerCase().includes(q)) score += 10;
    if (item.content.toLowerCase().includes(q)) score += 5;
    for (const tag of item.tags) {
      if (tag.toLowerCase().includes(q)) score += 3;
    }
    // Boost score for frequently accessed memories
    score += Math.min(item.accessCount * 0.5, 5);
    if (score > 0) results.push({ item, score });
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, limit);

  if (top.length === 0) return `No memories found for "${query}".`;

  // Update access counts only for returned memories
  for (const { item } of top) {
    item.accessCount++;
    item.lastAccessedAt = new Date().toISOString();
  }

  // Save updated access counts
  await saveMemory(data);

  const lines: string[] = [`Found ${top.length} memory(s) for "${query}":`, ""];
  for (const { item } of top) {
    lines.push(`## ${item.key}`);
    lines.push(`Tags: ${item.tags.join(", ") || "none"}`);
    lines.push(`Updated: ${item.updatedAt} | Accessed ${item.accessCount} times`);
    if (item.summary) lines.push(`Summary: ${item.summary}`);
    if (item.relatedKeys && item.relatedKeys.length > 0) {
      lines.push(`Related: ${item.relatedKeys.join(", ")}`);
    }
    lines.push(item.content);
    lines.push("");
  }
  return lines.join("\n");
}

export async function listMemories(tag?: string): Promise<string> {
  const data = await loadMemory();
  const items = Object.values(data).filter((item) => {
    if (!tag) return true;
    return item.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
  });

  if (items.length === 0) {
    return tag ? `No memories with tag "${tag}".` : "No memories stored yet.";
  }

  const lines: string[] = [`Stored memories (${items.length}):`, ""];
  for (const item of items) {
    lines.push(`- ${item.key} [${item.tags.join(", ") || "no tags"}] — ${item.updatedAt}`);
  }
  return lines.join("\n");
}

// Synchronous fallbacks for the synchronous remember path used in index.ts
function loadMemorySync(): Record<string, MemoryItem> {
  try {
    const raw = fsSync.readFileSync(getMemoryPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveMemorySync(data: Record<string, MemoryItem>) {
  try {
    fsSync.writeFileSync(getMemoryPath(), JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

// Advanced memory functions

export async function deduplicateMemories(): Promise<string> {
  const data = await loadMemory();
  const items = Object.values(data);
  const duplicates: Array<{ key1: string; key2: string; similarity: number }> = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const item1 = items[i];
      const item2 = items[j];
      
      // Calculate similarity
      const keySimilarity = calculateSimilarity(item1.key.toLowerCase(), item2.key.toLowerCase());
      const contentSimilarity = calculateSimilarity(item1.content.toLowerCase(), item2.content.toLowerCase());
      const tagSimilarity = calculateSimilarity(item1.tags.join(" "), item2.tags.join(" "));
      
      const avgSimilarity = (keySimilarity + contentSimilarity + tagSimilarity) / 3;
      
      if (avgSimilarity > 0.7) {
        duplicates.push({ key1: item1.key, key2: item2.key, similarity: avgSimilarity });
      }
    }
  }

  return JSON.stringify({
    totalMemories: items.length,
    duplicateGroups: duplicates.length,
    duplicates: duplicates.slice(0, 20),
  }, null, 2);
}

function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  if (longer.length === 0) return 1;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

export async function summarizeMemory(key: string): Promise<string> {
  const data = await loadMemory();
  const item = data[key];
  
  if (!item) {
    return `Memory "${key}" not found.`;
  }

  if (item.summary) {
    return `Existing summary: ${item.summary}`;
  }

  // Generate simple summary (first sentence or first 100 chars)
  const firstSentence = item.content.match(/^[^.!?]*[.!?]/);
  const summary = firstSentence 
    ? firstSentence[0].trim()
    : item.content.slice(0, 100) + (item.content.length > 100 ? "..." : "");

  item.summary = summary;
  await saveMemory(data);

  return `Generated summary for "${key}": ${summary}`;
}

export async function findRelatedMemories(key: string, threshold = 0.3): Promise<string> {
  const data = await loadMemory();
  const item = data[key];
  
  if (!item) {
    return `Memory "${key}" not found.`;
  }

  const related: Array<{ key: string; similarity: number }> = [];
  
  for (const [otherKey, otherItem] of Object.entries(data)) {
    if (otherKey === key) continue;
    
    const tagSimilarity = calculateSimilarity(item.tags.join(" "), otherItem.tags.join(" "));
    const contentSimilarity = calculateSimilarity(item.content.toLowerCase(), otherItem.content.toLowerCase());
    
    const avgSimilarity = (tagSimilarity + contentSimilarity) / 2;
    
    if (avgSimilarity > threshold) {
      related.push({ key: otherKey, similarity: avgSimilarity });
    }
  }

  related.sort((a, b) => b.similarity - a.similarity);
  
  // Update related keys in memory
  item.relatedKeys = related.slice(0, 5).map(r => r.key);
  await saveMemory(data);

  return JSON.stringify({
    key,
    relatedMemories: related.slice(0, 10),
  }, null, 2);
}

export async function exportMemories(): Promise<string> {
  const data = await loadMemory();
  const backupPath = path.join(os.homedir(), ".mcp-devkit", `memory-backup-${Date.now()}.json`);
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(backupPath, JSON.stringify(data, null, 2), "utf-8");
  return `Exported ${Object.keys(data).length} memories to ${backupPath}`;
}

export async function importMemories(backupPath: string): Promise<string> {
  try {
    const content = await fs.readFile(backupPath, "utf-8");
    const imported = JSON.parse(content) as Record<string, MemoryItem>;
    const data = await loadMemory();
    
    let importedCount = 0;
    for (const [key, item] of Object.entries(imported)) {
      if (!data[key]) {
        data[key] = item;
        importedCount++;
      }
    }
    
    await saveMemory(data);
    return `Imported ${importedCount} new memories from ${backupPath}`;
  } catch (err: any) {
    return `Error importing memories: ${err.message}`;
  }
}

