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

const charsTxtPath = path.join(__dirname, "../raw_data/chars.txt");
const wordsJsonPath = path.join(__dirname, "../raw_data/words.json");

const defaultHomoglyphMapping = loadHomoglyphMapping(charsTxtPath);
const defaultBannedWords = loadBannedWords(wordsJsonPath);

export class ProfaneDetect {
  private bannedWords: string[];
  private homoglyphMapping: Record<string, string>;
  private normalizedBannedWords: Map<string, string> = new Map();
  private normalizedSafeWords: Set<string> = new Set();
  private caseSensitive: boolean;
  private safeWords: Set<string>;

  constructor(options?: ProfaneDetectOptions) {
    this.bannedWords = options?.bannedWords || defaultBannedWords;
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = options?.caseSensitive || false;
    this.safeWords = new Set(options?.safeWords || []);

    this.cacheNormalizedSafeWords();
    this.cacheNormalizedBannedWords();
  }

  // Cache normalized safe words for quick lookup.
  private cacheNormalizedSafeWords() {
    for (const word of this.safeWords) {
      this.normalizedSafeWords.add(this.normalize(word));
    }
  }

  // Cache a mapping of normalized banned words to their original form.
  private cacheNormalizedBannedWords() {
    for (const word of this.bannedWords) {
      const norm = this.normalize(word);
      if (norm.length < 3) continue;
      if (!this.normalizedBannedWords.has(norm)) {
        this.normalizedBannedWords.set(norm, word);
      }
    }
  }

  // Normalize text by:
  // • Applying Unicode NFD normalization & stripping diacritical marks,
  // • Removing invisible characters,
  // • Removing asterisks (commonly used to mask letters) and decorative punctuation,
  // • Lowercasing, and then
  // • Mapping via the homoglyph mapping.
  normalize(text: string): string {
    // First decompose and remove diacritical marks
    const decomposed = text.normalize("NFD").replace(/[\u0300-\u036F]/g, "");

    // Remove invisible characters
    const noInvisible = decomposed.replace(/[\u200B-\u200D\uFEFF]/g, "");

    // Convert to lowercase if not case sensitive
    const lowered = this.caseSensitive
      ? noInvisible
      : noInvisible.toLowerCase();

    // Map each character through the homoglyph mapping
    return Array.from(lowered)
      .map((char) => this.homoglyphMapping[char] || char)
      .join("");
  }

  // Check if a token is one of the safe words.
  private isSafeToken(token: string): boolean {
    return this.normalizedSafeWords.has(token);
  }

  // Returns true if the edit distance between token and banned word is less than or equal to 1.
  // This covers substitutions, insertions, and deletions.
  private fuzzyMatch(token: string, banned: string): boolean {
    return editDistance(token, banned) <= 1 || missingOneLetter(token, banned);
  }

  // Check whether a normalized banned word appears as an isolated token using RegExp.
  private isStandalone(
    normalizedText: string,
    normalizedWord: string,
  ): boolean {
    const pattern = new RegExp(`\\b${normalizedWord}\\b`);
    if (!pattern.test(normalizedText)) {
      return false;
    }
    for (const safe of this.normalizedSafeWords) {
      if (new RegExp(`\\b${safe}\\b`).test(normalizedText)) {
        return false;
      }
    }
    return true;
  }

  detect(text: string): DetectionResult {
    const normalizedText = this.normalize(text);
    const matches = new Set<string>();
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let totalChecked = 0;

    // First pass: exact matches
    for (const [
      normalizedBanned,
      originalWord,
    ] of this.normalizedBannedWords.entries()) {
      totalChecked++;
      if (this.isStandalone(normalizedText, normalizedBanned)) {
        matches.add(originalWord);
        exactMatches++;
      }
    }

    // Second pass: fuzzy matches
    const tokens = normalizedText.split(/\s+/);
    for (const token of tokens) {
      if (this.isSafeToken(token)) continue;

      for (const [
        normalizedBanned,
        originalWord,
      ] of this.normalizedBannedWords.entries()) {
        totalChecked++;
        const lengthDiff = Math.abs(token.length - normalizedBanned.length);
        if (lengthDiff > 1) continue;
        if (token === normalizedBanned) continue;

        if (this.fuzzyMatch(token, normalizedBanned)) {
          matches.add(originalWord);
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
      },
    };
  }

  debugMapping(char: string): string {
    return (
      this.homoglyphMapping[this.caseSensitive ? char : char.toLowerCase()] ||
      char
    );
  }
}

// Helper: calculate the Levenshtein edit distance between two strings.
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

// Helper: returns true if token equals banned word with exactly one letter missing.
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
  // Allow for the case where the missing letter is at the end.
  return true;
}
