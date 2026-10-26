"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Qual seção (Carros ou Imóveis) está aberta, pra deixar o botão do menu
// marcado. /carros e /imoveis saem do caminho; páginas que mostram um tipo
// só pelo conteúdo (anúncio, busca) avisam com <MarkVertical>.
type Vertical = "vehicle" | "property";

const VerticalContext = createContext<{ marked?: Vertical; setMarked: (value?: Vertical) => void }>({ setMarked: () => undefined });

export function VerticalProvider({ children }: { children: React.ReactNode }) {
  const [marked, setMarked] = useState<Vertical>();
  return <VerticalContext.Provider value={{ marked, setMarked }}>{children}</VerticalContext.Provider>;
}

export function MarkVertical({ value }: { value?: Vertical }) {
  const { setMarked } = useContext(VerticalContext);
  useEffect(() => {
    setMarked(value);
    return () => setMarked(undefined);
  }, [value, setMarked]);
  return null;
}

export function useActiveVertical(): Vertical | undefined {
  const pathname = usePathname();
  const { marked } = useContext(VerticalContext);
  if (pathname.startsWith("/carros")) return "vehicle";
  if (pathname.startsWith("/imoveis")) return "property";
  return marked;
}
