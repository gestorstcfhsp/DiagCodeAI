'use server';
/**
 * @fileOverview Summarizes clinical notes to provide a quick overview of patient history and condition.
 *
 * - summarizeClinicalNotes - A function that summarizes clinical notes.
 * - SummarizeClinicalNotesInput - The input type for the summarizeClinicalNotes function.
 * - SummarizeClinicalNotesOutput - The return type for the summarizeClinicalNotes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeClinicalNotesInputSchema = z.object({
  clinicalNotes: z
    .string()
    .describe('The clinical notes to summarize. Can include various medical information about a patient.'),
});
export type SummarizeClinicalNotesInput = z.infer<typeof SummarizeClinicalNotesInputSchema>;

const SummarizeClinicalNotesOutputSchema = z.object({
  summary: z
    .string()
    .describe('A concise summary of the clinical notes, highlighting key information about the patient, in Spanish.'),
});
export type SummarizeClinicalNotesOutput = z.infer<typeof SummarizeClinicalNotesOutputSchema>;

export async function summarizeClinicalNotes(input: SummarizeClinicalNotesInput): Promise<SummarizeClinicalNotesOutput> {
  return summarizeClinicalNotesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeClinicalNotesPrompt',
  input: {schema: SummarizeClinicalNotesInputSchema},
  output: {schema: SummarizeClinicalNotesOutputSchema},
  prompt: `You are an expert medical summarizer. Please summarize the following clinical notes IN SPANISH, highlighting the most important information about the patient's history and current condition. Be concise and accurate.

Clinical Notes:
{{{clinicalNotes}}}`,
});

const summarizeClinicalNotesFlow = ai.defineFlow(
  {
    name: 'summarizeClinicalNotesFlow',
    inputSchema: SummarizeClinicalNotesInputSchema,
    outputSchema: SummarizeClinicalNotesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
