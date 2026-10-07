// Parser de CSV sem dependência externa (RFC4180: campos entre aspas podem
// conter vírgula/quebra de linha, aspas duplicadas viram uma aspas literal).
// Suficiente pro uso daqui (planilha simples de estoque) — não lida com
// coisas como delimitador customizado ou BOM de outros encodings.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\r") {
      // ignora — \n (sozinho ou depois do \r) é quem fecha a linha
    } else if (char === "\n") {
      pushRow();
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((cells) => !(cells.length === 1 && cells[0] === ""));
}

// Primeira linha é o cabeçalho; cada linha seguinte vira um registro
// { nomeDaColuna: valor }, na ordem em que aparecem no arquivo.
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  const headerRow = rows[0];
  if (!headerRow) return [];

  const header = headerRow.map((cell) => cell.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = (row[index] ?? "").trim();
    });
    return record;
  });
}
