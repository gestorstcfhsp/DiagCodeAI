// src/ai/flows/extract-clinical-concepts.ts
'use server';

/**
 * @fileOverview Extracts clinical concepts and symptoms from clinical documents.
 *
 * - extractClinicalConcepts - A function that extracts clinical concepts from clinical documents.
 * - ExtractClinicalConceptsInput - The input type for the extractClinicalConcepts function.
 * - ExtractClinicalConceptsOutput - The return type for the extractClinicalConcepts function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractClinicalConceptsInputSchema = z.object({
  documentText: z.string().describe('The text extracted from the clinical document.'),
});
export type ExtractClinicalConceptsInput = z.infer<typeof ExtractClinicalConceptsInputSchema>;

const ExtractClinicalConceptsOutputSchema = z.object({
  clinicalConcepts: z.array(z.string()).describe('The list of extracted clinical concepts and symptoms.'),
});
export type ExtractClinicalConceptsOutput = z.infer<typeof ExtractClinicalConceptsOutputSchema>;

export async function extractClinicalConcepts(input: ExtractClinicalConceptsInput): Promise<ExtractClinicalConceptsOutput> {
  return extractClinicalConceptsFlow(input);
}

const extractClinicalConceptsPrompt = ai.definePrompt({
  name: 'extractClinicalConceptsPrompt',
  input: {schema: ExtractClinicalConceptsInputSchema},
  output: {schema: ExtractClinicalConceptsOutputSchema},
  prompt: `You are a medical expert. Extract the clinical concepts and symptoms from the following clinical document text. Return a list of clinical concepts and symptoms.\n\nDocument Text: {{{documentText}}}`,  
});

const extractClinicalConceptsFlow = ai.defineFlow(
  {
    name: 'extractClinicalConceptsFlow',
    inputSchema: ExtractClinicalConceptsInputSchema,
    outputSchema: ExtractClinicalConceptsOutputSchema,
  },
  async input => {
    const {output} = await extractClinicalConceptsPrompt(input);
    return output!;
  }
);
