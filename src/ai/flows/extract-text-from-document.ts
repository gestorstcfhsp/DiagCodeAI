// src/ai/flows/extract-text-from-document.ts
'use server';
/**
 * @fileOverview Extrae texto de documentos clínicos (imágenes, PDFs) usando OCR/NLP.
 *
 * - extractTextFromDocument - Función para extraer texto de un documento.
 * - ExtractTextFromDocumentInput - Tipo de entrada para la función.
 * - ExtractTextFromDocumentOutput - Tipo de salida para la función.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractTextFromDocumentInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "El documento clínico (imagen o PDF) como un data URI que debe incluir un tipo MIME y usar codificación Base64. Formato esperado: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  mimeType: z.string().describe("El tipo MIME del documento, ej: 'image/png', 'application/pdf'."),
});
export type ExtractTextFromDocumentInput = z.infer<typeof ExtractTextFromDocumentInputSchema>;

const ExtractTextFromDocumentOutputSchema = z.object({
  extractedText: z.string().describe('El texto extraído y potencialmente estructurado del documento.'),
});
export type ExtractTextFromDocumentOutput = z.infer<typeof ExtractTextFromDocumentOutputSchema>;

export async function extractTextFromDocument(input: ExtractTextFromDocumentInput): Promise<ExtractTextFromDocumentOutput> {
  return extractTextFromDocumentFlow(input);
}

const extractTextFromDocumentPrompt = ai.definePrompt({
  name: 'extractTextFromDocumentPrompt',
  input: {schema: ExtractTextFromDocumentInputSchema},
  output: {schema: ExtractTextFromDocumentOutputSchema},
  prompt: `Eres un sistema avanzado de OCR y PLN especializado en documentos clínicos.
Tu tarea es extraer todo el texto clínico relevante del documento proporcionado.
Si el documento es una imagen o PDF, realiza OCR para obtener el texto.
Luego, estructura la información de manera clara y concisa.
Prioriza la extracción de información del paciente, síntomas, observaciones, historial médico y cualquier diagnóstico preliminar si está presente.

Documento (MIME Type: {{{mimeType}}}):
{{media url=documentDataUri}}

Devuelve únicamente el texto extraído y estructurado. Si no puedes extraer texto significativo, indica que no se pudo procesar el contenido.`,
});

const extractTextFromDocumentFlow = ai.defineFlow(
  {
    name: 'extractTextFromDocumentFlow',
    inputSchema: ExtractTextFromDocumentInputSchema,
    outputSchema: ExtractTextFromDocumentOutputSchema,
  },
  async (input) => {
    const {output} = await extractTextFromDocumentPrompt(input);
    
    if (!output || !output.extractedText || output.extractedText.trim() === "") {
      // Fallback si el LLM no devuelve nada o el campo está vacío
      return { extractedText: `No se pudo extraer texto del documento (${input.mimeType}). Por favor, verifique el archivo o ingrese el texto manualmente.` };
    }
    return output;
  }
);
