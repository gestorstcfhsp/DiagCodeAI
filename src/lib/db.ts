
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
}

export class DiagCodeAIDexie extends Dexie {
  history!: Table<HistoryEntry, number>; // Primary key 'id' is number

  constructor() {
    super('DiagCodeAIHistoryDB');
    this.version(1).stores({
      history: '++id, timestamp', // Mantener este esquema si no se necesitan indexar los nuevos campos
    });
    // Si se actualiza la estructura de suggestedDiagnoses de forma que Dexie necesite saberlo:
    // this.version(2).stores({
    //   history: '++id, timestamp, suggestedDiagnoses.isPrincipal, suggestedDiagnoses.isSelected', // Ejemplo si se necesitaran índices
    // }).upgrade(tx => {
    //   // Lógica de migración si es necesaria, por ahora no parece serlo
    //   // ya que los campos son opcionales o manejados en la aplicación.
    // });
  }
}

export const db = new DiagCodeAIDexie();
