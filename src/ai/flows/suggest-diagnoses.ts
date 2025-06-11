// src/ai/flows/suggest-diagnoses.ts
'use server';
/**
 * @fileOverview An AI agent for suggesting diagnoses based on clinical documentation and coding system.
 *
 * - suggestDiagnoses - A function that handles the diagnosis suggestion process.
 * - SuggestDiagnosesInput - The input type for the suggestDiagnoses function.
 * - SuggestDiagnosesOutput - The return type for the suggestDiagnoses function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestDiagnosesInputSchema = z.object({
  clinicalText: z
    .string()
    .describe('The clinical text extracted from the patient documentation.'),
  codingSystem: z.enum(['CIE-10', 'CIE-11', 'CIE-O']).describe('The coding system to use for diagnosis suggestions.'),
});
export type SuggestDiagnosesInput = z.infer<typeof SuggestDiagnosesInputSchema>;

const SuggestDiagnosesOutputSchema = z.object({
  diagnoses: z.array(
    z.object({
      code: z.string().describe('The diagnosis code in the selected coding system.'),
      description: z.string().describe('The description of the diagnosis.'),
      confidence: z.number().describe('Confidence level of the diagnosis suggestion (0-1).'),
    })
  ).describe('A prioritized list of suggested diagnoses.'),
});
export type SuggestDiagnosesOutput = z.infer<typeof SuggestDiagnosesOutputSchema>;

export async function suggestDiagnoses(input: SuggestDiagnosesInput): Promise<SuggestDiagnosesOutput> {
  return suggestDiagnosesFlow(input);
}

const suggestDiagnosesPrompt = ai.definePrompt({
  name: 'suggestDiagnosesPrompt',
  input: {schema: SuggestDiagnosesInputSchema},
  output: {schema: SuggestDiagnosesOutputSchema},
  prompt: `You are an AI assistant specialized in suggesting diagnoses based on clinical text and a selected coding system.

  Based on the following clinical text:
  {{clinicalText}}

  And the selected coding system: {{codingSystem}}

  Generate a prioritized list of suggested diagnoses, including the diagnosis code, description, and a confidence level (0-1).
  Return the diagnoses as a JSON array.
  `,
});

const suggestDiagnosesFlow = ai.defineFlow(
  {
    name: 'suggestDiagnosesFlow',
    inputSchema: SuggestDiagnosesInputSchema,
    outputSchema: SuggestDiagnosesOutputSchema,
  },
  async input => {
    const {output} = await suggestDiagnosesPrompt(input);
    return output!;
  }
);
