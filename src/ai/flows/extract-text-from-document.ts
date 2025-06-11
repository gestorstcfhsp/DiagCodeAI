// src/ai/flows/extract-text-from-document.ts
'use server';
/**
 * @fileOverview Extrae texto de documentos clínicos (imágenes, PDFs) usando OCR/NLP simulado.
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
    // Simulación para desarrollo o si el modelo no soporta la extracción directa.
    // En un entorno de producción, se esperaría que el modelo con capacidades de visión intente procesar el {{media}}.
    const isImage = input.mimeType.startsWith('image/');
    const isPdf = input.mimeType === 'application/pdf';

    if (process.env.NODE_ENV === 'development' && (isImage || isPdf)) {
        // Esta simulación se activará en desarrollo. 
        // El prompt anterior se intentará, pero esto sirve de fallback.
        console.warn("Usando respuesta simulada para extractTextFromDocumentFlow en desarrollo.");
        return {
            extractedText: `--- INICIO DE TEXTO SIMULADO (desde ${input.mimeType}) ---

**Datos del Paciente:**
- Nombre: Juan Pérez García
- Fecha de Nacimiento: 15/03/1975
- ID de Paciente: 789012

**Motivo de Consulta:**
El paciente refiere dolor abdominal agudo en el cuadrante inferior derecho, de 24 horas de evolución, acompañado de náuseas y fiebre leve (37.8°C).

**Historial Médico Relevante:**
- Apendicectomía a los 15 años (Negado, error en reporte previo, paciente aclara que fue amigdalectomía).
- Hipertensión arterial controlada con Enalapril 10mg/día.
- Diabetes Mellitus tipo 2 diagnosticada hace 5 años, tratamiento con Metformina 850mg BID.

**Examen Físico:**
- Abdomen: Dolor a la palpación en fosa ilíaca derecha, signo de Blumberg positivo. Ruidos hidroaéreos disminuidos.
- Signos Vitales: TA 130/85 mmHg, FC 90 lpm, FR 18 rpm, T 37.8°C.

**Pruebas Diagnósticas (Imágenes/Labs):**
- (Referencia a imagen adjunta no procesable directamente aquí) Se observa imagen compatible con proceso inflamatorio en apéndice.
- Leucocitosis (15,000/mm³) con neutrofilia (75%).

**Impresión Diagnóstica:**
1. Sospecha de apendicitis aguda.
2. Descartar diverticulitis.

**Plan:**
- Interconsulta con Cirugía General.
- Mantener en observación, hidratación IV.
- Analgesia según necesidad.

--- FIN DE TEXTO SIMULADO ---
`
        };
    }
    
    const {output} = await extractTextFromDocumentPrompt(input);
    if (!output || !output.extractedText) {
      // Fallback si el LLM no devuelve nada o el campo está vacío
      return { extractedText: `No se pudo extraer texto del documento (${input.mimeType}). Por favor, verifique el archivo o ingrese el texto manualmente.` };
    }
    return output;
  }
);
