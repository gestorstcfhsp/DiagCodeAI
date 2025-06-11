import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-diagnoses.ts';
import '@/ai/flows/summarize-clinical-notes.ts';
import '@/ai/flows/extract-clinical-concepts.ts';