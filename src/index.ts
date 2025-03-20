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
      // Use the first non-whitespace character as the base character
      const base = chars.find((c) => c.trim()) || chars[0];

      // Map all characters in the line to the base character
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

    // Combine user-provided safe words with the built-in whitelist
    const allSafeWords = new Set([
      ...defaultWhitelist,
      ...(options?.safeWords || []),
    ]);
    this.safeWords = allSafeWords;
    this.whitelist = new Set(defaultWhitelist);

    this.cacheNormalizedSafeWords();
    this.cacheNormalizedBannedWords();
    this.cacheNormalizedWhitelist();
  }

  private cacheNormalizedSafeWords() {
    for (const word of this.safeWords) {
      this.normalizedSafeWords.add(this.normalize(word));
    }
  }

  private cacheNormalizedBannedWords() {
    for (const word of this.bannedWords) {
      const norm = this.normalize(word);
      if (norm.length < 3) continue; // Skip very short words
      if (!this.normalizedBannedWords.has(norm)) {
        this.normalizedBannedWords.set(norm, word);
      }
    }
  }

  private cacheNormalizedWhitelist() {
    for (const word of this.whitelist) {
      this.normalizedWhitelist.add(this.normalize(word));
    }
  }

  normalize(text: string): string {
    // First decompose and remove diacritical marks
    const decomposed = text.normalize("NFD").replace(/[\u0300-\u036F]/g, "");

    // Remove invisible characters
    const noInvisible = decomposed.replace(/[\u200B-\u200D\uFEFF]/g, "");

    // Remove common obfuscation characters
    const noObfuscation = noInvisible.replace(/[-_.*+!@#$%^&()]/g, "");

    // Convert to lowercase if not case sensitive
    const lowered = this.caseSensitive
      ? noObfuscation
      : noObfuscation.toLowerCase();

    // Map each character through the homoglyph mapping
    return Array.from(lowered)
      .map((char) => this.homoglyphMapping[char] || char)
      .join("");
  }

  private isSafeWord(word: string): boolean {
    const normalized = this.normalize(word);
    return (
      this.normalizedSafeWords.has(normalized) ||
      this.normalizedWhitelist.has(normalized)
    );
  }

  private isPartOfWhitelisted(word: string): boolean {
    const normalized = this.normalize(word);
    for (const whitelisted of this.normalizedWhitelist) {
      if (whitelisted.includes(normalized)) {
        return true;
      }
    }
    return false;
  }

  private fuzzyMatch(token: string, banned: string): boolean {
    return editDistance(token, banned) <= 1 || missingOneLetter(token, banned);
  }

  private isStandalone(word: string, bannedWord: string): boolean {
    return word === bannedWord;
  }

  detect(text: string): DetectionResult {
    const normalizedText = this.normalize(text);
    const matches = new Set<string>();
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let totalChecked = 0;
    let whitelistedSkips = 0;

    // Split into words and check each
    const words = normalizedText.split(/\s+/);
    for (const word of words) {
      // Skip if word is whitelisted or part of a whitelisted word
      if (this.isSafeWord(word) || this.isPartOfWhitelisted(word)) {
        whitelistedSkips++;
        continue;
      }

      // Check against banned words
      for (const [normalizedBanned, originalBanned] of this
        .normalizedBannedWords) {
        totalChecked++;

        // Exact match check
        if (this.isStandalone(word, normalizedBanned)) {
          matches.add(originalBanned);
          exactMatches++;
          continue;
        }

        // Fuzzy match check
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
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + 1, // substitution
        );
      }
    }
  }

  return dp[m][n];
}

// Helper function: check for missing letter
function missingOneLetter(token: string, banned: string): boolean {
  if (banned.length - token.length !== 1) return false;

  let i = 0,
    j = 0;
  let skipped = false;

  while (i < token.length && j < banned.length) {
    if (token[i] === banned[j]) {
      i++;
      j++;
    } else {
      if (skipped) {
        return false;
      }
      skipped = true;
      j++; // skip one letter in the banned word
    }
  }

  return true;
}
