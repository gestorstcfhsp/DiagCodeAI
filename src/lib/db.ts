// src/lib/db.ts
import Dexie, { type Table } from 'dexie';
import type { SuggestDiagnosesOutput } from '@/ai/flows/suggest-diagnoses';

export interface HistoryEntry {
  id?: number;
  timestamp: number;
  clinicalText: string;
  codingSystem: 'CIE-10' | 'CIE-11' | 'CIE-O';
  extractedConcepts: string[];
  suggestedDiagnoses: SuggestDiagnosesOutput['diagnoses'];
  fileName?: string | null;
}

export class DiagCodeAIDexie extends Dexie {
  history!: Table<HistoryEntry, number>; // Primary key 'id' is number

  constructor() {
    super('DiagCodeAIHistoryDB');
    this.version(1).stores({
      history: '++id, timestamp', // Primary key 'id' (auto-incremented) and index on 'timestamp'
    });
  }
}

export const db = new DiagCodeAIDexie();
