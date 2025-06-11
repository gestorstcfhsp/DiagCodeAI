// src/components/history-panel.tsx
"use client";

import { useRef } from "react";
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
import { History, UploadCloud, FileText, RotateCcw, Trash2, Upload, Download } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

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
              Array.isArray(entry.suggestedDiagnoses)
          )
        ) {
          toast({
            variant: "destructive",
            title: "Archivo No Válido",
            description: "El archivo JSON no tiene el formato esperado para el historial.",
          });
          return;
        }

        // Confirmation is handled by the AlertDialogTrigger for "Importar" button itself
        await db.history.clear(); // Clear existing history
        // Remove 'id' property so Dexie auto-generates new ones
        const entriesToAdd = importedEntries.map(entry => {
            const { id, ...rest } = entry;
            return rest;
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
          fileInputRef.current.value = ""; // Reset file input
        }
      }
    };
    reader.readAsText(file);
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
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Eliminar entrada</span>
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
                      <li>{entry.suggestedDiagnoses.length} diagnósticos sugeridos</li>
                    </ul>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={() => onLoadHistory(entry)}
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
  );
}

