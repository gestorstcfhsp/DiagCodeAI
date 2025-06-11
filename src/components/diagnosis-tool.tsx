"use client";

import { useState } from "react";
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
import { extractClinicalConcepts, type ExtractClinicalConceptsOutput } from "@/ai/flows/extract-clinical-concepts";
import { suggestDiagnoses, type SuggestDiagnosesOutput } from "@/ai/flows/suggest-diagnoses";
import { Loader2, NotebookText, Lightbulb, Stethoscope, AlertCircle } from "lucide-react";
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

  const { toast } = useToast();

  const form = useForm<DiagnosisFormValues>({
    resolver: zodResolver(diagnosisFormSchema),
    defaultValues: {
      clinicalText: "",
      codingSystem: undefined,
    },
  });

  const onSubmit: SubmitHandler<DiagnosisFormValues> = async (data) => {
    setIsLoading(true);
    setError(null);
    setSubmitted(true);
    setExtractedConcepts([]);
    setSuggestedDiagnoses([]);

    try {
      // Parallel execution of AI flows
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
          description: conceptsResult.reason?.message || "Ocurrió un error desconocido.",
        });
      }
      
      if (diagnosesResult.status === 'fulfilled' && diagnosesResult.value) {
        setSuggestedDiagnoses(diagnosesResult.value.diagnoses || []);
      } else if (diagnosesResult.status === 'rejected') {
        console.error("Error sugiriendo diagnósticos:", diagnosesResult.reason);
        setError(`Error al sugerir diagnósticos: ${diagnosesResult.reason?.message || "Error desconocido"}`);
         toast({
          variant: "destructive",
          title: "Error en la Sugerencia de Diagnósticos",
          description: diagnosesResult.reason?.message || "Ocurrió un error desconocido.",
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
          <CardDescription>Ingrese las notas clínicas y seleccione un sistema de codificación.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="clinicalText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas Clínicas</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Pegue o escriba las notas clínicas aquí..."
                        className="min-h-[200px] resize-y rounded-md shadow-sm focus:ring-primary"
                        {...field}
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-md shadow-sm focus:ring-primary">
                          <SelectValue placeholder="Seleccione un sistema de codificación" />
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
              <Button type="submit" disabled={isLoading} className="w-full rounded-md shadow-md hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Obtener Sugerencias IA
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-6">
        {error && (
          <Alert variant="destructive" className="shadow-md rounded-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-headline">Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {(isLoading || (submitted && extractedConcepts.length > 0) || (submitted && !isLoading && extractedConcepts.length === 0 && !error)) && (
           <Card className="shadow-lg rounded-xl">
            <CardHeader>
              <CardTitle className="font-headline text-2xl flex items-center">
                <Lightbulb className="mr-2 h-6 w-6 text-accent" />
                Conceptos Clínicos Extraídos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && <Skeleton className="h-20 w-full rounded-md" />}
              {!isLoading && extractedConcepts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {extractedConcepts.map((concept, index) => (
                    <Badge key={index} variant="secondary" className="text-sm px-3 py-1 rounded-full shadow-sm">{concept}</Badge>
                  ))}
                </div>
              )}
              {!isLoading && submitted && extractedConcepts.length === 0 && !error && (
                <p className="text-muted-foreground">No se extrajeron conceptos clínicos del texto proporcionado.</p>
              )}
            </CardContent>
          </Card>
        )}

        {(isLoading || (submitted && suggestedDiagnoses.length > 0) || (submitted && !isLoading && suggestedDiagnoses.length === 0 && !error )) && (
          <Card className="shadow-lg rounded-xl">
            <CardHeader>
              <CardTitle className="font-headline text-2xl flex items-center">
                <Stethoscope className="mr-2 h-6 w-6 text-primary" />
                Diagnósticos Sugeridos
              </CardTitle>
              {suggestedDiagnoses.length > 0 && <CardDescription>Basado en el sistema de codificación {form.getValues("codingSystem")}.</CardDescription>}
            </CardHeader>
            <CardContent>
              {isLoading && (
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
              {!isLoading && submitted && suggestedDiagnoses.length === 0 && !error && (
                <p className="text-muted-foreground">No se sugirieron diagnósticos para el texto y sistema de codificación proporcionados.</p>
              )}
            </CardContent>
          </Card>
        )}
         {!isLoading && !submitted && (
            <Card className="shadow-lg rounded-xl">
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                        Ingrese notas clínicas y seleccione un sistema de codificación para comenzar.
                    </p>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}
