import { LookupTreeEntry, LookupTree } from '../types.js';
import { SubstitutionLookupRecord, Lookup } from '../tables.js';

import { getIndividualSubstitutionGlyph, getRangeSubstitutionGlyphs } from './substitution.js';

export interface EntryMeta {
  entry: LookupTreeEntry;
  substitutions: (number | null)[];
}

export function processInputPosition(
  glyphs: (number | [number, number])[],
  position: number,
  currentEntries: EntryMeta[],
  lookupRecords: SubstitutionLookupRecord[],
  lookups: Lookup[]
): EntryMeta[] {
  const nextEntries: EntryMeta[] = [];
  for (const currentEntry of currentEntries) {
    currentEntry.entry.forward = {
      individual: new Map<number, LookupTreeEntry>(),
      range: []
    };
    for (const glyph of dedupGlyphs(glyphs)) {
      nextEntries.push(...getInputTree(
        currentEntry.entry.forward,
        lookupRecords,
        lookups,
        position,
        glyph
      ).map(({ entry, substitution }) => ({
        entry,
        substitutions: [...currentEntry.substitutions, substitution]
      })));
    }
  }

  return nextEntries;
}

export function processLookaheadPosition(
  glyphs: (number | [number, number])[],
  currentEntries: EntryMeta[]
): EntryMeta[] {
  const nextEntries: EntryMeta[] = [];
  for (const currentEntry of currentEntries) {
    for (const glyph of dedupGlyphs(glyphs)) {
      const entry: LookupTreeEntry = {};
      if (!currentEntry.entry.forward) {
        currentEntry.entry.forward = {
          individual: new Map<number, LookupTreeEntry>(),
          range: []
        };
      }
      nextEntries.push({
        entry,
        substitutions: currentEntry.substitutions
      });

      if (Array.isArray(glyph)) {
        currentEntry.entry.forward.range.push({
          entry,
          range: glyph
        });
      } else {
        currentEntry.entry.forward.individual.set(glyph, entry);
      }
    }
  }

  return nextEntries;
}

export function processBacktrackPosition(
  glyphs: (number | [number, number])[],
  currentEntries: EntryMeta[]
): EntryMeta[] {
  const nextEntries: EntryMeta[] = [];

  for (const currentEntry of currentEntries) {
    for (const glyph of dedupGlyphs(glyphs)) {
      const entry: LookupTreeEntry = {};
      if (!currentEntry.entry.reverse) {
        currentEntry.entry.reverse = {
          individual: new Map<number, LookupTreeEntry>(),
          range: []
        };
      }
      nextEntries.push({
        entry,
        substitutions: currentEntry.substitutions
      });

      if (Array.isArray(glyph)) {
        currentEntry.entry.reverse.range.push({
          entry,
          range: glyph
        });
      } else {
        currentEntry.entry.reverse.individual.set(glyph, entry);
      }
    }
  }
  return nextEntries;
}

function dedupGlyphs(glyphs: (number | [number, number])[]): (number | [number, number])[] {
  if (glyphs.length < 2) {
    return glyphs;
  }

  const result: (number | [number, number])[] = [];
  const singleGlyphs = new Set<number>();
  const pairGlyphs = new Set<[number, number]>();

  for (const glyph of glyphs) {
    if (Array.isArray(glyph)) {
      let found = false;
      for (const pair of pairGlyphs) {
        if (pair[0] === glyph[0] && pair[1] === glyph[1]) {
          found = true;
          break;
        }
      }
      if (!found) {
        result.push(glyph);
        pairGlyphs.add(glyph);
      }

    } else {
      if (!singleGlyphs.has(glyph)) {
        result.push(glyph);
        singleGlyphs.add(glyph);
      }
    }
  }
  return result;
}

export function getInputTree(tree: LookupTree, substitutions: SubstitutionLookupRecord[], lookups: Lookup[], inputIndex: number, glyphId: number | [number, number]): { entry: LookupTreeEntry; substitution: number | null; }[] {
  const result: { entry: LookupTreeEntry; substitution: number | null; }[] = [];
  if (!Array.isArray(glyphId)) {
    tree.individual.set(glyphId, {});
    result.push({
      entry: tree.individual.get(glyphId),
      substitution: getSubstitutionAtPosition(substitutions, lookups, inputIndex, glyphId)
    });
  } else {
    const subs = getSubstitutionAtPositionRange(substitutions, lookups, inputIndex, glyphId);
    for (const [range, substitution] of subs) {
      const entry: LookupTreeEntry = {};
      if (Array.isArray(range)) {
        tree.range.push({ range, entry });
      } else {
        tree.individual.set(range, {});
      }
      result.push({ entry, substitution });
    }
  }

  return result;
}

function getSubstitutionAtPositionRange(substitutions: SubstitutionLookupRecord[], lookups: Lookup[], index: number, range: [number, number]): Map<number | [number, number], number | null> {
  for (const substitution of substitutions.filter(s => s.sequenceIndex === index)) {
    for (const substitutionTable of (lookups[substitution.lookupListIndex] as Lookup.Type1).subtables) {
      const sub = getRangeSubstitutionGlyphs(
        substitutionTable,
        range
      );

      if (!Array.from(sub.values()).every(val => val !== null)) {
        return sub;
      }
    }
  }

  return new Map([[range, null]]);
}

function getSubstitutionAtPosition(substitutions: SubstitutionLookupRecord[], lookups: Lookup[], index: number, glyphId: number): number | null {
  for (const substitution of substitutions.filter(s => s.sequenceIndex === index)) {
    for (const substitutionTable of (lookups[substitution.lookupListIndex] as Lookup.Type1).subtables) {
      const sub = getIndividualSubstitutionGlyph(
        substitutionTable,
        glyphId
      );

      if (sub !== null) {
        return sub;
      }
    }
  }

  return null;
}
