import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ProfaneDetectOptions, DetectionResult, DetectionEntry } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAR_MAPPING_PATH = path.join(__dirname, "../raw_data/chars.txt");
const WORDS_PATH = path.join(__dirname, "../raw_data/words.json");
const WHITELIST_PATH = path.join(__dirname, "../raw_data/whitelist.json");

function loadHomoglyphMapping(): Record<string, string> {
  const content = fs.readFileSync(CHAR_MAPPING_PATH, "utf-8");
  const mapping: Record<string, string> = {};

  content.split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const chars = Array.from(line);
    if (chars.length > 0) {
      const base = chars.find((c) => c.trim()) || chars[0];
      chars.forEach((char) => {
        if (char.trim()) mapping[char] = base;
      });
    }
  });

  return mapping;
}

function loadWordList(path: string): string[] {
  const content = fs.readFileSync(path, "utf-8");
  return JSON.parse(content);
}

const defaultHomoglyphMapping = loadHomoglyphMapping();
const defaultBannedWords = loadWordList(WORDS_PATH);
const defaultWhitelist = loadWordList(WHITELIST_PATH);

export class ProfaneDetect {
  private readonly bannedWords: string[];
  private readonly homoglyphMapping: Record<string, string>;
  private readonly normalizedBannedWords: Map<string, string>;
  private readonly normalizedWhitelist: Set<string>;
  private readonly caseSensitive: boolean;
  private readonly whitelist: Set<string>;

  constructor(options?: ProfaneDetectOptions) {
    this.bannedWords = options?.bannedWords || defaultBannedWords;
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = options?.caseSensitive || false;

    // Initialize whitelist with both default and custom safe words
    this.whitelist = new Set([
      ...defaultWhitelist,
      ...(options?.safeWords || []),
    ]);

    // Initialize normalized caches
    this.normalizedBannedWords = new Map();
    this.normalizedWhitelist = new Set();
    this.initializeNormalizedCaches();
  }

  private initializeNormalizedCaches(): void {
    // Cache normalized whitelisted words
    for (const word of this.whitelist) {
      this.normalizedWhitelist.add(this.normalize(word));
    }

    // Cache normalized banned words
    for (const word of this.bannedWords) {
      const normalized = this.normalize(word);
      if (normalized.length >= 3) {
        this.normalizedBannedWords.set(normalized, word);
      }
    }
  }

  normalize(text: string): string {
    // Remove diacritical marks
    let normalized = text.normalize("NFD").replace(/[\u0300-\u036F]/g, "");

    // Remove invisible characters
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, "");

    // Remove common obfuscation characters
    normalized = normalized.replace(/[-_.*+!@#$%^&()]/g, "");

    // Convert to lowercase if not case sensitive
    if (!this.caseSensitive) {
      normalized = normalized.toLowerCase();
    }

    // Map homoglyphs
    return Array.from(normalized)
      .map((char) => this.homoglyphMapping[char] || char)
      .join("");
  }

  detect(text: string): DetectionResult {
    // Normalize input text
    const normalizedText = this.normalize(text);

    // Check if exact input is whitelisted
    if (this.normalizedWhitelist.has(normalizedText)) {
      return {
        found: false,
        matches: [],
        normalized: normalizedText,
        metrics: {
          exactMatches: 0,
          fuzzyMatches: 0,
          totalChecked: 1,
          whitelistedSkips: 1,
        },
      };
    }

    // Split into words and check each
    const words = normalizedText.split(/\s+/);
    const matches = new Set<string>();
    let whitelistedSkips = 0;
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let totalChecked = 0;

    for (const word of words) {
      const normalizedWord = this.normalize(word);

      // Skip whitelisted words
      if (this.normalizedWhitelist.has(normalizedWord)) {
        whitelistedSkips++;
        continue;
      }

      // Check against banned words
      for (const [bannedNormalized, originalBanned] of this
        .normalizedBannedWords) {
        totalChecked++;

        // Exact match check
        if (normalizedWord === bannedNormalized) {
          matches.add(originalBanned);
          exactMatches++;
        }
        // Fuzzy match check (only if not already matched)
        else if (
          !matches.has(originalBanned) &&
          this.fuzzyMatch(normalizedWord, bannedNormalized)
        ) {
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

  toJson(text: string): DetectionEntry {
    const result = this.detect(text);
    const now = new Date();

    return {
      input: text,
      result,
      timestamp: {
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      config: {
        caseSensitive: this.caseSensitive,
        totalSafeWords: this.whitelist.size,
        totalBannedWords: this.bannedWords.length,
        totalWhitelisted: this.normalizedWhitelist.size,
      },
    };
  }

  getWhitelist(): string[] {
    return Array.from(this.whitelist);
  }

  debugMapping(char: string): string {
    const normalizedChar = this.caseSensitive ? char : char.toLowerCase();
    return this.homoglyphMapping[normalizedChar] || char;
  }

  private fuzzyMatch(text: string, banned: string): boolean {
    // Only do fuzzy matching for strings of similar length
    if (Math.abs(text.length - banned.length) > 1) {
      return false;
    }
    return calculateEditDistance(text, banned) <= 1;
  }
}

// Helper function for calculating edit distance
function calculateEditDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill dp table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + 1, // substitution
        );
      }
    }
  }

  return dp[m][n];
}
