
// src/components/history-panel.tsx
"use client";

import { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type HistoryEntry } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { History, UploadCloud, FileText, RotateCcw, Trash2, Upload, Download, Star, CheckSquare, Eye, Printer, FileDown, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface HistoryPanelProps {
  onLoadHistory: (entry: HistoryEntry) => void;
}

export function HistoryPanel({ onLoadHistory }: HistoryPanelProps) {
  const { toast } = useToast();
  const historyEntries = useLiveQuery(
    () => db.history.orderBy("timestamp").reverse().toArray(),
    [] // dependencies
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewEntry, setPreviewEntry] = useState<HistoryEntry | null>(null);
  const exportableContentRef = useRef<HTMLDivElement>(null);

  const handleDeleteEntry = async (id?: number) => {
    if (id === undefined) return;
    try {
      await db.history.delete(id);
      toast({
        title: "Entrada eliminada",
        description: "La entrada del historial ha sido eliminada.",
      });
    } catch (error) {
      console.error("Error deleting history entry:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la entrada del historial.",
      });
    }
  };

  const handleClearAllHistory = async () => {
    try {
      await db.history.clear();
      toast({
        title: "Historial borrado",
        description: "Todo el historial de trabajo ha sido eliminado.",
      });
    } catch (error) {
      console.error("Error clearing history:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo borrar el historial.",
      });
    }
  };

  const handleExportHistory = async () => {
    if (!historyEntries || historyEntries.length === 0) {
      toast({
        title: "Historial Vacío",
        description: "No hay entradas en el historial para exportar.",
      });
      return;
    }
    try {
      const allEntries = await db.history.toArray();
      const jsonString = JSON.stringify(allEntries, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diagcode_ia_history_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Historial Exportado",
        description: "El historial se ha descargado como un archivo JSON.",
      });
    } catch (error) {
      console.error("Error exporting history:", error);
      toast({
        variant: "destructive",
        title: "Error de Exportación",
        description: "No se pudo exportar el historial.",
      });
    }
  };

  const handleImportFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      try {
        const importedEntries = JSON.parse(text) as HistoryEntry[];

        if (
          !Array.isArray(importedEntries) ||
          !importedEntries.every(
            (entry) =>
              typeof entry.timestamp === "number" &&
              typeof entry.clinicalText === "string" &&
              typeof entry.codingSystem === "string" &&
              Array.isArray(entry.extractedConcepts) &&
              Array.isArray(entry.suggestedDiagnoses) &&
              entry.suggestedDiagnoses.every(diag => 
                typeof diag.code === 'string' &&
                typeof diag.description === 'string' &&
                typeof diag.confidence === 'number' &&
                typeof diag.id === 'string' && 
                (typeof diag.isPrincipal === 'boolean' || diag.isPrincipal === undefined) &&
                (typeof diag.isSelected === 'boolean' || diag.isSelected === undefined)
              )
          )
        ) {
          toast({
            variant: "destructive",
            title: "Archivo No Válido",
            description: "El archivo JSON no tiene el formato esperado para el historial.",
          });
          return;
        }
        
        await db.history.clear(); 
        const entriesToAdd = importedEntries.map(entry => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, ...rest } = entry; 
            return {
              ...rest,
              suggestedDiagnoses: entry.suggestedDiagnoses.map(d => ({
                ...d,
                isPrincipal: d.isPrincipal ?? false,
                isSelected: d.isSelected ?? false,
              }))
            };
        });
        await db.history.bulkAdd(entriesToAdd);
        
        toast({
          title: "Historial Importado",
          description: "El historial ha sido reemplazado con el contenido del archivo.",
        });
      } catch (err) {
        console.error("Error importing history:", err);
        toast({
          variant: "destructive",
          title: "Error de Importación",
          description: "No se pudo importar el archivo JSON. Verifique el formato.",
        });
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; 
        }
      }
    };
    reader.readAsText(file);
  };

  const handlePrintPreview = () => {
    document.body.classList.add('printing-active');
    
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-active');
      window.removeEventListener('afterprint', handleAfterPrint);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    
    window.print();
  };

  const handleExportToPDF = async (entry: HistoryEntry | null) => {
    if (!entry || !exportableContentRef.current) {
      toast({ variant: "destructive", title: "Error", description: "No hay contenido para exportar." });
      return;
    }

    const input = exportableContentRef.current;
    const scrollAreaViewport = input.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    
    let originalViewportHeight = '';
    let originalInputOverflowY = '';
    let originalInputMaxHeight = '';

    if (scrollAreaViewport) {
      originalViewportHeight = scrollAreaViewport.style.height;
      originalInputOverflowY = scrollAreaViewport.style.overflowY;
      scrollAreaViewport.style.height = 'auto';
      scrollAreaViewport.style.overflowY = 'visible';
    }
    originalInputMaxHeight = input.style.maxHeight;
    input.style.maxHeight = 'none';


    toast({ title: "Exportando a PDF...", description: "Esto puede tardar unos segundos." });

    try {
      const canvas = await html2canvas(input, {
        scale: 2, 
        useCORS: true,
        logging: false,
        onclone: (document) => {
          const clonedExportableContent = document.getElementById(input.id);
          if (clonedExportableContent) {
            const clonedScrollAreaViewport = clonedExportableContent.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
            if (clonedScrollAreaViewport) {
                clonedScrollAreaViewport.style.height = 'auto';
                clonedScrollAreaViewport.style.overflowY = 'visible';
            }
            clonedExportableContent.style.maxHeight = 'none';
          }
          if (document.documentElement.classList.contains('dark')) {
              const clonedBody = document.body; // Or the specific element
              clonedBody.classList.add('dark');
          }
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`historial_diagcode_${entry.id || 'export'}.pdf`);

      toast({ title: "Exportado a PDF", description: "El archivo PDF ha sido descargado." });

    } catch (error) {
      console.error("Error exportando a PDF:", error);
      toast({ variant: "destructive", title: "Error de Exportación", description: "No se pudo generar el PDF." });
    } finally {
      if (scrollAreaViewport) {
        scrollAreaViewport.style.height = originalViewportHeight;
        scrollAreaViewport.style.overflowY = originalInputOverflowY;
      }
      input.style.maxHeight = originalInputMaxHeight;
    }
  };


  if (historyEntries === undefined) {
    return (
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center">
            <History className="mr-2 h-6 w-6 text-primary" />
            Historial de Trabajo
          </CardTitle>
          <CardDescription>Cargando historial...</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">...</p>
        </CardContent>
      </Card>
    );
  }


  return (
    <Dialog onOpenChange={(isOpen) => { if(!isOpen) setPreviewEntry(null); }}>
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                  <CardTitle className="font-headline text-2xl flex items-center">
                      <History className="mr-2 h-6 w-6 text-primary" />
                      Historial de Trabajo
                  </CardTitle>
                  <CardDescription>Revise, cargue, importe o exporte sus análisis.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                  <input
                      type="file"
                      accept=".json"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleImportFileSelect}
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                          <Upload className="mr-2 h-4 w-4" />
                          Importar JSON
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Importar historial desde archivo JSON?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acción reemplazará su historial actual con el contenido del archivo seleccionado. ¿Desea continuar?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => fileInputRef.current?.click()} className="bg-primary hover:bg-primary/90">
                          Seleccionar Archivo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button variant="outline" size="sm" onClick={handleExportHistory} disabled={!historyEntries || historyEntries.length === 0}>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar JSON
                  </Button>
                  <AlertDialog>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={!historyEntries || historyEntries.length === 0}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Borrar Todo
                      </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                      <AlertDialogTitle>¿Está seguro de borrar todo el historial?</AlertDialogTitle>
                      <AlertDialogDescription>
                          Esta acción no se puede deshacer. Se eliminarán permanentemente todas las entradas del historial.
                      </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearAllHistory} className="bg-destructive hover:bg-destructive/90">
                          Borrar Todo
                      </AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
                  </AlertDialog>
              </div>
          </div>
        </CardHeader>
        <CardContent>
          {historyEntries.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                  No hay entradas en el historial todavía. Los resultados de sus análisis aparecerán aquí.
              </p>
          ) : (
          <ScrollArea className="h-[400px] pr-3">
            <div className="space-y-4">
              {historyEntries.map((entry) => (
                <Card key={entry.id} className="bg-card shadow-sm rounded-lg">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base font-medium flex items-center">
                          {entry.fileName ? (
                            <UploadCloud className="mr-2 h-5 w-5 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <FileText className="mr-2 h-5 w-5 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="truncate" title={entry.fileName || "Texto Manual"}>
                            {entry.fileName || "Texto Manual"}
                          </span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {format(new Date(entry.timestamp), "PPpp", { locale: es })}
                        </CardDescription>
                      </div>
                      <div className="flex items-center space-x-1">
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => setPreviewEntry(entry)}
                            aria-label="Ver detalles"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label="Eliminar entrada">
                                  <Trash2 className="h-4 w-4" />
                              </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                          <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar esta entrada del historial?</AlertDialogTitle>
                              <AlertDialogDescription>
                              Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteEntry(entry.id)} className="bg-destructive hover:bg-destructive/90">
                              Eliminar
                              </AlertDialogAction>
                          </AlertDialogFooter>
                          </AlertDialogContent>
                      </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2 pb-3">
                    <div>
                      <span className="font-semibold">Sistema:</span>{" "}
                      <Badge variant="secondary">{entry.codingSystem}</Badge>
                    </div>
                    <p className="line-clamp-2">
                      <span className="font-semibold">Texto Clínico:</span>{" "}
                      {entry.clinicalText}
                    </p>
                    <div>
                      <span className="font-semibold">Resultados:</span>
                      <ul className="list-disc list-inside ml-1 text-xs">
                        <li>{entry.extractedConcepts.length} conceptos extraídos</li>
                        <li>
                          {entry.suggestedDiagnoses.length} diagnósticos sugeridos
                          {entry.suggestedDiagnoses.some(d => d.isPrincipal) && (
                            <Star className="ml-1 h-3 w-3 inline-block text-amber-500 fill-amber-500" />
                          )}
                          {entry.suggestedDiagnoses.filter(d => d.isSelected).length > 0 && (
                            <span className="ml-1">({entry.suggestedDiagnoses.filter(d => d.isSelected).length} validados <CheckSquare className="ml-1 h-3 w-3 inline-block text-green-600" />)</span>
                          )}
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      onClick={() => {
                        onLoadHistory(entry);
                        toast({ title: "Historial Cargado", description: "La entrada del historial se ha cargado en el formulario."});
                      }}
                      className="w-full"
                      size="sm"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Cargar en Formulario
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </ScrollArea>
          )}
        </CardContent>
      </Card>

      {previewEntry && (
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
          <div ref={exportableContentRef} id={`exportable-content-${previewEntry.id}`} className="flex flex-col flex-grow overflow-hidden">
            <DialogHeader className="p-6 pb-4 flex flex-row justify-between items-start sticky top-0 bg-background z-10 border-b">
              <div>
                <DialogTitle className="font-headline text-xl">Detalle de la Entrada del Historial</DialogTitle>
                <DialogDescription>
                  {format(new Date(previewEntry.timestamp), "PPPPpppp", { locale: es })}
                </DialogDescription>
              </div>
              <div className="flex items-center space-x-1 no-print">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => handleExportToPDF(previewEntry)} aria-label="Exportar a PDF">
                      <FileDown className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Exportar a PDF</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handlePrintPreview} aria-label="Imprimir">
                      <Printer className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Imprimir</p></TooltipContent>
                </Tooltip>
                {/* The default DialogContent X button is used for closing, no need for an additional one here if this is preferred */}
              </div>
            </DialogHeader>
            
            <ScrollArea className="flex-grow overflow-y-auto px-6 pb-6"> {/* Apply padding here instead of inner div for better scroll */}
              <div className="space-y-4 pt-4">
                <div>
                  <Label className="font-semibold text-base">Fuente:</Label>
                  <p className="text-sm ml-1">{previewEntry.fileName ? `Archivo: ${previewEntry.fileName}` : "Texto Manual"}</p>
                </div>
                <Separator />
                <div>
                  <Label className="font-semibold text-base">Sistema de Codificación:</Label>
                  <p className="text-sm ml-1">{previewEntry.codingSystem}</p>
                </div>
                <Separator />
                <div>
                  <Label className="font-semibold text-base">Notas Clínicas:</Label>
                  <ScrollArea className="h-[150px] w-full rounded-md border p-3 mt-1 bg-secondary/30">
                    <p className="text-sm whitespace-pre-wrap">{previewEntry.clinicalText}</p>
                  </ScrollArea>
                </div>
                <Separator />
                <div>
                  <Label className="font-semibold text-base">Conceptos Clínicos Extraídos ({previewEntry.extractedConcepts.length}):</Label>
                  {previewEntry.extractedConcepts.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {previewEntry.extractedConcepts.map((concept, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">{concept}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground ml-1">No se extrajeron conceptos.</p>
                  )}
                </div>
                <Separator />
                <div>
                  <Label className="font-semibold text-base">Diagnósticos Sugeridos ({previewEntry.suggestedDiagnoses.length}):</Label>
                  {previewEntry.suggestedDiagnoses.length > 0 ? (
                    <div className="space-y-1.5 mt-1">
                      {previewEntry.suggestedDiagnoses.map((diag) => (
                        <Card key={diag.id} className={`p-2 text-sm ${diag.isPrincipal ? 'border-primary' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              {diag.isPrincipal && <Star className="h-4 w-4 mr-2 text-primary fill-primary" />}
                              {diag.isSelected && <CheckSquare className="h-4 w-4 mr-2 text-green-600" />}
                              <span className="font-medium mr-2 text-primary">{diag.code}</span>
                              <span className="text-card-foreground">{diag.description}</span>
                            </div>
                            <Badge variant={diag.confidence > 0.7 ? "default" : diag.confidence > 0.4 ? "secondary" : "outline"} className="text-xs ml-2">
                              {(diag.confidence * 100).toFixed(0)}%
                            </Badge>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground ml-1">No se sugirieron diagnósticos.</p>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
          {/* DialogFooter is removed, the main X button from DialogContent handles closing */}
        </DialogContent>
      )}
    </Dialog>
  );
}

