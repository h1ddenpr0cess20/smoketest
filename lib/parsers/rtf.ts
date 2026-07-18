/**
 * RTF text extraction (no external dependency).
 *
 * @remarks
 * A character-by-character parser handling `\par` breaks, `\'XX` hex chars,
 * `\uN` unicode with ANSI-fallback skipping, nested groups, and ignorable
 * destinations such as `\fonttbl`, `\colortbl`, and `\pict`.
 */

interface RtfFrame {
  skip: boolean;
  ucn: number;
}

const SKIP_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info",
  "pict", "object", "objdata", "objclass",
  "fldinst", "header", "footer", "headerl", "headerr",
  "footerl", "footerr", "headerf", "footerf",
  "pgdsc", "listtable", "listoverridetable", "rsidtbl",
  "revtbl", "generator", "themedata", "colorschememapping",
]);

/**
 * Extracts plain text from RTF source.
 *
 * @param rawText - The RTF document as a string.
 * @throws If no readable text is found.
 */
export function extractRtfText(rawText: string): string {
  const parts: string[] = [];
  const stack: RtfFrame[] = [{ skip: false, ucn: 1 }];
  let i = 0;
  const n = rawText.length;

  const top = () => stack[stack.length - 1];

  while (i < n) {
    const ch = rawText[i];

    if (ch === "{") {
      i++;
      stack.push({ skip: top().skip, ucn: top().ucn });
    } else if (ch === "}") {
      i++;
      if (stack.length > 1) stack.pop();
    } else if (ch === "\\") {
      i++;
      if (i >= n) break;
      const c2 = rawText[i];

      if (c2 === "'") {
        i++;
        const hex = rawText.slice(i, i + 2);
        i += 2;
        if (!top().skip) {
          const code = parseInt(hex, 16);
          if (!isNaN(code)) parts.push(String.fromCharCode(code));
        }
      } else if (c2 === "*") {
        i++;
        top().skip = true;
      } else if (c2 === "\r" || c2 === "\n") {
        i++;
        if (!top().skip) parts.push("\n");
      } else if (c2 === "\\" || c2 === "{" || c2 === "}") {
        if (!top().skip) parts.push(c2);
        i++;
      } else if (c2 === "~") {
        if (!top().skip) parts.push(" ");
        i++;
      } else if (c2 === "_") {
        if (!top().skip) parts.push("‑");
        i++;
      } else if (c2 === "-") {
        i++;
      } else if (/[a-zA-Z]/.test(c2)) {
        let word = "";
        while (i < n && /[a-zA-Z]/.test(rawText[i])) word += rawText[i++];

        let numStr = "";
        const neg = rawText[i] === "-";
        if (neg) i++;
        while (i < n && /\d/.test(rawText[i])) numStr += rawText[i++];
        if (rawText[i] === " ") i++;

        const num = numStr ? (neg ? -parseInt(numStr, 10) : parseInt(numStr, 10)) : null;

        if (SKIP_DESTINATIONS.has(word)) {
          top().skip = true;
          continue;
        }

        if (top().skip) continue;

        if (word === "par" || word === "page" || word === "sect" || word === "column") {
          parts.push("\n");
        } else if (word === "line" || word === "row") {
          parts.push("\n");
        } else if (word === "cell") {
          parts.push("\t");
        } else if (word === "tab") {
          parts.push("\t");
        } else if (word === "uc") {
          if (num !== null) top().ucn = num;
        } else if (word === "u") {
          if (num !== null) {
            parts.push(String.fromCharCode(num < 0 ? num + 65536 : num));
            let toSkip = top().ucn;
            while (toSkip > 0 && i < n) {
              if (rawText[i] === "\\" && i + 1 < n && rawText[i + 1] === "'") {
                i += 4; toSkip--;
              } else if (rawText[i] === "\\") {
                i++;
                while (i < n && /[a-zA-Z]/.test(rawText[i])) i++;
                while (i < n && /[\d-]/.test(rawText[i])) i++;
                if (rawText[i] === " ") i++;
              } else if (rawText[i] === "{") {
                i++; stack.push({ skip: true, ucn: top().ucn });
              } else if (rawText[i] === "}") {
                i++; if (stack.length > 1) stack.pop();
              } else {
                i++; toSkip--;
              }
            }
          }
        } else if (word === "bullet") parts.push("•");
        else if (word === "emdash") parts.push("—");
        else if (word === "endash") parts.push("–");
        else if (word === "lquote") parts.push("‘");
        else if (word === "rquote") parts.push("’");
        else if (word === "ldblquote") parts.push("“");
        else if (word === "rdblquote") parts.push("”");
        else if (word === "enspace" || word === "emspace" || word === "qmspace") parts.push(" ");
      } else {
        i++;
      }
    } else if (ch === "\r" || ch === "\n") {
      i++;
    } else {
      if (!top().skip) parts.push(ch);
      i++;
    }
  }

  const result = parts.join("").replace(/\n{3,}/g, "\n\n").trim();
  if (!result) throw new Error("No readable text found");
  return result;
}
