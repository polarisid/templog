import React from 'react';

export default function RecordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center p-4">
        {children}
      </main>
      <footer className="p-4 text-center text-sm text-muted-foreground">
        Desenvolvido por Daniel Carvalho versão 2.0
      </footer>
    </div>
  );
}
