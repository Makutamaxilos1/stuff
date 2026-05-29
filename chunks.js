const fs = require('fs');
const path = require('path');

// --- CONFIGURATION BASE LIMITS ---
const defaultVerbLimit = 3;
const defaultNounLimit = 2;

// 1. Path configurations
const VERBS_PATH = path.join(__dirname, '../data/templates/verbs.json');
const NOUNS_PATH = path.join(__dirname, '../data/templates/nouns.json');
const OUTPUT_TSV_PATH = path.join(__dirname, 'verbs.tsv');
const BUCKETS_JSON_PATH = path.join(__dirname, 'verbsBuckets.json');

// 2. Load the source files
const verbsDB = JSON.parse(fs.readFileSync(VERBS_PATH, 'utf8'));
const nounDB = JSON.parse(fs.readFileSync(NOUNS_PATH, 'utf8'));

// Initialize state-preservation matrices
let existingEntries = new Set();
let tsvOutput = ["Hebrew\tTranslation"];
let savedBucketsState = null;

// --- STATE PRESERVATION READ LAYERS ---
if (fs.existsSync(OUTPUT_TSV_PATH)) {
  const fileContent = fs.readFileSync(OUTPUT_TSV_PATH, 'utf8');
  const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length > 0) {
    tsvOutput = [lines[0]]; // Keep original header
    for (let i = 1; i < lines.length; i++) {
      existingEntries.add(lines[i]);
      tsvOutput.push(lines[i]);
    }
  }
}

if (fs.existsSync(BUCKETS_JSON_PATH)) {
  try {
    savedBucketsState = JSON.parse(fs.readFileSync(BUCKETS_JSON_PATH, 'utf8'));
    console.log("Loaded existing round-robin count balances state smoothly.");
  } catch (e) {
    console.log("Existing buckets file was empty or corrupted. Regenerating baseline configuration matrices...");
  }
}

// Strict taxonomy inheritance hierarchy
const TYPE_HIERARCHY = {
  "edible": ["consumable"], "animate": ["moving"], "drink": ["edible", "liquid"],
  "food": ["edible", "physical"], "nomeat": ["food"], "consumable": ["physical"],
  "solid": ["physical"], "liquid": ["physical"], "object": ["solid"],
  "animal": ["animate", "edible"], "human": ["animate", "physical"], "role": ["human"],
  "profession": ["role"], "holdable": ["object"], "tool": ["tool"],
  "concept": ["nonphysical"], "predator": ["animal"], "prey": ["animal"],
  "vehicle": ["object", "moving"], "structure": ["object"], "building": ["structure", "place"],
  "furniture": ["object"], "place": ["physical"], "country": ["place"],
  "prep": ["al", "el", "betoch"], "time": ["concept"]
};

// Helper: Fisher-Yates Shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Helper: Recursively expand semantic traits
function expandTraits(traitsArray) {
  if (!traitsArray || !Array.isArray(traitsArray)) return [];
  let results = [...traitsArray];
  let stack = [...traitsArray];
  while (stack.length > 0) {
    let current = stack.pop();
    if (TYPE_HIERARCHY[current]) {
      for (let parent of TYPE_HIERARCHY[current]) {
        if (!results.includes(parent)) {
          results.push(parent);
          stack.push(parent);
        }
      }
    }
  }
  return results;
}

// Helper: Morphophonemic transformations for Hebrew noun definite prefixing
const KAMATZ = "\u05B8";
function makeDefinite(indef) {
  if (!indef) return "";
  const indefStr = String(indef).trim();
  if (indefStr.length === 0) return "";
  
  const parts = indefStr.split(" ");
  const headWord = parts[0];
  const firstChar = headWord.charAt(0);
  const secondChar = headWord.length > 1 ? headWord.charAt(1) : "";

  let resultHead = "";
  if ((firstChar === 'ח' || firstChar === 'ע' || firstChar === 'ה') && secondChar === KAMATZ) {
    resultHead = "הֶ" + headWord;
  } else if (firstChar === 'א' || firstChar === 'ע' || firstChar === 'ר') {
    resultHead = "הָ" + headWord;
  } else {
    resultHead = "הַ" + headWord;
  }

  parts[0] = resultHead;
  return parts.join(" ");
}

// --- INITIALIZE DATA STRUCTURES & COUNTS ---

const nouns = [];
const nounBuckets = savedBucketsState?.nounBuckets || {};

