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

// Helpers to load raw data
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadHomoglyphMapping(filePath: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const chars = Array.from(line);
    const base = chars.find((c) => c.trim()) || chars[0];
    for (const char of chars) {
      if (char.trim()) mapping[char] = base;
    }
  }

  return mapping;
}

function loadWordList(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

// Paths to your raw data
const CHAR_MAPPING_PATH = path.join(__dirname, "../raw_data/chars.txt");
const WORDS_PATH = path.join(__dirname, "../raw_data/languages/en.json");
const WHITELIST_PATH = path.join(__dirname, "../raw_data/whitelist.json");

// Default data
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

  constructor(options?: ProfaneDetectOptions) {
    this.bannedWords = options?.bannedWords || defaultBannedWords;
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = options?.caseSensitive || false;
    this.useFastLookup = options?.useFastLookup !== false; // default true

    this.initializeCaches(options?.safeWords);
  }

  private initializeCaches(safeWords?: string[]): void {
    // Precompute normalized default-whitelist
    const normalizedDefaultWhitelist = new Set<string>();
    for (const word of defaultWhitelist) {
      normalizedDefaultWhitelist.add(this.normalize(word));
    }

    if (this.useFastLookup) {
      // 1) Add banned words first, skipping any in default whitelist
      for (const word of this.bannedWords) {
        const norm = this.normalize(word);
        if (normalizedDefaultWhitelist.has(norm)) continue;
        this.fastLookup[norm] = {
          status: "banned",
          reason: "banned word",
          originalWord: word,
        };
      }

      // 2) Add default whitelist (overwrites any banned)
      for (const word of defaultWhitelist) {
        const norm = this.normalize(word);
        this.fastLookup[norm] = {
          status: "safe",
          reason: "default whitelist",
          originalWord: word,
        };
      }

      // 3) Add user-provided safeWords on top
      if (safeWords) {
        for (const word of safeWords) {
          const norm = this.normalize(word);
          this.userWhitelist.add(norm);
          this.fastLookup[norm] = {
            status: "pass",
            reason: "user whitelist",
            originalWord: word,
          };
        }
      }
    } else {
      // Non-fast lookup path: same ordering, different storage
      // a) default whitelist
      for (const word of defaultWhitelist) {
        this.normalizedWhitelist.add(this.normalize(word));
      }
      // b) banned words, skipping whitelist
      for (const word of this.bannedWords) {
        const norm = this.normalize(word);
        if (!this.normalizedWhitelist.has(norm)) {
          this.normalizedBannedWords.set(norm, word);
        }
      }
      // c) user whitelist
      if (safeWords) {
        for (const word of safeWords) {
          this.normalizedWhitelist.add(this.normalize(word));
        }
      }
    }
  }

  normalize(text: string): string {
    let normalized = text
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036F]/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, "~")
      .replace(/[-_.*+!@#$%^&()]/g, "~");

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

    // Build normalizedBannedWords map on-the-fly for fastLookup path
    if (this.useFastLookup && this.normalizedBannedWords.size === 0) {
      for (const word of this.bannedWords) {
        const norm = this.normalize(word);
        if (
          !this.fastLookup[norm] ||
          this.fastLookup[norm].status !== "banned"
        ) {
          this.normalizedBannedWords.set(norm, word);
        }
      }
    }

    for (const [bannedNorm, original] of this.normalizedBannedWords) {
      let pattern: string;
      if (bannedNorm.includes("~")) {
        const parts = bannedNorm.split("~").map((p) => p.split("").join("~*"));
        pattern = parts.join("~+");
      } else {
        pattern = bannedNorm.split("").join("~*");
      }
      const regex = new RegExp(pattern, "g");
      if (regex.test(normalizedText)) {
        matches.add(original);
      }
    }

    return {
      found: matches.size > 0,
      matches: Array.from(matches),
      normalized: normalizedText,
      metrics: {
        exactMatches: matches.size,
        fuzzyMatches: 0,
        totalChecked: normalizedText.length,
        whitelistedSkips: 0,
        lookupHits: this.useFastLookup ? 0 : undefined,
      },
    };
  }

  checkWord(word: string): WordStatus {
    if (!this.useFastLookup) {
      throw new Error("Fast lookup is disabled.");
    }

    const norm = this.normalize(word);
    if (this.userWhitelist.has(norm)) {
      return { status: "pass", reason: "user whitelist" };
    }
    return this.fastLookup[norm] || { status: "safe", reason: "not found" };
  }

  addToWhitelist(word: string): void {
    const norm = this.normalize(word);
    this.userWhitelist.add(norm);
    if (this.useFastLookup) {
      this.fastLookup[norm] = {
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
          ? Buffer.byteLength(JSON.stringify(this.fastLookup))
          : undefined,
      },
    };
  }

  debugMapping(char: string): string {
    const key = this.caseSensitive ? char : char.toLowerCase();
    return this.homoglyphMapping[key] || char;
  }
}
