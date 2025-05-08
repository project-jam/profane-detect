[![NPM](https://nodei.co/npm/@projectjam/profane-detect.png?downloads=true\&downloadRank=true\&stars=true)](https://nodei.co/npm/@projectjam/profane-detect/)

> \[!NOTE]
> the bad words are extracted from the [profane-words](https://github.com/zacanger/profane-words) package, and modified by us
>
> including the homoglyph characters are extracted from the unicode homoglyph list, and modified by us to ensure safety

# @projectjam/profane-detect

Universal profanity detection that handles obfuscated text, homoglyphs, and multiple character variations. Detects attempts to bypass filters using special characters, similar-looking letters, subtle modifications, or reversed text (optional!).

## features

* 🔍 Robust detection of obfuscated profanity
* 🔄 Homoglyph mapping (similar-looking characters)
* 📝 JSON output with metrics and timestamps
* ⚡ Fast normalization and caching
* 🌐 Full Unicode support
* 📦 Works with ESM, CommonJS, and TypeScript
* ◀️ reversible-text detection (enable with `enableReverseDetection`)

## working on

* [x] fast lookup
* [ ] universal language support
* [ ] custom homoglyph symbols
* [ ] slangs

## installation

```bash
npm install @projectjam/profane-detect
```

## usage

### basic detection

```javascript
import { ProfaneDetect } from '@projectjam/profane-detect';

// reverse detection disabled by default
const detector = new ProfaneDetect({ enableReverseDetection: false });

const result = detector.detect("hello f*ck");
console.log(result);
```

### enable reverse-text detection

```javascript
import { ProfaneDetect } from '@projectjam/profane-detect';

// reversals turned on for catches like "reggin"
const detector = new ProfaneDetect({ enableReverseDetection: true });

const result = detector.detect("reggin");
console.log(result);
```

### json output

```javascript
const jsonResult = detector.toJson("hello f*ck");
console.log(jsonResult);
```

## custom configuration

```typescript
const detector = new ProfaneDetect({
  // custom safe words to ignore
  safeWords: ["grass", "assessment"],

  // case sensitive matching
  caseSensitive: true,

  // custom banned words
  bannedWords: ["bad", "words"],

  // custom character mapping
  homoglyphMapping: { 'α': 'a', 'β': 'b' },

  // toggle reversed-text scanning
  enableReverseDetection: true
});
```

## handles obfuscation

```javascript
// unicode fullwidth
detector.detect("ｆｕｃｋ");

// homoglyphs
detector.detect("f𝒖ck");

// separators
detector.detect("f.u.c.k");

// similar characters
detector.detect("ſuck");

// reversed text
detector.detect("reggin");
```

## api reference

### constructor

```typescript
constructor(options?: {
  safeWords?: string[];
  caseSensitive?: boolean;
  bannedWords?: string[];
  homoglyphMapping?: Record<string, string>;
  /**
   * toggle reversed-text detection (default: false)
   */
  enableReverseDetection?: boolean;
  /**
   * Enable fast lookup cache for better performance
   * @default true
   */
  useFastLookup?: boolean;
});
```

### methods

#### detect()

```typescript
detect(text: string): DetectionResult & { reversedMatches?: string[] }
```

* **`reversedMatches`** only present when `enableReverseDetection` is `true`.

#### toJson()

```typescript
toJson(text: string): DetectionEntryWithFlags
```

* **`flags.reversedDetected`** indicates if reversed profanity was found.

## fast lookup cache

the package includes a pre-built cache of common profane words for fast lookup. the cache is stored in `src/cache.json` and can be updated using the `update-cache` script.

```typescript
// enable fast lookup
const detector = new ProfaneDetect({
  useFastLookup: true,
  safeWords: ["custom", "safe", "words"],
  enableReverseDetection: true
});

// check individual words quickly
const status = detector.checkWord("someword");
console.log(status);
```

## contributing

Pull requests are welcome! For major changes, please open an issue first or [email us](mailto:contact@project-jam.is-a.dev). Make sure tests are updated to cover new options—otherwise, no more problems with the tests! 🚀
