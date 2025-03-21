import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ProfaneDetectOptions, DetectionResult, DetectionEntry } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadHomoglyphMapping(filePath: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const chars = Array.from(line);
    if (chars.length > 0) {
      const base = chars.find((c) => c.trim()) || chars[0];
      for (const char of chars) {
        if (char.trim()) {
          mapping[char] = base;
        }
      }
    }
  }

  return mapping;
}

function loadBannedWords(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

function loadWhitelist(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

const charsTxtPath = path.join(__dirname, "../raw_data/chars.txt");
const wordsJsonPath = path.join(__dirname, "../raw_data/words.json");
const whitelistJsonPath = path.join(__dirname, "../raw_data/whitelist.json");

const defaultHomoglyphMapping = loadHomoglyphMapping(charsTxtPath);
const defaultBannedWords = loadBannedWords(wordsJsonPath);
const defaultWhitelist = loadWhitelist(whitelistJsonPath);

export class ProfaneDetect {
  private bannedWords: string[];
  private homoglyphMapping: Record<string, string>;
  private normalizedBannedWords: Map<string, string> = new Map();
  private normalizedSafeWords: Set<string> = new Set();
  private normalizedWhitelist: Set<string> = new Set();
  private caseSensitive: boolean;
  private safeWords: Set<string>;
  private whitelist: Set<string>;

  constructor(options?: ProfaneDetectOptions) {
    this.bannedWords = options?.bannedWords || defaultBannedWords;
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = options?.caseSensitive || false;

    // Initialize whitelist
    this.whitelist = new Set(defaultWhitelist);

    // Initialize safe words with both default whitelist and user-provided safe words
    this.safeWords = new Set([
      ...defaultWhitelist,
      ...(options?.safeWords || []),
    ]);

    this.cacheNormalizedWords();
  }

  private cacheNormalizedWords() {
    // Cache normalized safe words
    for (const word of this.safeWords) {
      this.normalizedSafeWords.add(this.normalize(word));
    }

    // Cache normalized whitelist words
    for (const word of this.whitelist) {
      this.normalizedWhitelist.add(this.normalize(word));
    }

    // Cache normalized banned words
    for (const word of this.bannedWords) {
      const norm = this.normalize(word);
      if (norm.length < 3) continue; // Skip very short words
      if (!this.normalizedBannedWords.has(norm)) {
        this.normalizedBannedWords.set(norm, word);
      }
    }
  }

  normalize(text: string): string {
    const decomposed = text.normalize("NFD").replace(/[\u0300-\u036F]/g, "");
    const noInvisible = decomposed.replace(/[\u200B-\u200D\uFEFF]/g, "");
    const noObfuscation = noInvisible.replace(/[-_.*+!@#$%^&()]/g, "");
    const lowered = this.caseSensitive
      ? noObfuscation
      : noObfuscation.toLowerCase();

    return Array.from(lowered)
      .map((char) => this.homoglyphMapping[char] || char)
      .join("");
  }

  private isWhitelisted(text: string): boolean {
    const normalizedText = this.normalize(text);

    // Check if the exact text is whitelisted
    if (this.normalizedWhitelist.has(normalizedText)) {
      return true;
    }

    // Check if the text is part of any whitelisted word
    for (const whitelisted of this.normalizedWhitelist) {
      if (normalizedText === whitelisted) {
        return true;
      }
    }

    return false;
  }

  detect(text: string): DetectionResult {
    // First check if the entire text is whitelisted
    if (this.isWhitelisted(text)) {
      return {
        found: false,
        matches: [],
        normalized: this.normalize(text),
        metrics: {
          exactMatches: 0,
          fuzzyMatches: 0,
          totalChecked: 0,
          whitelistedSkips: 1,
        },
      };
    }

    const normalizedText = this.normalize(text);
    const matches = new Set<string>();
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let totalChecked = 0;
    let whitelistedSkips = 0;

    // Split into words and check each
    const words = normalizedText.split(/\s+/);

    for (const word of words) {
      // Skip if word is in safe words
      if (this.normalizedSafeWords.has(this.normalize(word))) {
        whitelistedSkips++;
        continue;
      }

      // Check against banned words
      for (const [normalizedBanned, originalBanned] of this
        .normalizedBannedWords) {
        totalChecked++;

        if (word === normalizedBanned) {
          matches.add(originalBanned);
          exactMatches++;
          continue;
        }

        // Fuzzy match check only if not an exact match
        if (this.fuzzyMatch(word, normalizedBanned)) {
          matches.add(originalBanned);
          fuzzyMatches++;
        }
      }
    }

    return {
      found: matches.size > 0,
      matches: Array.from(matches),
      normalized: normalizedText,
      metrics: {
        exactMatches,
        fuzzyMatches,
        totalChecked,
        whitelistedSkips,
      },
    };
  }

  private fuzzyMatch(token: string, banned: string): boolean {
    return editDistance(token, banned) <= 1;
  }

  toJson(text: string): DetectionEntry {
    const now = new Date();
    const result = this.detect(text);

    return {
      input: text,
      result: result,
      timestamp: {
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      config: {
        caseSensitive: this.caseSensitive,
        totalSafeWords: this.safeWords.size,
        totalBannedWords: this.bannedWords.length,
        totalWhitelisted: this.whitelist.size,
      },
    };
  }

  getWhitelist(): string[] {
    return Array.from(this.whitelist);
  }

  debugMapping(char: string): string {
    return (
      this.homoglyphMapping[this.caseSensitive ? char : char.toLowerCase()] ||
      char
    );
  }
}

// Helper function: calculate Levenshtein edit distance
function editDistance(a: string, b: string): number {
  const dp: number[][] = [];
  const m = a.length;
  const n = b.length;

  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1,
        );
      }
    }
  }

  return dp[m][n];
}
