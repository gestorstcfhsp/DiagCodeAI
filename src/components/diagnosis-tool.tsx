
"use client";

import { useState, useRef, type ChangeEvent } from "react";
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
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label"; // Importar Label base
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { extractClinicalConcepts } from "@/ai/flows/extract-clinical-concepts";
import { suggestDiagnoses, type SuggestDiagnosesOutput } from "@/ai/flows/suggest-diagnoses";
import { extractTextFromDocument } from "@/ai/flows/extract-text-from-document";
import { Loader2, NotebookText, Lightbulb, Stethoscope, AlertCircle, UploadCloud, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const diagnosisFormSchema = z.object({
  clinicalText: z.string().min(20, "El texto clínico debe tener al menos 20 caracteres."),
  codingSystem: z.enum(["CIE-10", "CIE-11", "CIE-O"], {
    required_error: "Por favor, seleccione un sistema de codificación.",
  }),
});

type DiagnosisFormValues = z.infer<typeof diagnosisFormSchema>;

export function DiagnosisTool() {
  const [isLoading, setIsLoading] = useState(false);
  const [extractedConcepts, setExtractedConcepts] = useState<string[]>([]);
  const [suggestedDiagnoses, setSuggestedDiagnoses] = useState<SuggestDiagnosesOutput["diagnoses"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setFileProcessingError(null);
    form.setValue('clinicalText', ''); 

    if (file.type === "text/plain") {
      setIsProcessingFile(true);
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
      setIsProcessingFile(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUri = e.target?.result as string;
        try {
          const result = await extractTextFromDocument({ documentDataUri: dataUri, mimeType: file.type });
          form.setValue("clinicalText", result.extractedText);
          toast({ title: "Documento procesado", description: "El texto extraído ha sido añadido a las notas clínicas." });
        } catch (err: any) {
          console.error("Error procesando documento:", err);
          const message = err.message || "Ocurrió un error al procesar el documento.";
          setFileProcessingError(message);
          toast({ variant: "destructive", title: "Error de Procesamiento de Documento", description: message });
          form.setValue("clinicalText", `Error al procesar el archivo ${file.name}. Detalles: ${message}. Por favor, ingrese el texto manualmente o intente con otro archivo.`);
        } finally {
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
    }
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

  const onSubmit: SubmitHandler<DiagnosisFormValues> = async (data) => {
    setIsLoading(true);
    setError(null);
    setSubmitted(true);
    setExtractedConcepts([]);
    setSuggestedDiagnoses([]);

    try {
      const [conceptsResult, diagnosesResult] = await Promise.allSettled([
        extractClinicalConcepts({ documentText: data.clinicalText }),
        suggestDiagnoses({ clinicalText: data.clinicalText, codingSystem: data.codingSystem })
      ]);

      if (conceptsResult.status === 'fulfilled' && conceptsResult.value) {
        setExtractedConcepts(conceptsResult.value.clinicalConcepts || []);
      } else if (conceptsResult.status === 'rejected') {
        console.error("Error extrayendo conceptos:", conceptsResult.reason);
        toast({
          variant: "destructive",
          title: "Error en la Extracción de Conceptos",
          description: (conceptsResult.reason as Error)?.message || "Ocurrió un error desconocido.",
        });
      }
      
      if (diagnosesResult.status === 'fulfilled' && diagnosesResult.value) {
        setSuggestedDiagnoses(diagnosesResult.value.diagnoses || []);
      } else if (diagnosesResult.status === 'rejected') {
        console.error("Error sugiriendo diagnósticos:", diagnosesResult.reason);
        setError(`Error al sugerir diagnósticos: ${(diagnosesResult.reason as Error)?.message || "Error desconocido"}`);
         toast({
          variant: "destructive",
          title: "Error en la Sugerencia de Diagnósticos",
          description: (diagnosesResult.reason as Error)?.message || "Ocurrió un error desconocido.",
        });
      }

      if (conceptsResult.status === 'rejected' && diagnosesResult.status === 'rejected') {
        setError("Ambas operaciones de IA fallaron. Por favor, revise la consola para más detalles e intente de nuevo.");
      }

    } catch (e: any) {
      console.error("Error durante el procesamiento IA:", e);
      const errorMessage = e.message || "Ocurrió un error inesperado. Por favor, intente de nuevo.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error de Procesamiento",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 shadow-lg rounded-xl">
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
              <Label htmlFor="file-upload-button">Cargar Documento (Opcional)</Label>
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
                <AlertTitle>Error de Archivo</AlertTitle>
                <AlertDescription>{fileProcessingError}</AlertDescription>
              </Alert>
            )}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="clinicalText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas Clínicas (Editable)</FormLabel>
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
                    <FormLabel>Sistema de Codificación</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isProcessingFile || isLoading}>
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
                {isLoading ? 'Procesando IA...' : (isProcessingFile ? 'Procesando Archivo...' : 'Obtener Sugerencias IA')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-6">
        {error && (
          <Alert variant="destructive" className="shadow-md rounded-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-headline">Error de IA</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {(isLoading || (submitted && extractedConcepts.length > 0) || (submitted && !isLoading && extractedConcepts.length === 0 && !error && !isProcessingFile)) && (
           <Card className="shadow-lg rounded-xl">
            <CardHeader>
              <CardTitle className="font-headline text-2xl flex items-center">
                <Lightbulb className="mr-2 h-6 w-6 text-accent" />
                Conceptos Clínicos Extraídos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && !isProcessingFile && <Skeleton className="h-20 w-full rounded-md" />}
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
              {suggestedDiagnoses.length > 0 && <CardDescription>Basado en el sistema de codificación {form.getValues("codingSystem")}.</CardDescription>}
            </CardHeader>
            <CardContent>
              {isLoading && !isProcessingFile && (
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full rounded-md" />
                  <Skeleton className="h-32 w-full rounded-md" />
                </div>
              )}
              {!isLoading && suggestedDiagnoses.length > 0 && (
                <div className="space-y-4">
                  {suggestedDiagnoses.map((diag, index) => (
                    <Card key={index} className="bg-card shadow-md rounded-lg overflow-hidden">
                      <CardHeader className="pb-2">
                        <CardTitle className="font-headline text-xl text-primary">{diag.code}</CardTitle>
                        <CardDescription className="text-base">{diag.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-muted-foreground">Confianza:</span>
                          <Badge 
                            variant={diag.confidence > 0.7 ? "default" : diag.confidence > 0.4 ? "secondary" : "outline"}
                            className="px-2.5 py-0.5 rounded-full text-xs"
                          >
                            {(diag.confidence * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <Progress value={diag.confidence * 100} className="h-2 rounded-full" />
                      </CardContent>
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
         {!isLoading && !submitted && !isProcessingFile && (
            <Card className="shadow-lg rounded-xl">
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                        Ingrese notas clínicas y seleccione un sistema de codificación para comenzar, o cargue un documento.
                    </p>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}

    