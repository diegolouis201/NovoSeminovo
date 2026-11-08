"use client";

export function Imprimir({ src }: { src: string }) {
  return (
    <>
      <style>{`@page { size: A4; margin: 0 } @media print { header, footer, .nao-imprimir { display: none !important } body { margin: 0 } }`}</style>
      <p className="nao-imprimir mx-auto max-w-md px-4 py-3 text-center text-sm text-ink-muted">
        A impressão abre sozinha. Se não abrir, use Ctrl+P (ou Compartilhar → Imprimir no celular).
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Cartaz da vitrine" className="mx-auto block h-auto w-full max-w-[210mm]" onLoad={() => setTimeout(() => window.print(), 300)} />
    </>
  );
}
