import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-diagnoses.ts';
import '@/ai/flows/summarize-clinical-notes.ts'; // Nuevo flujo de resumen
import '@/ai/flows/extract-clinical-concepts.ts';
import '@/ai/flows/extract-text-from-document.ts';
import '@/ai/flows/summarize-extensive-document.ts';