for (const [lemma, record] of Object.entries(nounDB)) {
  if (!record || typeof record !== 'object') continue;
  const expandedTraits = expandTraits(record.traits);
  const gender = record.gender || "m";
  
  const nounMultiplier = record.multiplier || record.mulitplier || 1;

  if (record.singular?.indef) {
    const id = `${lemma}_s`;
    if (!nounBuckets[id]) nounBuckets[id] = { indef: 0, def: 0 };
    nouns.push({ 
      id, lemma, text: record.singular.indef, eng: record.singular.translation || lemma, 
      gender, number: "s", traits: expandedTraits, multiplier: nounMultiplier 
    });
  }
  if (record.plural?.indef) {
    const id = `${lemma}_p`;
    if (!nounBuckets[id]) nounBuckets[id] = { indef: 0, def: 0 };
    nouns.push({ 
      id, lemma, text: record.plural.indef, eng: record.plural.translation || (lemma + "s"), 
      gender, number: "p", traits: expandedTraits, multiplier: nounMultiplier 
    });
  }
}

const verbForms = [];
const verbBuckets = savedBucketsState?.verbBuckets || {};
const finitePersonMapping = { "3ms": { g: "m", n: "s" }, "3fs": { g: "f", n: "s" }, "3mp": { g: "m", n: "p" }, "3fp": { g: "f", n: "p" } };

for (const [lemma, binyanim] of Object.entries(verbsDB)) {
  for (const [binyan, data] of Object.entries(binyanim)) {
    if (!data) continue;
    const allowedSubjectTypes = data.subject || [];
    
    const stemVerbMultiplier = data.multiplier || data.mulitplier || 1;

    // A. Extract Finite Verb Forms
    if (data.finite) {
      for (const [tense, forms] of Object.entries(data.finite)) {
        if (tense === "translation") continue;

        for (const [personKey, hebrewVerb] of Object.entries(forms)) {
          const req = finitePersonMapping[personKey];
          if (!req || typeof hebrewVerb !== 'string') continue;

          const id = `${lemma}_${binyan}_finite_${tense}_${req.g}_${req.n}`;
          if (!verbBuckets[id]) verbBuckets[id] = 0;

          verbForms.push({
            id, lemma, binyan, type: 'finite', tense, gender: req.g, number: req.n,
            hebrew: hebrewVerb, eng: forms.translation, allowedSubjects: allowedSubjectTypes,
            multiplier: stemVerbMultiplier
          });
        }
      }
    }

    // B. Extract Participle Forms
    if (data.participle) {
      let trans = data.participle.translation || "acting";
      if (trans.includes('/')) trans = trans.split('/')[1] || trans.split('/')[0];

      const partsConfig = [
        { n: "s", g: "m", path: ["singular", "masculine"], aux: "is " },
        { n: "s", g: "f", path: ["singular", "feminine"], aux: "is " },
        { n: "p", g: "m", path: ["plural", "masculine"], aux: "are " },
        { n: "p", g: "f", path: ["plural", "feminine"], aux: "are " }
      ];

      for (const config of partsConfig) {
        let heb = data.participle;
        for (const step of config.path) { heb = heb ? heb[step] : undefined; }
        if (!heb || typeof heb !== 'string') continue;

        const id = `${lemma}_${binyan}_participle_present_${config.g}_${config.n}`;
        if (!verbBuckets[id]) verbBuckets[id] = 0;

        verbForms.push({
          id, lemma, binyan, type: 'participle', tense: 'present', gender: config.g, number: config.n,
          hebrew: heb, eng: `${config.aux}${trans}`, allowedSubjects: allowedSubjectTypes,
          multiplier: stemVerbMultiplier
        });
      }
    }
  }
}

// Identify structurally deadlocked units
const deadlockedVerbs = new Set();
for (const verb of verbForms) {
  const hasMatch = nouns.some(n => 
    n.gender === verb.gender && 
    n.number === verb.number && 
    verb.allowedSubjects.some(t => n.traits.includes(t))
  );
  if (!hasMatch) deadlockedVerbs.add(verb.id);
}

const deadlockedNouns = new Set();
for (const noun of nouns) {
  const hasMatch = verbForms.some(v => 
    v.gender === noun.gender && 
    v.number === noun.number && 
    v.allowedSubjects.some(t => noun.traits.includes(t))
  );
  if (!hasMatch) deadlockedNouns.add(noun.id);
}

// Helper: Append formatted clause into output set
function recordGeneration(noun, verb, isDefinite) {
  const hebrewSubject = isDefinite ? makeDefinite(noun.text) : noun.text;
  const article = (!isDefinite && noun.number === "s") ? (/^[aeiou]/i.test(noun.eng) ? "An " : "A ") : "";
  const EnglishSubject = isDefinite ? `The ${noun.eng}` : `${article}${noun.eng}`;
  
  const row = `${hebrewSubject} ${verb.hebrew}\t${EnglishSubject} ${verb.eng}`;
  
  if (!existingEntries.has(row)) {
    const defKey = isDefinite ? 'def' : 'indef';
    nounBuckets[noun.id][defKey]++;
    verbBuckets[verb.id]++;

    existingEntries.add(row);
    tsvOutput.push(row);
    return true;
  }
  return false;
}

// --- ROUND-ROBIN ALGORITHM EXECUTION ---

// Phase 1: Fill Verb Buckets up to adjusted scaled multiplier limits
let allVerbsSatisfied = false;
let verbLoopSafetyCounter = 0;

