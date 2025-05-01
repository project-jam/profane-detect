import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ProfaneDetectOptions,
  DetectionResult,
  DetectionEntry,
  FastLookup,
  WordStatus,
} from "./types";

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
      chars.forEach((char) => {
        if (char.trim()) mapping[char] = base;
      });
    }
  }

  return mapping;
}

function loadWordList(path: string): string[] {
  const content = fs.readFileSync(path, "utf-8");
  return JSON.parse(content);
}

const CHAR_MAPPING_PATH = path.join(__dirname, "../raw_data/chars.txt");
const WORDS_PATH = path.join(__dirname, "../raw_data/languages/en.json");
const WHITELIST_PATH = path.join(__dirname, "../raw_data/whitelist.json");

const defaultHomoglyphMapping = loadHomoglyphMapping(CHAR_MAPPING_PATH);
const defaultBannedWords = loadWordList(WORDS_PATH);
const defaultWhitelist = loadWordList(WHITELIST_PATH);

export class ProfaneDetect {
  private readonly bannedWords: string[];
  private readonly homoglyphMapping: Record<string, string>;
  private readonly caseSensitive: boolean;
  private readonly useFastLookup: boolean;
  private readonly fastLookup: FastLookup = {};
  private readonly userWhitelist: Set<string> = new Set();
  private readonly normalizedBannedWords: Map<string, string> = new Map();
  private readonly normalizedWhitelist: Set<string> = new Set();
  private lookupHits: number = 0;

  constructor(options?: ProfaneDetectOptions) {
    this.bannedWords = options?.bannedWords || defaultBannedWords;
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = options?.caseSensitive || false;
    this.useFastLookup = options?.useFastLookup !== false; // Enabled by default

    // Initialize caches
    this.initializeCaches(options?.safeWords);
  }

  private initializeCaches(safeWords?: string[]): void {
    // Initialize fast lookup if enabled
    if (this.useFastLookup) {
      // Add default whitelist to fast lookup
      for (const word of defaultWhitelist) {
        const normalized = this.normalize(word);
        this.fastLookup[normalized] = {
          status: "safe",
          reason: "default whitelist",
          originalWord: word,
        };
      }

      // Add banned words to fast lookup
      for (const word of this.bannedWords) {
        const normalized = this.normalize(word);
        this.fastLookup[normalized] = {
          status: "banned",
          reason: "banned word",
          originalWord: word,
        };
      }
    }

    // Add user's custom safe words
    if (safeWords) {
      for (const word of safeWords) {
        const normalized = this.normalize(word);
        this.userWhitelist.add(normalized);
        if (this.useFastLookup) {
          this.fastLookup[normalized] = {
            status: "pass",
            reason: "user whitelist",
            originalWord: word,
          };
        }
      }
    }

    // Initialize normalized caches for non-fast-lookup mode
    if (!this.useFastLookup) {
      for (const word of this.bannedWords) {
        const normalized = this.normalize(word);
        this.normalizedBannedWords.set(normalized, word);
      }
      for (const word of defaultWhitelist) {
        this.normalizedWhitelist.add(this.normalize(word));
      }
    }
  }

  normalize(text: string): string {
    let normalized = text
      .normalize("NFD")
      .replace(/[\u0300-\u036F]/g, "") // Remove diacritics
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove invisible characters
      .replace(/\s+/g, "~") // Replace spaces with a delimiter
      .replace(/[-_.*+!@#$%^&()]/g, "~"); // Replace common obfuscation symbols with a delimiter

    if (!this.caseSensitive) {
      normalized = normalized.toLowerCase();
    }

    return Array.from(normalized)
      .map((char) => this.homoglyphMapping[char] || char)
      .join("");
  }

  detect(text: string): DetectionResult {
    const normalizedText = this.normalize(text);
    const matches = new Set<string>();
    let whitelistedSkips = 0;
    let lookupHits = 0;

    // Iterate through normalized text and check for banned words
    for (const [bannedNormalized, originalBanned] of this
      .normalizedBannedWords) {
      // Create a regex to match the banned word, allowing for delimiters
      const regex = new RegExp(bannedNormalized.split('').join('~*'), 'g');
      if (regex.test(normalizedText)) {
        matches.add(originalBanned);
      }
    }

    // Note: The fast lookup path and whitelisting logic will need to be revisited
    // to fully support this stricter matching, but this is a start.

    return {
      found: matches.size > 0,
      matches: Array.from(matches),
      normalized: normalizedText,
      metrics: {
        exactMatches: matches.size,
        fuzzyMatches: 0, // This approach doesn't distinguish fuzzy vs exact yet
        totalChecked: normalizedText.length, // Checking the whole text
        whitelistedSkips: 0, // Whitelisting not fully implemented with this approach yet
        lookupHits: this.useFastLookup ? lookupHits : undefined, // Fast lookup not fully implemented yet
      },
    };
  }

  checkWord(word: string): WordStatus {
    if (!this.useFastLookup) {
      throw new Error(
        "Fast lookup is disabled. Enable it in constructor options.",
      );
    }

    const normalized = this.normalize(word);

    // Check user whitelist
    if (this.userWhitelist.has(normalized)) {
      return { status: "pass", reason: "user whitelist" };
    }

    // Check fast lookup cache
    return (
      this.fastLookup[normalized] || {
        status: "safe",
        reason: "not found in cache",
      }
    );
  }

  addToWhitelist(word: string): void {
    const normalized = this.normalize(word);
    this.userWhitelist.add(normalized);

    if (this.useFastLookup) {
      this.fastLookup[normalized] = {
        status: "pass",
        reason: "user added",
        originalWord: word,
      };
    }
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
        totalSafeWords: this.userWhitelist.size,
        totalBannedWords: this.bannedWords.length,
        totalWhitelisted: defaultWhitelist.length,
        usingFastLookup: this.useFastLookup,
        cacheSizeBytes: this.useFastLookup
          ? Buffer.from(JSON.stringify(this.fastLookup)).length
          : undefined,
      },
    };
  }

  debugMapping(char: string): string {
    const normalizedChar = this.caseSensitive ? char : char.toLowerCase();
    return this.homoglyphMapping[normalizedChar] || char;
  }
}
