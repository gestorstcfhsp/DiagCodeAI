// src/ai/flows/summarize-extensive-document.ts
'use server';
/**
 * @fileOverview Procesa documentos clínicos extensos, extrayendo información relevante y omitiendo redundancias.
 *
 * - summarizeExtensiveDocument - Función para procesar y condensar un documento extenso.
 * - SummarizeExtensiveDocumentInput - Tipo de entrada para la función.
 * - SummarizeExtensiveDocumentOutput - Tipo de salida para la función.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeExtensiveDocumentInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "El documento clínico extenso (imagen o PDF) como un data URI que debe incluir un tipo MIME y usar codificación Base64. Formato esperado: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  mimeType: z.string().describe("El tipo MIME del documento, ej: 'image/png', 'application/pdf'."),
});
export type SummarizeExtensiveDocumentInput = z.infer<typeof SummarizeExtensiveDocumentInputSchema>;

const SummarizeExtensiveDocumentOutputSchema = z.object({
  processedClinicalNotes: z.string().describe('Las notas clínicas procesadas, condensadas y sin información duplicada.'),
});
export type SummarizeExtensiveDocumentOutput = z.infer<typeof SummarizeExtensiveDocumentOutputSchema>;

export async function summarizeExtensiveDocument(input: SummarizeExtensiveDocumentInput): Promise<SummarizeExtensiveDocumentOutput> {
  return summarizeExtensiveDocumentFlow(input);
}

const summarizeExtensiveDocumentPrompt = ai.definePrompt({
  name: 'summarizeExtensiveDocumentPrompt',
  input: {schema: SummarizeExtensiveDocumentInputSchema},
  output: {schema: SummarizeExtensiveDocumentOutputSchema},
  prompt: `Eres un asistente de IA altamente especializado en el análisis y procesamiento de documentos clínicos extensos, como historias de hospitalización o seguimientos prolongados, que a menudo contienen información repetitiva.
Tu tarea es analizar el siguiente documento clínico proporcionado. Si es una imagen o PDF, primero realiza un OCR para extraer todo el texto.
Una vez obtenido el texto, tu objetivo principal es condensarlo extrayendo únicamente la información clínicamente relevante, significativa y no duplicada. Debes identificar y omitir secciones, frases o datos que se repiten textualmente o que aportan la misma información ya presentada anteriormente en el documento.
El resultado final debe ser un conjunto de "Notas Clínicas" concisas y bien estructuradas que capturen la evolución del paciente, los hallazgos clave, cambios en el tratamiento o condición, y cualquier otra información vital, pero eliminando toda redundancia.
Adapta el lenguaje para que sea claro para un profesional médico.

Documento (MIME Type: {{{mimeType}}}):
{{media url=documentDataUri}}

Devuelve únicamente el texto procesado y condensado como 'processedClinicalNotes'. Si no puedes extraer texto significativo o el documento está vacío, indica que no se pudo procesar el contenido en 'processedClinicalNotes'.`,
});

const summarizeExtensiveDocumentFlow = ai.defineFlow(
  {
    name: 'summarizeExtensiveDocumentFlow',
    inputSchema: SummarizeExtensiveDocumentInputSchema,
    outputSchema: SummarizeExtensiveDocumentOutputSchema,
  },
  async (input) => {
    const {output} = await summarizeExtensiveDocumentPrompt(input);
    
    if (!output || !output.processedClinicalNotes || output.processedClinicalNotes.trim() === "") {
      return { processedClinicalNotes: `No se pudo extraer o procesar texto relevante del documento extenso (${input.mimeType}) usando el método de documento extenso. Por favor, verifique el archivo o ingrese el texto manualmente.` };
    }
    return output;
  }
);