while (!allVerbsSatisfied && verbLoopSafetyCounter < 5000) {
  allVerbsSatisfied = true;
  verbLoopSafetyCounter++;
  shuffle(verbForms); 

  for (const verb of verbForms) {
    if (deadlockedVerbs.has(verb.id)) continue;
    
    const dynamicVerbTarget = defaultVerbLimit * verb.multiplier;
    if (verbBuckets[verb.id] >= dynamicVerbTarget) continue;
    
    allVerbsSatisfied = false;

    let validNouns = nouns.filter(n => 
      !deadlockedNouns.has(n.id) &&
      n.gender === verb.gender && 
      n.number === verb.number && 
      verb.allowedSubjects.some(t => n.traits.includes(t))
    );
    if (validNouns.length === 0) continue;

    // Rank valid nouns by lowest usage balance score to keep balanced selections
    let scoredNouns = validNouns.map(n => {
      return { noun: n, score: Math.min(nounBuckets[n.id].indef, nounBuckets[n.id].def) };
    });
    scoredNouns.sort((a, b) => a.score - b.score);

    // FIX: Iterate through nouns starting from the lowest score until one succeeds
    let generationSucceeded = false;
    for (const entry of scoredNouns) {
      const selectedNoun = entry.noun;
      const indefCount = nounBuckets[selectedNoun.id].indef;
      const defCount = nounBuckets[selectedNoun.id].def;
      
      let generateAsDefinite = defCount <= indefCount;
      
      generationSucceeded = recordGeneration(selectedNoun, verb, generateAsDefinite);
      if (!generationSucceeded) {
        generationSucceeded = recordGeneration(selectedNoun, verb, !generateAsDefinite);
      }
      
      if (generationSucceeded) break; // Break noun selection loop if line successfully added
    }
  }
}

// Phase 2: Fill Noun Buckets up to adjusted scaled multiplier limits
let allNounsSatisfied = false;
let nounLoopSafetyCounter = 0;

while (!allNounsSatisfied && nounLoopSafetyCounter < 5000) {
  allNounsSatisfied = true;
  nounLoopSafetyCounter++;

  let lowestNounScore = Infinity;
  let nounTargets = [];

  for (const noun of nouns) {
    if (deadlockedNouns.has(noun.id)) continue;
    
    const indefCount = nounBuckets[noun.id].indef;
    const defCount = nounBuckets[noun.id].def;

    const dynamicNounTarget = defaultNounLimit * noun.multiplier;
    if (indefCount >= dynamicNounTarget && defCount >= dynamicNounTarget) continue;
    allNounsSatisfied = false;

    const currentLowerScore = Math.min(indefCount, defCount);
    if (currentLowerScore < lowestNounScore) {
      lowestNounScore = currentLowerScore;
      nounTargets = [noun];
    } else if (currentLowerScore === lowestNounScore) {
      nounTargets.push(noun);
    }
  }

  if (allNounsSatisfied || nounTargets.length === 0) break;

  shuffle(nounTargets);
  const selectedNoun = nounTargets[0];

  const indefCount = nounBuckets[selectedNoun.id].indef;
  const defCount = nounBuckets[selectedNoun.id].def;
  let generateAsDefinite = defCount <= indefCount;

  let applicableVerbs = verbForms.filter(v => 
    !deadlockedVerbs.has(v.id) &&
    v.gender === selectedNoun.gender && 
    v.number === selectedNoun.number && 
    v.allowedSubjects.some(t => selectedNoun.traits.includes(t))
  );

  if (applicableVerbs.length === 0) continue;

  // Rank verbs by usage counts to select least-utilized configurations first
  let scoredVerbs = applicableVerbs.map(v => {
    return { verb: v, score: verbBuckets[v.id] };
  });
  scoredVerbs.sort((a, b) => a.score - b.score);

  // FIX: Iterate through verbs starting from the least used until one successfully couples unique text
  let generationSucceeded = false;
  for (const entry of scoredVerbs) {
    const selectedVerb = entry.verb;
    generationSucceeded = recordGeneration(selectedNoun, selectedVerb, generateAsDefinite);
    if (!generationSucceeded) {
      generationSucceeded = recordGeneration(selectedNoun, selectedVerb, !generateAsDefinite);
    }
    if (generationSucceeded) break;
  }
}

// --- SAVE OUTPUT AND METRICS LAYER ---
fs.writeFileSync(OUTPUT_TSV_PATH, tsvOutput.join('\n'), 'utf8');

const serializedState = {
  verbBuckets: verbBuckets,
  nounBuckets: nounBuckets
};
fs.writeFileSync(BUCKETS_JSON_PATH, JSON.stringify(serializedState, null, 2), 'utf8');

console.log(`Incremental generation with multipliers synchronized successfully!`);
console.log(`Total active clause strings inside 'verbs.tsv': ${tsvOutput.length - 1}`);