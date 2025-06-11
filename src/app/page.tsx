import { DiagnosisTool } from '@/components/diagnosis-tool';
import { HeartPulse } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="container flex h-16 items-center">
          <HeartPulse className="h-7 w-7 mr-3 text-primary" />
          <h1 className="text-3xl font-headline font-bold text-primary">DiagCode IA</h1>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-8">
        <div className="container mx-auto">
          <DiagnosisTool />
        </div>
      </main>
      <footer className="py-6 md:px-8 md:py-0 border-t bg-background/95">
        <div className="container flex flex-col items-center justify-center gap-4 md:h-20 md:flex-row">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            © {new Date().getFullYear()} DiagCode IA. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
