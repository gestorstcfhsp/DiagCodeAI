
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { extractClinicalConcepts, type ExtractClinicalConceptsOutput } from "@/ai/flows/extract-clinical-concepts";
import { suggestDiagnoses, type SuggestDiagnosesOutput } from "@/ai/flows/suggest-diagnoses";
import { extractTextFromDocument } from "@/ai/flows/extract-text-from-document";
import { summarizeExtensiveDocument } from "@/ai/flows/summarize-extensive-document";
import { summarizeClinicalNotes, type SummarizeClinicalNotesOutput } from "@/ai/flows/summarize-clinical-notes";
import { Loader2, NotebookText, Lightbulb, Stethoscope, AlertCircle, UploadCloud, XCircle, ClipboardCopy, Star, Save, Trash2, GripVertical, FileTextIcon, FileClockIcon, ScrollText, BookText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { db, type HistoryEntry, type UIDiagnosis } from "@/lib/db";
import { HistoryPanel } from "@/components/history-panel";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';


const diagnosisFormSchema = z.object({
  clinicalText: z.string().min(20, "El texto clínico debe tener al menos 20 caracteres."),
  codingSystem: z.enum(["CIE-10", "CIE-11", "CIE-O"], {
    required_error: "Por favor, seleccione un sistema de codificación.",
  }),
});

type DiagnosisFormValues = z.infer<typeof diagnosisFormSchema>;
type CodingSystemType = DiagnosisFormValues["codingSystem"];
type UploadMethodType = "normal" | "extensive";

const FILE_PROCESSING_RETRY_DELAYS_MS = [2000, 3000, 15000]; 
const MAX_FILE_PROCESSING_ATTEMPTS = FILE_PROCESSING_RETRY_DELAYS_MS.length + 1; 

const AI_SUGGESTION_RETRY_DELAYS_MS = [2000, 3000, 15000]; 
const MAX_AI_SUGGESTION_ATTEMPTS = AI_SUGGESTION_RETRY_DELAYS_MS.length + 1; 

const LOCALSTORAGE_CODING_SYSTEM_KEY = 'lastCodingSystem';
const LOCALSTORAGE_UPLOAD_METHOD_KEY = 'lastUploadMethod';

function isRetryableError(error: any): boolean {
  if (error instanceof Error && error.message) {
    const lowerCaseMessage = error.message.toLowerCase();
    return lowerCaseMessage.includes("503") || lowerCaseMessage.includes("overloaded") || lowerCaseMessage.includes("service unavailable") || lowerCaseMessage.includes("rate limit");
  }
  return false;
}

interface SortableDiagnosisItemProps {
  diagnosis: UIDiagnosis;
  onSetPrincipal: (id: string) => void;
  onToggleSelected: (id: string) => void;
}

function SortableDiagnosisItem({ diagnosis, onSetPrincipal, onToggleSelected }: SortableDiagnosisItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: diagnosis.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`bg-card shadow-sm rounded-lg overflow-hidden p-3 ${diagnosis.isPrincipal ? 'border-primary border-2' : ''} ${isDragging ? 'opacity-75 shadow-xl' : ''}`}
    >
       <div className="flex items-center space-x-2 w-full">
        <Button variant="ghost" size="icon" {...attributes} {...listeners} className="cursor-grab h-7 w-7 text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
          <span className="sr-only">Arrastrar para reordenar</span>
        </Button>
        <Checkbox
            id={`select-${diagnosis.id}`}
            checked={!!diagnosis.isSelected}
            onCheckedChange={() => onToggleSelected(diagnosis.id)}
            aria-label={`Seleccionar diagnóstico ${diagnosis.code}`}
        />
        <Button
            variant="ghost"
            size="icon"
            onClick={() => onSetPrincipal(diagnosis.id)}
            className={`h-7 w-7 ${diagnosis.isPrincipal ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
            aria-label="Marcar como principal"
        >
            <Star className={`h-4 w-4 ${diagnosis.isPrincipal ? 'fill-current' : ''}`} />
        </Button>
        <div className="flex-1 flex items-baseline overflow-hidden min-w-0 mr-2">
          <span className="font-medium text-sm text-primary mr-2 shrink-0">{diagnosis.code}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm text-card-foreground truncate" title={diagnosis.description}>{diagnosis.description}</p>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              <p>{diagnosis.description}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <Badge
          variant={diagnosis.confidence > 0.7 ? "default" : diagnosis.confidence > 0.4 ? "secondary" : "outline"}
          className="text-xs px-2 py-0.5 ml-auto shrink-0 whitespace-nowrap"
        >
          {(diagnosis.confidence * 100).toFixed(0)}%
        </Badge>
      </div>
    </Card>
  );
}


export function DiagnosisTool() {
  const [isLoading, setIsLoading] = useState(false);
  const [extractedConcepts, setExtractedConcepts] = useState<string[]>([]);
  const [suggestedDiagnoses, setSuggestedDiagnoses] = useState<UIDiagnosis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showClinicalConcepts, setShowClinicalConcepts] = useState(false);

  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileProcessingError, setFileProcessingError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadMethod, setUploadMethod] = useState<UploadMethodType>("normal");

  const [clinicalSummary, setClinicalSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);


  const { toast } = useToast();

  const form = useForm<DiagnosisFormValues>({
    resolver: zodResolver(diagnosisFormSchema),
    defaultValues: {
      clinicalText: "",
      codingSystem: "CIE-10",
    },
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedCodingSystem = localStorage.getItem(LOCALSTORAGE_CODING_SYSTEM_KEY) as CodingSystemType | null;
      if (storedCodingSystem && ["CIE-10", "CIE-11", "CIE-O"].includes(storedCodingSystem)) {
        form.setValue('codingSystem', storedCodingSystem);
      } else {
        form.setValue('codingSystem', 'CIE-10');
        localStorage.setItem(LOCALSTORAGE_CODING_SYSTEM_KEY, 'CIE-10');
      }

      const storedUploadMethod = localStorage.getItem(LOCALSTORAGE_UPLOAD_METHOD_KEY) as UploadMethodType | null;
      if (storedUploadMethod && ["normal", "extensive"].includes(storedUploadMethod)) {
        setUploadMethod(storedUploadMethod);
      } else {
        setUploadMethod("normal");
        localStorage.setItem(LOCALSTORAGE_UPLOAD_METHOD_KEY, "normal");
      }
    }
  }, [form]);

  const processFileForClinicalNotes = async (file: File, currentAttempt: number) => {
    setIsProcessingFile(true);
    setFileProcessingError(null);

    const processingMethodDescription = uploadMethod === 'extensive' ? 'usando método para documentos extensos' : 'usando método normal';
    toast({ 
      title: "Procesando Archivo...", 
      description: `Procesando "${file.name}" ${processingMethodDescription} (intento ${currentAttempt} de ${MAX_FILE_PROCESSING_ATTEMPTS})...`, 
      duration: 5000 
    });

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
          let resultText = "";
          if (uploadMethod === 'extensive') {
            const result = await summarizeExtensiveDocument({ documentDataUri: dataUri, mimeType: file.type });
            resultText = result.processedClinicalNotes;
            toast({ title: "Documento extenso procesado", description: "El texto condensado ha sido añadido a las notas clínicas." });
          } else {
            const result = await extractTextFromDocument({ documentDataUri: dataUri, mimeType: file.type });
            resultText = result.extractedText;
            toast({ title: "Documento procesado (normal)", description: "El texto extraído ha sido añadido a las notas clínicas." });
          }
          form.setValue("clinicalText", resultText);
          setIsProcessingFile(false);
        } catch (err: any) {
          console.error(`Error procesando documento con método ${uploadMethod} (intento ${currentAttempt}):`, err);
          if (isRetryableError(err) && currentAttempt < MAX_FILE_PROCESSING_ATTEMPTS) {
            const nextDelay = FILE_PROCESSING_RETRY_DELAYS_MS[currentAttempt - 1];
            toast({
              variant: "default",
              title: `Problema de Servicio IA (${uploadMethod === 'extensive' ? 'Extenso' : 'Normal'})`,
              description: `El servicio está ocupado o limitado. Se reintentará en ${nextDelay / 1000} segundos... (Próximo intento: ${currentAttempt + 1} de ${MAX_FILE_PROCESSING_ATTEMPTS})`,
              duration: nextDelay,
            });
            setTimeout(() => processFileForClinicalNotes(file, currentAttempt + 1), nextDelay);
            return;
          }

          let userMessage = `Ocurrió un error al procesar el documento con el método ${uploadMethod === 'extensive' ? 'extenso' : 'normal'}. Por favor, intente de nuevo.`;
           if (err.message && typeof err.message === 'string') {
            if (isRetryableError(err)) {
              userMessage = `El servicio de IA para procesar archivos (${uploadMethod === 'extensive' ? 'extenso' : 'normal'}) está sobrecargado/limitado (todos los ${MAX_FILE_PROCESSING_ATTEMPTS} intentos fallaron). Por favor, intente de nuevo más tarde.`;
            } else if (err.message.includes("[GoogleGenerativeAI Error]") || err.message.toLowerCase().includes("error fetching from")) {
               userMessage = `Hubo un problema de comunicación con el servicio de IA al procesar el archivo (${uploadMethod === 'extensive' ? 'extenso' : 'normal'}). Verifique su conexión o intente más tarde.`;
            } else {
               userMessage = `No se pudo procesar el documento (${uploadMethod === 'extensive' ? 'extenso' : 'normal'}). Intente con otro archivo o ingrese el texto manualmente.`;
            }
          }
          setFileProcessingError(userMessage);
          toast({ variant: "destructive", title: `Error de Procesamiento (${uploadMethod === 'extensive' ? 'Extenso' : 'Normal'})`, description: userMessage });
          form.setValue("clinicalText", `Error al procesar el archivo ${file.name} con el método ${uploadMethod === 'extensive' ? 'extenso' : 'normal'}. Detalles: ${userMessage}. Por favor, ingrese el texto manualmente o intente con otro archivo.`);
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
    form.setValue('clinicalText', ''); // Clear text only when a new file is selected

    // Do not clear other results here, let user decide or clear via specific buttons/actions
    // setExtractedConcepts([]);
    // setSuggestedDiagnoses([]);
    // setError(null);
    // setSubmitted(false); // This might be okay to reset if new file implies new analysis
    // setShowClinicalConcepts(false);
    // setClinicalSummary(null); 

    await processFileForClinicalNotes(file, 1);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClearFile = () => {
    setUploadedFileName(null);
    form.setValue("clinicalText", "");
    setFileProcessingError(null);

    setExtractedConcepts([]);
    setSuggestedDiagnoses([]);
    setError(null);
    setSubmitted(false);
    setShowClinicalConcepts(false);
    setClinicalSummary(null); 

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast({ title: "Entrada de archivo y resultados limpiados", description: "Puede ingresar texto manualmente o cargar un nuevo archivo." });
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

  const handleCopySuggestedDiagnoses = async () => {
    if (!suggestedDiagnoses || suggestedDiagnoses.length === 0) {
      toast({ variant: "destructive", title: "Nada que copiar", description: "No hay diagnósticos sugeridos para copiar." });
      return;
    }

    const selectedDiagnoses = suggestedDiagnoses.filter(diag => diag.isSelected);
    const diagnosesToCopy = selectedDiagnoses.length > 0 ? selectedDiagnoses : suggestedDiagnoses;

    const textToCopy = diagnosesToCopy
      .map(diag => `${diag.code} - ${diag.description}`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast({ title: "¡Diagnósticos copiados!", description: `${diagnosesToCopy.length} diagnóstico(s) copiado(s) al portapapeles.` });
    } catch (err) {
      console.error("Error al copiar diagnósticos: ", err);
      toast({ variant: "destructive", title: "Error al copiar", description: "No se pudieron copiar los diagnósticos." });
    }
  };

  const handleCopyClinicalSummary = async () => {
    if (!clinicalSummary) {
      toast({ variant: "destructive", title: "Nada que copiar", description: "No hay resumen clínico para copiar." });
      return;
    }
    try {
      await navigator.clipboard.writeText(clinicalSummary);
      toast({ title: "¡Resumen copiado!", description: "El resumen de las notas clínicas ha sido copiado al portapapeles." });
    } catch (err) {
      console.error("Error al copiar resumen: ", err);
      toast({ variant: "destructive", title: "Error al copiar", description: "No se pudo copiar el resumen al portapapeles." });
    }
  };


  const handleLoadFromHistory = (entry: HistoryEntry) => {
    form.setValue("clinicalText", entry.clinicalText);
    form.setValue("codingSystem", entry.codingSystem);
    setUploadedFileName(entry.fileName || null);
    setExtractedConcepts(entry.extractedConcepts);
    setSuggestedDiagnoses(entry.suggestedDiagnoses.map(diag => ({
        ...diag,
        id: diag.id || `${diag.code}-${Date.now()}-${Math.random()}`
    })));
    setClinicalSummary(entry.clinicalSummary || null); // Load clinical summary
    setSubmitted(true);
    setError(null);
    setShowClinicalConcepts(entry.extractedConcepts.length > 0);
    toast({ title: "Historial Cargado", description: "Los datos de la entrada del historial se han cargado en el formulario." });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSetPrincipalDiagnosis = (diagnosisId: string) => {
    setSuggestedDiagnoses(prevDiagnoses => {
      const newDiagnoses = prevDiagnoses.map(diag => ({
        ...diag,
        isPrincipal: diag.id === diagnosisId,
      }));
      const principal = newDiagnoses.find(d => d.isPrincipal);
      if (principal) {
        return [principal, ...newDiagnoses.filter(d => d.id !== principal.id)];
      }
      return newDiagnoses;
    });
  };

  const handleToggleSelectedDiagnosis = (diagnosisId: string) => {
    setSuggestedDiagnoses(prevDiagnoses =>
      prevDiagnoses.map(diag =>
        diag.id === diagnosisId ? { ...diag, isSelected: !diag.isSelected } : diag
      )
    );
  };

  const handleSaveToHistory = async () => {
    const data = form.getValues();
    if (!submitted || isLoading || error || (suggestedDiagnoses.length === 0 && !clinicalSummary)) {
      toast({ variant: "destructive", title: "No se puede guardar", description: "Debe haber resultados válidos (diagnósticos o resumen) para guardar en el historial."});
      return;
    }
    try {
      const historyEntry: HistoryEntry = {
        timestamp: Date.now(),
        clinicalText: data.clinicalText,
        codingSystem: data.codingSystem,
        extractedConcepts: extractedConcepts,
        suggestedDiagnoses: suggestedDiagnoses,
        fileName: uploadedFileName,
        clinicalSummary: clinicalSummary, 
      };
      await db.history.add(historyEntry);
      toast({ title: "Guardado en Historial", description: "El análisis actual se ha guardado en el historial."});
    } catch (dbError) {
      console.error("Error saving to history:", dbError);
      toast({ variant: "destructive", title: "Error de Historial", description: "No se pudo guardar el análisis en el historial."});
    }
  };

  const handleClearSuggestedDiagnoses = () => {
    setSuggestedDiagnoses([]);
    toast({ title: "Diagnósticos Limpiados", description: "La lista de diagnósticos sugeridos ha sido borrada."});
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const {active, over} = event;

    if (over && active.id !== over.id) {
      setSuggestedDiagnoses((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }


  let conceptsResult: PromiseSettledResult<ExtractClinicalConceptsOutput> | undefined;
  let diagnosesResultFromAI: PromiseSettledResult<SuggestDiagnosesOutput> | undefined;


  const onSubmit: SubmitHandler<DiagnosisFormValues> = async (data, currentAttempt = 1) => {
    setIsLoading(true);
    setError(null);
    if (currentAttempt === 1) {
      setSubmitted(true);
      setExtractedConcepts([]);
      setSuggestedDiagnoses([]);
      // No limpiar el resumen aquí, ya que "Obtener Sugerencias IA" y "Generar Resumen" son acciones separadas
      // setClinicalSummary(null); 
    }

    toast({ 
      title: currentAttempt === 1 ? "Procesando Solicitud IA..." : "Reintentando Sugerencias IA...",
      description: `Obteniendo sugerencias y conceptos (intento ${currentAttempt} de ${MAX_AI_SUGGESTION_ATTEMPTS})...`,
      duration: 5000 
    });

    try {
      [conceptsResult, diagnosesResultFromAI] = await Promise.allSettled([
        extractClinicalConcepts({ documentText: data.clinicalText }),
        suggestDiagnoses({ clinicalText: data.clinicalText, codingSystem: data.codingSystem })
      ]);

      let needsRetry = false;

      if (conceptsResult.status === 'rejected' && isRetryableError(conceptsResult.reason)) {
        needsRetry = true;
        console.error("Error reintentable extrayendo conceptos:", conceptsResult.reason);
      }
      if (diagnosesResultFromAI.status === 'rejected' && isRetryableError(diagnosesResultFromAI.reason)) {
        needsRetry = true;
        console.error("Error reintentable sugiriendo diagnósticos:", diagnosesResultFromAI.reason);
      }

      if (needsRetry && currentAttempt < MAX_AI_SUGGESTION_ATTEMPTS) {
        const nextDelay = AI_SUGGESTION_RETRY_DELAYS_MS[currentAttempt - 1];
        toast({
          variant: "default",
          title: "Problema de Servicio IA (Sugerencias)",
          description: `El servicio está ocupado o limitado. Se reintentará en ${nextDelay / 1000} segundos... (Próximo intento: ${currentAttempt + 1} de ${MAX_AI_SUGGESTION_ATTEMPTS})`,
          duration: nextDelay,
        });
        setTimeout(() => {
          onSubmit(data, currentAttempt + 1);
        }, nextDelay);
        return;
      }

      if (conceptsResult.status === 'fulfilled' && conceptsResult.value) {
        setExtractedConcepts(conceptsResult.value.clinicalConcepts || []);
      } else if (conceptsResult.status === 'rejected') {
        console.error("Error extrayendo conceptos:", conceptsResult.reason);
        let conceptErrorMessage = "Ocurrió un error desconocido al extraer conceptos.";
        if (conceptsResult.reason instanceof Error && conceptsResult.reason.message) {
           if (isRetryableError(conceptsResult.reason)) {
                conceptErrorMessage = `El servicio de IA para extraer conceptos está sobrecargado/limitado (todos los ${MAX_AI_SUGGESTION_ATTEMPTS} intentos fallaron). Intente más tarde.`;
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

      if (diagnosesResultFromAI.status === 'fulfilled' && diagnosesResultFromAI.value) {
        const diagnosesWithUIFields = (diagnosesResultFromAI.value.diagnoses || []).map((diag, index) => ({
          ...diag,
          id: `${diag.code}-${Date.now()}-${index}-${Math.random().toString(36).substring(7)}`,
          isPrincipal: false,
          isSelected: false,
        }));
        setSuggestedDiagnoses(diagnosesWithUIFields);
      } else if (diagnosesResultFromAI.status === 'rejected') {
        console.error("Error sugiriendo diagnósticos:", diagnosesResultFromAI.reason);
        let diagnoseErrorMessage = "Ocurrió un error desconocido al sugerir diagnósticos.";
         if (diagnosesResultFromAI.reason instanceof Error && diagnosesResultFromAI.reason.message) {
            if (isRetryableError(diagnosesResultFromAI.reason)) {
                diagnoseErrorMessage = `El servicio de IA para sugerir diagnósticos está sobrecargado/limitado (todos los ${MAX_AI_SUGGESTION_ATTEMPTS} intentos fallaron). Intente más tarde.`;
            } else if (diagnosesResultFromAI.reason.message.includes("[GoogleGenerativeAI Error]") || diagnosesResultFromAI.reason.message.toLowerCase().includes("error fetching from")) {
                diagnoseErrorMessage = "Problema de comunicación al sugerir diagnósticos con IA. Intente más tarde.";
            } else {
                 diagnoseErrorMessage = `Error al sugerir diagnósticos: ${diagnosesResultFromAI.reason.message}`;
            }
        }
        if (!error) setError(`Error al sugerir diagnósticos: ${diagnoseErrorMessage}`);
         toast({
          variant: "destructive",
          title: "Error en la Sugerencia de Diagnósticos",
          description: diagnoseErrorMessage,
        });
      }

      if (conceptsResult.status === 'rejected' && diagnosesResultFromAI.status === 'rejected' && !needsRetry) {
        setError("Ambas operaciones de IA (conceptos y diagnósticos) fallaron. Por favor, revise la consola para más detalles e intente de nuevo.");
      } else if ((conceptsResult.status === 'rejected' && !isRetryableError(conceptsResult.reason)) || (diagnosesResultFromAI.status === 'rejected' && !isRetryableError(diagnosesResultFromAI.reason))) {
        if (!error && (conceptsResult.status === 'rejected' || diagnosesResultFromAI.status === 'rejected')) {
          setError("Una o más operaciones de IA fallaron. Por favor, revise los mensajes de error individuales.");
        }
      }

    } catch (e: any) {
      console.error(`Error durante el procesamiento IA (intento ${currentAttempt}):`, e);
      let generalErrorMessage = "Ocurrió un error inesperado durante el procesamiento con IA. Por favor, intente de nuevo.";
      if (isRetryableError(e) && currentAttempt < MAX_AI_SUGGESTION_ATTEMPTS) {
        const nextDelay = AI_SUGGESTION_RETRY_DELAYS_MS[currentAttempt - 1];
        toast({
          variant: "default",
          title: "Problema General de Servicio IA",
          description: `El servicio está experimentando problemas. Se reintentará en ${nextDelay / 1000} segundos... (Próximo intento: ${currentAttempt + 1} de ${MAX_AI_SUGGESTION_ATTEMPTS})`,
          duration: nextDelay,
        });
        setTimeout(() => {
           onSubmit(data, currentAttempt + 1);
        }, nextDelay);
        return;
      }

      if (e.message && typeof e.message === 'string') {
        if (isRetryableError(e)) { 
          generalErrorMessage = `Uno de los servicios de IA está sobrecargado/limitado (todos los ${MAX_AI_SUGGESTION_ATTEMPTS} intentos fallaron). Por favor, intente de nuevo más tarde.`;
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
          (diagnosesResultFromAI?.status === 'rejected' && isRetryableError(diagnosesResultFromAI.reason))
        ) && currentAttempt < MAX_AI_SUGGESTION_ATTEMPTS
      );

      if (!isAnyOperationStillRetrying) {
          setIsLoading(false);
      }
    }
  };

  const handleUploadMethodChange = (value: UploadMethodType) => {
    setUploadMethod(value);
     if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALSTORAGE_UPLOAD_METHOD_KEY, value);
    }
    toast({
      title: "Método de Carga Cambiado",
      description: `Se utilizará el "${value === 'extensive' ? 'Método Documento Extenso' : 'Método Normal'}" para la próxima carga de archivo.`,
    });
  };

  const handleGenerateSummary = async () => {
    const clinicalText = form.getValues("clinicalText");
    if (!clinicalText || clinicalText.length < 20) {
      toast({ variant: "destructive", title: "Texto Clínico Insuficiente", description: "Por favor, ingrese al menos 20 caracteres en las notas clínicas para generar un resumen." });
      return;
    }

    setIsSummarizing(true);
    setClinicalSummary(null);
    toast({ title: "Generando Resumen...", description: "La IA está procesando las notas clínicas para crear un resumen." });

    try {
      const result: SummarizeClinicalNotesOutput = await summarizeClinicalNotes({ clinicalNotes: clinicalText });
      setClinicalSummary(result.summary);
      toast({ title: "Resumen Generado", description: "El resumen de las notas clínicas está listo." });
    } catch (err: any) {
      console.error("Error generando resumen:", err);
      let summaryErrorMessage = "Ocurrió un error al generar el resumen.";
       if (err.message && typeof err.message === 'string') {
        if (err.message.includes("[GoogleGenerativeAI Error]") || err.message.toLowerCase().includes("error fetching from")) {
           summaryErrorMessage = "Problema de comunicación con el servicio de IA al generar el resumen. Verifique su conexión o intente más tarde.";
        } else {
           summaryErrorMessage = `Error al generar resumen: ${err.message}`;
        }
      }
      setClinicalSummary(""); 
      toast({ variant: "destructive", title: "Error de Resumen", description: summaryErrorMessage });
    } finally {
      setIsSummarizing(false);
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

          <div className="mb-6 space-y-2">
            <Label>Método de Procesamiento de Archivo</Label>
            <RadioGroup
              value={uploadMethod}
              onValueChange={(value: string) => handleUploadMethodChange(value as UploadMethodType)}
              className="flex flex-col sm:flex-row sm:space-x-4 space-y-2 sm:space-y-0"
              disabled={isProcessingFile}
            >
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:text-accent-foreground cursor-pointer flex-1">
                <RadioGroupItem value="normal" id="method-normal" />
                <Label htmlFor="method-normal" className="font-normal cursor-pointer flex items-center">
                  <FileTextIcon className="mr-2 h-5 w-5" />
                  <div>
                    <p className="font-medium">Método Normal</p>
                    <p className="text-xs text-muted-foreground">Extracción estándar de texto.</p>
                  </div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-md hover:bg-accent/50 has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:text-accent-foreground cursor-pointer flex-1">
                <RadioGroupItem value="extensive" id="method-extensive" />
                <Label htmlFor="method-extensive" className="font-normal cursor-pointer flex items-center">
                   <FileClockIcon className="mr-2 h-5 w-5" />
                   <div>
                    <p className="font-medium">Documento Extenso</p>
                    <p className="text-xs text-muted-foreground">Condensa y elimina redundancias.</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
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
                        setSuggestedDiagnoses([]); 
                        toast({ title: "Diagnósticos Anteriores Limpiados", description: "Se limpiaron las sugerencias debido al cambio de sistema de codificación."});
                      }}
                      value={field.value}
                      disabled={isProcessingFile || isLoading || isSummarizing}
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
              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  type="submit" 
                  disabled={isLoading || isProcessingFile || isSummarizing} 
                  className="flex-1 rounded-md shadow-md hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  {(isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Procesando IA...' : 'Obtener Sugerencias IA'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={handleGenerateSummary}
                  disabled={isLoading || isProcessingFile || isSummarizing || !form.getValues("clinicalText") || form.getValues("clinicalText").length < 20}
                  className="flex-1 rounded-md shadow-md focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  {isSummarizing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <ScrollText className="mr-2 h-4 w-4" />
                  {isSummarizing ? 'Generando Resumen...' : 'Generar Resumen'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {error && !isLoading && !isProcessingFile && !isSummarizing && (
          <Alert variant="destructive" className="shadow-md rounded-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-headline">Error de IA</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {submitted && !isLoading && !isProcessingFile && !isSummarizing && !error && (
          <div className="flex items-center justify-between p-4 bg-card shadow-lg rounded-xl border">
            <div className="flex items-center space-x-2">
              <Switch
                id="show-concepts-switch"
                checked={showClinicalConcepts}
                onCheckedChange={setShowClinicalConcepts}
              />
              <Label htmlFor="show-concepts-switch" className="text-sm font-medium">
                Mostrar Conceptos Clínicos Extraídos
              </Label>
            </div>
            <Button onClick={handleSaveToHistory} size="sm" disabled={isLoading || isProcessingFile || !submitted || !!error || (suggestedDiagnoses.length === 0 && !clinicalSummary) }>
              <Save className="mr-2 h-4 w-4" />
              Guardar en Historial
            </Button>
          </div>
        )}

        {showClinicalConcepts && ((isLoading && !isProcessingFile && !isSummarizing && !error) || (submitted && !isLoading && !isProcessingFile && !error)) && (
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

        {(isSummarizing || clinicalSummary !== null) && (
          <Card className="shadow-lg rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center">
                <BookText className="mr-2 h-6 w-6 text-primary" />
                <CardTitle className="font-headline text-2xl">
                  Resumen de Notas Clínicas
                </CardTitle>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyClinicalSummary}
                    disabled={isSummarizing || !clinicalSummary}
                    className="h-8 w-8"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    <span className="sr-only">Copiar Resumen</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copiar Resumen</p>
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent>
              {isSummarizing && <Skeleton className="h-32 w-full rounded-md" />}
              {!isSummarizing && clinicalSummary && (
                <Textarea
                  readOnly
                  value={clinicalSummary}
                  className="min-h-[150px] resize-y rounded-md shadow-sm bg-secondary/30"
                />
              )}
              {!isSummarizing && clinicalSummary === "" && (
                 <p className="text-muted-foreground">No se pudo generar un resumen o el texto proporcionado no produjo un resumen significativo.</p>
              )}
            </CardContent>
          </Card>
        )}


        {(isLoading || (submitted && suggestedDiagnoses.length > 0) || (submitted && !isLoading && suggestedDiagnoses.length === 0 && !error && !isProcessingFile)) && (
          <Card className="shadow-lg rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1.5">
                <CardTitle className="font-headline text-2xl flex items-center">
                  <Stethoscope className="mr-2 h-6 w-6 text-primary" />
                  Diagnósticos Sugeridos
                </CardTitle>
                {suggestedDiagnoses.length > 0 && !isLoading && <CardDescription>Basado en el sistema de codificación {form.getValues("codingSystem")}. Seleccione, marque como principal y reordene si es necesario.</CardDescription>}
              </div>
              {suggestedDiagnoses.length > 0 && !isLoading && !isProcessingFile && (
                <div className="flex items-center space-x-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleCopySuggestedDiagnoses} className="h-8 w-8">
                        <ClipboardCopy className="h-4 w-4" />
                        <span className="sr-only">Copiar Diagnósticos</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Copiar Diagnósticos</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={handleClearSuggestedDiagnoses} className="h-8 w-8">
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Limpiar Diagnósticos Sugeridos</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Limpiar Diagnósticos Sugeridos</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isLoading && !isProcessingFile && !isSummarizing && !error && (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
                </div>
              )}
              {!isLoading && suggestedDiagnoses.length > 0 && (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                >
                  <SortableContext items={suggestedDiagnoses.map(d => d.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {suggestedDiagnoses.map((diag) => (
                        <SortableDiagnosisItem
                          key={diag.id}
                          diagnosis={diag}
                          onSetPrincipal={handleSetPrincipalDiagnosis}
                          onToggleSelected={handleToggleSelectedDiagnosis}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              {!isLoading && submitted && suggestedDiagnoses.length === 0 && !error && !isProcessingFile && (
                <p className="text-muted-foreground">No se sugirieron diagnósticos para el texto y sistema de codificación proporcionados.</p>
              )}
            </CardContent>
          </Card>
        )}
         {!isLoading && !submitted && !isProcessingFile && !isSummarizing && !error && clinicalSummary === null && (
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

