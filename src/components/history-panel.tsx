// src/components/history-panel.tsx
"use client";

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
import { History, UploadCloud, FileText, RotateCcw, Trash2 } from "lucide-react";
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

  if (historyEntries.length === 0) {
    return (
      <Card className="shadow-lg rounded-xl">
        <CardHeader>
          <CardTitle className="font-headline text-2xl flex items-center">
            <History className="mr-2 h-6 w-6 text-primary" />
            Historial de Trabajo
          </CardTitle>
          <CardDescription>No hay entradas en el historial todavía.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Los resultados de sus análisis aparecerán aquí.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-headline text-2xl flex items-center">
            <History className="mr-2 h-6 w-6 text-primary" />
            Historial de Trabajo
          </CardTitle>
          <CardDescription>Revise y cargue sus análisis anteriores.</CardDescription>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={historyEntries.length === 0}>
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
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
