// src/profaneDetect.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ProfaneDetectOptions,
  DetectionResult,
  DetectionEntryWithFlags,
  DetectionEntryFlags,
  FastLookup,
  WordStatus,
} from "./types";

// Required for ESM __dirname and __filename
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

function loadWordList(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

// File paths
const CHAR_MAPPING_PATH = path.join(__dirname, "../raw_data/chars.txt");
const WORDS_PATH = path.join(__dirname, "../raw_data/languages/en.json");
const WHITELIST_PATH = path.join(__dirname, "../raw_data/whitelist.json");

// Defaults
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

  constructor(options?: ProfaneDetectOptions) {
    this.bannedWords = options?.bannedWords || defaultBannedWords;
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = options?.caseSensitive || false;
    this.useFastLookup = options?.useFastLookup !== false;
    this.initializeCaches(options?.safeWords);
  }

  private initializeCaches(safeWords?: string[]): void {
    for (const word of defaultWhitelist) {
      const key = this.normalize(word);
      this.fastLookup[key] = {
        status: "safe",
        reason: "default whitelist",
        originalWord: word,
      };
    }

    for (const word of this.bannedWords) {
      const key = this.normalize(word);
      this.fastLookup[key] = {
        status: "banned",
        reason: "banned word",
        originalWord: word,
      };
    }

    if (safeWords) {
      for (const word of safeWords) {
        const key = this.normalize(word);
        this.userWhitelist.add(key);
        this.fastLookup[key] = {
          status: "pass",
          reason: "user whitelist",
          originalWord: word,
        };
      }
    }
  }

  normalize(text: string): string {
    let normalized = text
      .normalize("NFD")
      .replace(/[\u0300-\u036F]/g, "") // Remove diacritics
      .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove invisible characters
      .replace(/[-_.*+!@#$%^&()]/g, ""); // Remove symbols
    if (!this.caseSensitive) normalized = normalized.toLowerCase();
    return Array.from(normalized)
      .map((c) => this.homoglyphMapping[c] || c)
      .join("");
  }

  detect(text: string): DetectionResult & { reversedMatches: string[] } {
    const normalizedText = this.normalize(text);
    const words = normalizedText.split(/\s+/);
    const matches = new Set<string>();
    const reversedMatches = new Set<string>();
    let whitelistedSkips = 0;
    let lookupHits = 0;

    for (const word of words) {
      if (!word) continue;

      const status = this.fastLookup[word];
      lookupHits++;

      if (status) {
        if (status.status === "banned") {
          matches.add(status.originalWord || word);
        } else {
          whitelistedSkips++;
        }
        continue;
      }

      this.fastLookup[word] = { status: "safe", reason: "not found" };
      whitelistedSkips++;

      const reversed = word.split("").reverse().join("");
      const revStatus = this.fastLookup[reversed];
      if (revStatus && revStatus.status === "banned") {
        reversedMatches.add(revStatus.originalWord || reversed);
      }
    }

    const found = matches.size > 0 || reversedMatches.size > 0;
    return {
      found,
      matches: Array.from(matches),
      normalized: normalizedText,
      metrics: {
        exactMatches: matches.size,
        fuzzyMatches: 0,
        totalChecked: words.length,
        whitelistedSkips,
        lookupHits,
      },
      reversedMatches: Array.from(reversedMatches),
    };
  }

  checkWord(word: string): WordStatus {
    if (!this.useFastLookup) throw new Error("Fast lookup disabled");
    const key = this.normalize(word);
    if (this.userWhitelist.has(key)) {
      return { status: "pass", reason: "user whitelist" };
    }
    return (
      this.fastLookup[key] || { status: "safe", reason: "not found in cache" }
    );
  }

  addToWhitelist(word: string): void {
    const key = this.normalize(word);
    this.userWhitelist.add(key);
    this.fastLookup[key] = {
      status: "pass",
      reason: "user added",
      originalWord: word,
    };
  }

  toJson(text: string): DetectionEntryWithFlags {
    const result = this.detect(text);
    const now = new Date();
    const flags: DetectionEntryFlags = {
      reversedDetected: result.reversedMatches.length > 0,
    };

    return {
      input: text,
      result,
      flags,
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
        cacheSizeBytes: Buffer.byteLength(JSON.stringify(this.fastLookup)),
      },
    };
  }

  debugMapping(char: string): string {
    const key = this.caseSensitive ? char : char.toLowerCase();
    return this.homoglyphMapping[key] || char;
  }
}
