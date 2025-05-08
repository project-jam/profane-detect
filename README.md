[![npm](https://nodei.co/npm/@projectjam/profane-detect.png?downloads=true\&downloadrank=true\&stars=true)](https://nodei.co/npm/@projectjam/profane-detect/)

> \[!note]
> the bad words are extracted from the [profane-words](https://github.com/zacanger/profane-words) package, and modified by us
>
> including the homoglyph characters are extracted from the unicode homoglyph list, and modified by us to ensure safety

# @projectjam/profane-detect

universal profanity detection that handles obfuscated text, homoglyphs, and multiple character variations. detects attempts to bypass filters using special characters, similar-looking letters, subtle modifications, or reversed text (optional!).

## features

* 🔍 robust detection of obfuscated profanity
* 🔄 homoglyph mapping (similar-looking characters)
* 📝 json output with metrics and timestamps
* ⚡ fast normalization and caching
* 🌐 full unicode support
* 📦 works with esm, commonjs, and typescript

## working on

* [x] fast lookup
* [ ] universal language support
* [ ] custom homoglyph symbols
* [ ] slangs
* [ ] reversed text (tried it, but coming soon)

## installation

```bash
npm install @projectjam/profane-detect
```

## usage

### basic detection

```javascript
import { profanedetect } from '@projectjam/profane-detect';

// reverse detection disabled by default
const detector = new profanedetect({ enablereversedetection: false });

const result = detector.detect("hello f*ck");
console.log(result);
```

### enable reverse-text detection

```javascript
import { profanedetect } from '@projectjam/profane-detect';

// reversals turned on for catches like "reggin"
const detector = new profanedetect({ enablereversedetection: true });

const result = detector.detect("reggin");
console.log(result);
```

### json output

```javascript
const jsonresult = detector.tojson("hello f*ck");
console.log(jsonresult);
```

## custom configuration

```typescript
const detector = new profanedetect({
  // custom safe words to ignore
  safewords: ["grass", "assessment"],

  // case sensitive matching
  casesensitive: true,

  // custom banned words
  bannedwords: ["bad", "words"],

  // custom character mapping
  homoglyphmapping: { 'α': 'a', 'β': 'b' },

  // toggle reversed-text scanning
  enablereversedetection: true
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
  safewords?: string[];
  casesensitive?: boolean;
  bannedwords?: string[];
  homoglyphmapping?: record<string, string>;
  /**
   * toggle reversed-text detection (default: false)
   */
  enablereversedetection?: boolean;
  /**
   * enable fast lookup cache for better performance
   * @default true
   */
  usefastlookup?: boolean;
});
```

### methods

#### detect()

```typescript
detect(text: string): detectionresult & { reversedmatches?: string[] }
```

* **`reversedmatches`** only present when `enablereversedetection` is `true`.

#### tojson()

```typescript
tojson(text: string): detectionentrywithflags
```

* **`flags.reverseddetected`** indicates if reversed profanity was found.

## fast lookup cache

the package includes a pre-built cache of common profane words for fast lookup. the cache is stored in `src/cache.json` and can be updated using the `update-cache` script.

```typescript
// enable fast lookup
const detector = new profanedetect({
  usefastlookup: true,
  safewords: ["custom", "safe", "words"],
  enablereversedetection: true
});

// check individual words quickly
const status = detector.checkword("someword");
console.log(status);
```

## contributing

pull requests are welcome! for major changes, please open an issue first or [email us](mailto:contact@project-jam.is-a.dev). make sure tests are updated to cover new options—otherwise, no more problems with the tests! 🚀
