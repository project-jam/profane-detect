// profane-detect.ts
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

// ————————————————————————————————————————————————
// __dirname shim for ES modules
// ————————————————————————————————————————————————
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ————————————————————————————————————————————————
// File Loaders
// ————————————————————————————————————————————————
function loadHomoglyphMapping(filePath: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    const chars = Array.from(clean);
    const base = chars.find((c) => c.trim()) || chars[0];
    for (const c of chars) {
      if (c.trim()) mapping[c] = base;
    }
  }
  return mapping;
}

function loadWordList(filePath: string): string[] {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ————————————————————————————————————————————————
// Paths & Defaults
// ————————————————————————————————————————————————
const CHAR_MAPPING_PATH = path.join(__dirname, "../raw_data/chars.txt");
const WORDS_PATH = path.join(__dirname, "../raw_data/languages/en.json");
const WHITELIST_PATH = path.join(__dirname, "../raw_data/whitelist.json");

const defaultHomoglyphMapping = loadHomoglyphMapping(CHAR_MAPPING_PATH);
const defaultBannedWords = loadWordList(WORDS_PATH);
const defaultWhitelist = loadWordList(WHITELIST_PATH);

// ————————————————————————————————————————————————
// ProfaneDetect Class
// ————————————————————————————————————————————————
export class ProfaneDetect {
  private readonly bannedWords: string[];
  private readonly homoglyphMapping: Record<string, string>;
  private readonly caseSensitive: boolean;
  private readonly useFastLookup: boolean;
  private readonly fastLookup: FastLookup = {};
  private readonly userWhitelist: Set<string> = new Set();
  private readonly separatorRegex: RegExp;

  constructor(options?: ProfaneDetectOptions) {
    this.bannedWords = options?.bannedWords || defaultBannedWords;
    this.homoglyphMapping =
      options?.homoglyphMapping || defaultHomoglyphMapping;
    this.caseSensitive = !!options?.caseSensitive;
    this.useFastLookup = options?.useFastLookup !== false;

    const allKeys = Object.keys(this.homoglyphMapping)
      .map((c) => c.replace(/([\]\\^-])/g, "\\$1"))
      .join("");
    this.separatorRegex = new RegExp(
      `(?<=\\p{L})[${allKeys}]+(?=\\p{L})`,
      "gu",
    );

    this.initializeCaches(options?.safeWords);
  }

  private initializeCaches(safeWords?: string[]): void {
    for (const w of defaultWhitelist) {
      const key = this.normalize(w);
      this.fastLookup[key] = {
        status: "safe",
        reason: "default whitelist",
        originalWord: w,
      };
    }
    for (const w of this.bannedWords) {
      const key = this.normalize(w);
      this.fastLookup[key] = {
        status: "banned",
        reason: "banned word",
        originalWord: w,
      };
    }
    if (safeWords) {
      for (const w of safeWords) {
        const key = this.normalize(w);
        this.userWhitelist.add(key);
        this.fastLookup[key] = {
          status: "pass",
          reason: "user whitelist",
          originalWord: w,
        };
      }
    }
  }

  normalize(text: string): string {
    let s = text.normalize("NFD");
    s = s.replace(this.separatorRegex, "");
    s = s.replace(/[\u0300-\u036F]/g, "");
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
    if (!this.caseSensitive) s = s.toLowerCase();
    return Array.from(s)
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

    for (const w of words) {
      if (!w) continue;
      lookupHits++;
      const status = this.fastLookup[w];
      if (status) {
        if (status.status === "banned") {
          matches.add(status.originalWord || w);
        } else {
          whitelistedSkips++;
        }
        continue;
      }
      this.fastLookup[w] = { status: "safe", reason: "not found" };
      whitelistedSkips++;

      const rev = w.split("").reverse().join("");
      const revStatus = this.fastLookup[rev];
      if (revStatus && revStatus.status === "banned") {
        reversedMatches.add(revStatus.originalWord || rev);
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
    return this.fastLookup[key] || { status: "safe", reason: "not found" };
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
