
"use client";

import { useState, useRef, type ChangeEvent, useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel as ShadcnFormLabel, 
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label"; 
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { extractClinicalConcepts, type ExtractClinicalConceptsOutput } from "@/ai/flows/extract-clinical-concepts";
import { suggestDiagnoses, type SuggestDiagnosesOutput } from "@/ai/flows/suggest-diagnoses";
import { extractTextFromDocument } from "@/ai/flows/extract-text-from-document";
import { Loader2, NotebookText, Lightbulb, Stethoscope, AlertCircle, UploadCloud, XCircle, ClipboardCopy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { db, type HistoryEntry } from "@/lib/db";
import { HistoryPanel } from "@/components/history-panel";


const diagnosisFormSchema = z.object({
  clinicalText: z.string().min(20, "El texto clínico debe tener al menos 20 caracteres."),
  codingSystem: z.enum(["CIE-10", "CIE-11", "CIE-O"], {
    required_error: "Por favor, seleccione un sistema de codificación.",
  }),
});

type DiagnosisFormValues = z.infer<typeof diagnosisFormSchema>;
type CodingSystemType = DiagnosisFormValues["codingSystem"];

const MAX_RETRY_ATTEMPTS = 2; 
const RETRY_DELAY_MS = 30000; 
const LOCALSTORAGE_CODING_SYSTEM_KEY = 'lastCodingSystem';

function isRetryableError(error: any): boolean {
  if (error instanceof Error && error.message) {
    const lowerCaseMessage = error.message.toLowerCase();
    return lowerCaseMessage.includes("503") || lowerCaseMessage.includes("overloaded") || lowerCaseMessage.includes("service unavailable") || lowerCaseMessage.includes("rate limit");
  }
  return false;
}

export function DiagnosisTool() {
  const [isLoading, setIsLoading] = useState(false);
  const [extractedConcepts, setExtractedConcepts] = useState<string[]>([]);
  const [suggestedDiagnoses, setSuggestedDiagnoses] = useState<SuggestDiagnosesOutput["diagnoses"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showClinicalConcepts, setShowClinicalConcepts] = useState(false);

  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileProcessingError, setFileProcessingError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const form = useForm<DiagnosisFormValues>({
    resolver: zodResolver(diagnosisFormSchema),
    defaultValues: {
      clinicalText: "",
      codingSystem: undefined,
    },
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedCodingSystem = localStorage.getItem(LOCALSTORAGE_CODING_SYSTEM_KEY) as CodingSystemType | null;
      if (storedCodingSystem && ["CIE-10", "CIE-11", "CIE-O"].includes(storedCodingSystem)) {
        form.setValue('codingSystem', storedCodingSystem);
      }
    }
  }, [form]);

  const processFileForClinicalNotes = async (file: File, attempt: number) => {
    setIsProcessingFile(true);
    setFileProcessingError(null);

    if (attempt > 1) {
      toast({ title: "Reintentando Procesamiento de Archivo", description: `Intentando procesar el archivo de nuevo (intento ${attempt} de ${MAX_RETRY_ATTEMPTS})...`, duration: RETRY_DELAY_MS - 2000 });
    }

    if (file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const textContent = e.target?.result as string;
        form.setValue("clinicalText", textContent);
        toast({ title: "Archivo de texto cargado", description: "El contenido ha sido añadido a las notas clínicas." });
        setIsProcessingFile(false);
      };
      reader.onerror = () => {
        setFileProcessingError("Error al leer el archivo de texto.");
        toast({ variant: "destructive", title: "Error de archivo", description: "No se pudo leer el archivo TXT." });
        setIsProcessingFile(false);
      }
      reader.readAsText(file);
    } else if (file.type.startsWith("image/") || file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUri = e.target?.result as string;
        try {
          const result = await extractTextFromDocument({ documentDataUri: dataUri, mimeType: file.type });
          form.setValue("clinicalText", result.extractedText);
          toast({ title: "Documento procesado", description: "El texto extraído ha sido añadido a las notas clínicas." });
          setIsProcessingFile(false);
        } catch (err: any) {
          console.error(`Error procesando documento (intento ${attempt}):`, err);
          if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
            toast({
              variant: "default",
              title: "Problema de Servicio IA (Procesamiento Archivo)",
              description: `El servicio está ocupado o limitado. Se reintentará en ${RETRY_DELAY_MS / 1000} segundos...`,
              duration: RETRY_DELAY_MS,
            });
            setTimeout(() => processFileForClinicalNotes(file, attempt + 1), RETRY_DELAY_MS);
            return; 
          }
          
          let userMessage = "Ocurrió un error al procesar el documento. Por favor, intente de nuevo.";
           if (err.message && typeof err.message === 'string') {
            if (isRetryableError(err)) {
              userMessage = `El servicio de IA para procesar archivos está sobrecargado/limitado (intento ${attempt} de ${MAX_RETRY_ATTEMPTS} fallido). Por favor, intente de nuevo más tarde.`;
            } else if (err.message.includes("[GoogleGenerativeAI Error]") || err.message.toLowerCase().includes("error fetching from")) {
               userMessage = "Hubo un problema de comunicación con el servicio de IA al procesar el archivo. Verifique su conexión o intente más tarde.";
            } else {
               userMessage = "No se pudo procesar el documento. Intente con otro archivo o ingrese el texto manualmente.";
            }
          }
          setFileProcessingError(userMessage);
          toast({ variant: "destructive", title: "Error de Procesamiento de Documento", description: userMessage });
          form.setValue("clinicalText", `Error al procesar el archivo ${file.name}. Detalles: ${userMessage}. Por favor, ingrese el texto manualmente o intente con otro archivo.`);
          setIsProcessingFile(false);
        }
      };
      reader.onerror = () => {
        setFileProcessingError("Error al leer el archivo para convertirlo a data URI.");
        toast({ variant: "destructive", title: "Error de archivo", description: "No se pudo leer el archivo." });
        setIsProcessingFile(false);
      }
      reader.readAsDataURL(file);
    } else {
      setFileProcessingError("Tipo de archivo no soportado. Por favor, suba imágenes, PDF o TXT.");
      toast({ variant: "destructive", title: "Archivo no soportado", description: "Solo se admiten archivos de imagen, PDF o TXT." });
      setUploadedFileName(null);
      setIsProcessingFile(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    form.setValue('clinicalText', ''); 
        
    await processFileForClinicalNotes(file, 1);

    if (fileInputRef.current) {
      fileInputRef.current.value = ""; 
    }
  };
  
  const handleClearFile = () => {
    setUploadedFileName(null);
    form.setValue("clinicalText", "");
    setFileProcessingError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast({ title: "Entrada de archivo limpiada", description: "Puede ingresar texto manualmente o cargar un nuevo archivo." });
  };

  const handleCopyClinicalNotes = async () => {
    const clinicalTextToCopy = form.getValues("clinicalText");
    if (!clinicalTextToCopy) {
      toast({ variant: "destructive", title: "Nada que copiar", description: "El campo de notas clínicas está vacío." });
      return;
    }
    try {
      await navigator.clipboard.writeText(clinicalTextToCopy);
      toast({ title: "¡Texto copiado!", description: "Las notas clínicas han sido copiadas al portapapeles." });
    } catch (err) {
      console.error("Error al copiar texto: ", err);
      toast({ variant: "destructive", title: "Error al copiar", description: "No se pudo copiar el texto al portapapeles." });
    }
  };

  const handleLoadFromHistory = (entry: HistoryEntry) => {
    form.setValue("clinicalText", entry.clinicalText);
    form.setValue("codingSystem", entry.codingSystem);
    setUploadedFileName(entry.fileName || null);
    setExtractedConcepts(entry.extractedConcepts);
    setSuggestedDiagnoses(entry.suggestedDiagnoses);
    setSubmitted(true);
    setError(null);
    setShowClinicalConcepts(entry.extractedConcepts.length > 0); 
    toast({ title: "Historial Cargado", description: "Los datos de la entrada del historial se han cargado en el formulario." });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  let conceptsResult: PromiseSettledResult<ExtractClinicalConceptsOutput> | undefined;
  let diagnosesResult: PromiseSettledResult<SuggestDiagnosesOutput> | undefined;

  const onSubmit: SubmitHandler<DiagnosisFormValues> = async (data, attempt = 1) => {
    setIsLoading(true);
    setError(null);
    if (attempt === 1) { 
      setSubmitted(true);
      setExtractedConcepts([]);
      setSuggestedDiagnoses([]);
    }
    
    if (attempt > 1) {
      toast({ title: "Reintentando Sugerencias IA", description: `Intentando obtener sugerencias de nuevo (intento ${attempt} de ${MAX_RETRY_ATTEMPTS})...`, duration: RETRY_DELAY_MS - 2000});
    }

    let currentExtractedConcepts: string[] = [];
    let currentSuggestedDiagnoses: SuggestDiagnosesOutput['diagnoses'] = [];

    try {
      [conceptsResult, diagnosesResult] = await Promise.allSettled([
        extractClinicalConcepts({ documentText: data.clinicalText }),
        suggestDiagnoses({ clinicalText: data.clinicalText, codingSystem: data.codingSystem })
      ]);

      let needsRetry = false;
      
      if (conceptsResult.status === 'rejected' && isRetryableError(conceptsResult.reason)) {
        needsRetry = true;
        console.error("Error reintentable extrayendo conceptos:", conceptsResult.reason);
      }
      if (diagnosesResult.status === 'rejected' && isRetryableError(diagnosesResult.reason)) {
        needsRetry = true;
        console.error("Error reintentable sugiriendo diagnósticos:", diagnosesResult.reason);
      }

      if (needsRetry && attempt < MAX_RETRY_ATTEMPTS) {
        toast({
          variant: "default",
          title: "Problema de Servicio IA (Sugerencias)",
          description: `El servicio está ocupado o limitado. Se reintentará en ${RETRY_DELAY_MS / 1000} segundos...`,
          duration: RETRY_DELAY_MS,
        });
        setTimeout(() => {
          onSubmit(data, attempt + 1);
        }, RETRY_DELAY_MS);
        return; 
      }

      if (conceptsResult.status === 'fulfilled' && conceptsResult.value) {
        currentExtractedConcepts = conceptsResult.value.clinicalConcepts || [];
        setExtractedConcepts(currentExtractedConcepts);
      } else if (conceptsResult.status === 'rejected') {
        console.error("Error extrayendo conceptos:", conceptsResult.reason);
        let conceptErrorMessage = "Ocurrió un error desconocido al extraer conceptos.";
        if (conceptsResult.reason instanceof Error && conceptsResult.reason.message) {
           if (isRetryableError(conceptsResult.reason)) {
                conceptErrorMessage = `El servicio de IA para extraer conceptos está sobrecargado/limitado (intento ${attempt} de ${MAX_RETRY_ATTEMPTS} fallido). Intente más tarde.`;
            } else if (conceptsResult.reason.message.includes("[GoogleGenerativeAI Error]") || conceptsResult.reason.message.toLowerCase().includes("error fetching from")) {
                conceptErrorMessage = "Problema de comunicación al extraer conceptos con IA. Intente más tarde.";
            } else {
                conceptErrorMessage = `Error al extraer conceptos: ${conceptsResult.reason.message}`;
            }
        }
        toast({
          variant: "destructive",
          title: "Error en la Extracción de Conceptos",
          description: conceptErrorMessage,
        });
      }
      
      if (diagnosesResult.status === 'fulfilled' && diagnosesResult.value) {
        currentSuggestedDiagnoses = diagnosesResult.value.diagnoses || [];
        setSuggestedDiagnoses(currentSuggestedDiagnoses);
      } else if (diagnosesResult.status === 'rejected') {
        console.error("Error sugiriendo diagnósticos:", diagnosesResult.reason);
        let diagnoseErrorMessage = "Ocurrió un error desconocido al sugerir diagnósticos.";
         if (diagnosesResult.reason instanceof Error && diagnosesResult.reason.message) {
            if (isRetryableError(diagnosesResult.reason)) {
                diagnoseErrorMessage = `El servicio de IA para sugerir diagnósticos está sobrecargado/limitado (intento ${attempt} de ${MAX_RETRY_ATTEMPTS} fallido). Intente más tarde.`;
            } else if (diagnosesResult.reason.message.includes("[GoogleGenerativeAI Error]") || diagnosesResult.reason.message.toLowerCase().includes("error fetching from")) {
                diagnoseErrorMessage = "Problema de comunicación al sugerir diagnósticos con IA. Intente más tarde.";
            } else {
                 diagnoseErrorMessage = `Error al sugerir diagnósticos: ${diagnosesResult.reason.message}`;
            }
        }
        if (!error) setError(`Error al sugerir diagnósticos: ${diagnoseErrorMessage}`); 
         toast({
          variant: "destructive",
          title: "Error en la Sugerencia de Diagnósticos",
          description: diagnoseErrorMessage,
        });
      }

      if (conceptsResult.status === 'rejected' && diagnosesResult.status === 'rejected' && !needsRetry) {
        setError("Ambas operaciones de IA (conceptos y diagnósticos) fallaron. Por favor, revise la consola para más detalles e intente de nuevo.");
      } else if ((conceptsResult.status === 'rejected' && !isRetryableError(conceptsResult.reason)) || (diagnosesResult.status === 'rejected' && !isRetryableError(diagnosesResult.reason))) {
        if (!error && (conceptsResult.status === 'rejected' || diagnosesResult.status === 'rejected')) {
          setError("Una o más operaciones de IA fallaron. Por favor, revise los mensajes de error individuales.");
        }
      }

      if (!needsRetry && conceptsResult.status === 'fulfilled' && diagnosesResult.status === 'fulfilled') {
        try {
          const historyEntry: HistoryEntry = {
            timestamp: Date.now(),
            clinicalText: data.clinicalText,
            codingSystem: data.codingSystem,
            extractedConcepts: currentExtractedConcepts,
            suggestedDiagnoses: currentSuggestedDiagnoses,
            fileName: uploadedFileName,
          };
          await db.history.add(historyEntry);
          toast({ title: "Guardado en Historial", description: "Los resultados de este análisis se han guardado en el historial."});
        } catch (dbError) {
          console.error("Error saving to history:", dbError);
          toast({ variant: "destructive", title: "Error de Historial", description: "No se pudo guardar el análisis en el historial."});
        }
      }


    } catch (e: any) { 
      console.error(`Error durante el procesamiento IA (intento ${attempt}):`, e);
      let generalErrorMessage = "Ocurrió un error inesperado durante el procesamiento con IA. Por favor, intente de nuevo.";
      if (isRetryableError(e) && attempt < MAX_RETRY_ATTEMPTS) {
        toast({
          variant: "default",
          title: "Problema General de Servicio IA",
          description: `El servicio está experimentando problemas. Se reintentará en ${RETRY_DELAY_MS / 1000} segundos...`,
          duration: RETRY_DELAY_MS,
        });
        setTimeout(() => {
           onSubmit(data, attempt + 1);
        }, RETRY_DELAY_MS);
        return;
      }

      if (e.message && typeof e.message === 'string') {
        if (isRetryableError(e)) {
          generalErrorMessage = `Uno de los servicios de IA está sobrecargado/limitado (intento ${attempt} de ${MAX_RETRY_ATTEMPTS} fallido). Por favor, intente de nuevo más tarde.`;
        } else if (e.message.includes("[GoogleGenerativeAI Error]") || e.message.toLowerCase().includes("error fetching from")) {
           generalErrorMessage = "Hubo un problema de comunicación general con los servicios de IA. Verifique su conexión o intente más tarde.";
        } else {
           generalErrorMessage = e.message;
        }
      }
      setError(generalErrorMessage);
      toast({
        variant: "destructive",
        title: "Error de Procesamiento IA",
        description: generalErrorMessage,
      });
    } finally {
      const isAnyOperationStillRetrying = (
        ( (conceptsResult?.status === 'rejected' && isRetryableError(conceptsResult.reason)) || 
          (diagnosesResult?.status === 'rejected' && isRetryableError(diagnosesResult.reason)) 
        ) && attempt < MAX_RETRY_ATTEMPTS
      );
      
      if (!isAnyOperationStillRetrying) {
          setIsLoading(false);
      }
    }
  };

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6">
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center">
            <NotebookText className="mr-2 h-6 w-6 text-primary" />
            Entrada Clínica
          </CardTitle>
          <CardDescription>Ingrese o cargue notas clínicas y seleccione un sistema de codificación.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 mb-6">
            <div>
              <Label htmlFor="file-upload-input">Cargar Documento (Opcional)</Label>
              <div className="flex items-center space-x-2 mt-1">
                <Button id="file-upload-button" type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isProcessingFile} className="flex-grow justify-start text-left">
                  {isProcessingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {isProcessingFile ? 'Procesando...' : (uploadedFileName ? 'Cambiar archivo' : 'Seleccionar archivo...')}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,application/pdf,.txt"
                  className="hidden"
                  disabled={isProcessingFile}
                  id="file-upload-input" 
                />
              </div>
            </div>
            {uploadedFileName && (
              <div className="mt-2 flex items-center justify-between p-2 border rounded-md bg-secondary/50">
                <span className="text-sm truncate" title={uploadedFileName}>{uploadedFileName}</span>
                <Button variant="ghost" size="icon" onClick={handleClearFile} disabled={isProcessingFile} className="h-7 w-7">
                  <XCircle className="h-4 w-4" />
                  <span className="sr-only">Quitar archivo</span>
                </Button>
              </div>
            )}
            {fileProcessingError && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error de Archivo o Procesamiento</AlertTitle>
                <AlertDescription>{fileProcessingError}</AlertDescription>
              </Alert>
            )}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => onSubmit(data, 1))} className="space-y-6">
              <FormField
                control={form.control}
                name="clinicalText"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between items-center">
                      <ShadcnFormLabel>Notas Clínicas (Editable)</ShadcnFormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={handleCopyClinicalNotes}
                            disabled={isProcessingFile || !form.getValues("clinicalText")}
                            className="h-7 w-7"
                          >
                            <ClipboardCopy className="h-4 w-4" />
                            <span className="sr-only">Copiar Notas Clínicas</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Copiar Notas Clínicas</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Pegue, escriba las notas clínicas o cárguelas desde un archivo..."
                        className="min-h-[200px] resize-y rounded-md shadow-sm focus:ring-primary"
                        {...field}
                        disabled={isProcessingFile}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="codingSystem"
                render={({ field }) => (
                  <FormItem>
                    <ShadcnFormLabel>Sistema de Codificación</ShadcnFormLabel>
                    <Select 
                      onValueChange={(value: CodingSystemType) => {
                        field.onChange(value);
                        if (typeof window !== 'undefined') {
                          localStorage.setItem(LOCALSTORAGE_CODING_SYSTEM_KEY, value);
                        }
                      }} 
                      value={field.value} 
                      disabled={isProcessingFile || isLoading}
                    >
                      <FormControl>
                        <SelectTrigger className="rounded-md shadow-sm focus:ring-primary">
                          <SelectValue placeholder="Seleccione un sistema" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CIE-10">CIE-10</SelectItem>
                        <SelectItem value="CIE-11">CIE-11</SelectItem>
                        <SelectItem value="CIE-O">CIE-O (Oncología)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading || isProcessingFile} className="w-full rounded-md shadow-md hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2">
                {(isLoading || isProcessingFile) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? (form.formState.isSubmitting ? 'Procesando IA...' : 'Reintentando IA...') : (isProcessingFile ? 'Procesando Archivo...' : 'Obtener Sugerencias IA')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {error && !isLoading && !isProcessingFile && ( 
          <Alert variant="destructive" className="shadow-md rounded-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-headline">Error de IA</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {submitted && !isLoading && !isProcessingFile && !error && (
          <div className="flex items-center space-x-2 p-4 bg-card shadow-lg rounded-xl border">
            <Switch
              id="show-concepts-switch"
              checked={showClinicalConcepts}
              onCheckedChange={setShowClinicalConcepts}
            />
            <Label htmlFor="show-concepts-switch" className="text-sm font-medium">
              Mostrar Conceptos Clínicos Extraídos
            </Label>
          </div>
        )}
        
        {showClinicalConcepts && ((isLoading && !isProcessingFile && !error) || (submitted && !isLoading && !isProcessingFile && !error)) && (
           <Card className="shadow-lg rounded-xl">
            <CardHeader>
              <CardTitle className="font-headline text-2xl flex items-center">
                <Lightbulb className="mr-2 h-6 w-6 text-accent" />
                Conceptos Clínicos Extraídos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && !isProcessingFile && !error && <Skeleton className="h-20 w-full rounded-md" />}
              {!isLoading && extractedConcepts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {extractedConcepts.map((concept, index) => (
                    <Badge key={index} variant="secondary" className="text-sm px-3 py-1 rounded-full shadow-sm">{concept}</Badge>
                  ))}
                </div>
              )}
              {!isLoading && submitted && extractedConcepts.length === 0 && !error && !isProcessingFile && (
                <p className="text-muted-foreground">No se extrajeron conceptos clínicos del texto proporcionado.</p>
              )}
            </CardContent>
          </Card>
        )}

        {(isLoading || (submitted && suggestedDiagnoses.length > 0) || (submitted && !isLoading && suggestedDiagnoses.length === 0 && !error && !isProcessingFile)) && (
          <Card className="shadow-lg rounded-xl">
            <CardHeader>
              <CardTitle className="font-headline text-2xl flex items-center">
                <Stethoscope className="mr-2 h-6 w-6 text-primary" />
                Diagnósticos Sugeridos
              </CardTitle>
              {suggestedDiagnoses.length > 0 && !isLoading && <CardDescription>Basado en el sistema de codificación {form.getValues("codingSystem")}.</CardDescription>}
            </CardHeader>
            <CardContent>
              {isLoading && !isProcessingFile && !error && (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
                </div>
              )}
              {!isLoading && suggestedDiagnoses.length > 0 && (
                <div className="space-y-2">
                  {suggestedDiagnoses.map((diag, index) => (
                    <Card key={index} className="bg-card shadow-sm rounded-lg overflow-hidden p-3">
                       <div className="flex justify-between items-center w-full">
                        <div className="flex items-baseline overflow-hidden min-w-0 mr-2">
                          <span className="font-medium text-sm text-primary mr-2 shrink-0">{diag.code}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm text-card-foreground truncate" title={diag.description}>{diag.description}</p>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start">
                              <p>{diag.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Badge
                          variant={diag.confidence > 0.7 ? "default" : diag.confidence > 0.4 ? "secondary" : "outline"}
                          className="text-xs px-2 py-0.5 ml-auto shrink-0 whitespace-nowrap"
                        >
                          {(diag.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              {!isLoading && submitted && suggestedDiagnoses.length === 0 && !error && !isProcessingFile && (
                <p className="text-muted-foreground">No se sugirieron diagnósticos para el texto y sistema de codificación proporcionados.</p>
              )}
            </CardContent>
          </Card>
        )}
         {!isLoading && !submitted && !isProcessingFile && !error && (
            <Card className="shadow-lg rounded-xl">
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                        Ingrese notas clínicas y seleccione un sistema de codificación para comenzar, o cargue un documento.
                    </p>
                </CardContent>
            </Card>
        )}
      </div>
      <HistoryPanel onLoadHistory={handleLoadFromHistory} />
    </div>
    </TooltipProvider>
  );
}
