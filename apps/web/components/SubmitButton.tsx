"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/Button";

// Botão de formulário nativo (<form action={serverAction}>) que mostra
// "Enviando..." e fica desabilitado enquanto a action roda — sem isso,
// qualquer ação um pouco mais lenta (upload de foto, IA) parece travada e a
// pessoa acaba clicando de novo, duplicando o envio. useFormStatus só
// funciona dentro de um <form>, então este componente precisa ficar como
// filho direto dele (pode ser renderizado de uma página server component
// normalmente, só o botão em si precisa ser client).
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
