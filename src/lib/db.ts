
// src/lib/db.ts
import Dexie, { type Table } from 'dexie';

// Mantenemos la interfaz original de la IA para la entrada de datos
interface DiagnosisFromAI {
  code: string;
  description: string;
  confidence: number;
}

// Extendemos la interfaz para el uso en la UI y almacenamiento en DB
export interface UIDiagnosis extends DiagnosisFromAI {
  id: string; // Identificador único para la UI (ej. code + timestamp parcial)
  isPrincipal?: boolean;
  isSelected?: boolean;
}

export interface HistoryEntry {
  id?: number;
  timestamp: number;
  clinicalText: string;
  codingSystem: 'CIE-10' | 'CIE-11' | 'CIE-O';
  extractedConcepts: string[];
  suggestedDiagnoses: UIDiagnosis[]; // Usamos la interfaz extendida aquí
  fileName?: string | null;
  clinicalSummary?: string | null; // Nuevo campo para el resumen
}

export class DiagCodeAIDexie extends Dexie {
  history!: Table<HistoryEntry, number>; // Primary key 'id' is number

  constructor() {
    super('DiagCodeAIHistoryDB');
    this.version(1).stores({
      history: '++id, timestamp', 
    });
    // Si fuera necesario añadir índices para clinicalSummary o cambiar estructura de forma que Dexie lo requiera,
    // se haría una nueva versión aquí. Por ahora, añadir un campo opcional no lo requiere estrictamente.
    // Ejemplo:
    // this.version(2).stores({
    //   history: '++id, timestamp, clinicalSummary', // Si clinicalSummary necesitara ser indexado
    // }).upgrade(tx => {
    //   // Lógica de migración para añadir el campo a entradas existentes si se le diera un valor por defecto.
    //   // Por ahora, las entradas antiguas simplemente no tendrán el campo `clinicalSummary`.
    //   return tx.table("history").toCollection().modify(entry => {
    //     if (typeof entry.clinicalSummary === 'undefined') {
    //       entry.clinicalSummary = null; // o un string vacío, o dejar undefined
    //     }
    //   });
    // });
  }
}

export const db = new DiagCodeAIDexie();

