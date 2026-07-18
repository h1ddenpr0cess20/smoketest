import { describe, expect, it } from "vitest";
import {
  contentDispositionFilename,
  generatedFileDownloadName,
} from "../lib/downloads";

describe("generated file download names", () => {
  it("parses plain and encoded Content-Disposition filenames", () => {
    expect(
      contentDispositionFilename('attachment; filename="report.csv"'),
    ).toBe("report.csv");
    expect(
      contentDispositionFilename(
        "attachment; filename*=UTF-8''sales%20report.csv",
      ),
    ).toBe("sales report.csv");
    expect(contentDispositionFilename("attachment; filename=plain.txt")).toBe(
      "plain.txt",
    );
    expect(contentDispositionFilename(null)).toBeNull();
    expect(contentDispositionFilename("attachment")).toBeNull();
    expect(
      contentDispositionFilename(
        "attachment; filename*=UTF-8''bad%ZZ; filename=fallback.txt",
      ),
    ).toBe("fallback.txt");
  });

  it("prefers annotation metadata and strips paths", () => {
    expect(
      generatedFileDownloadName(
        "exports/report.csv",
        'attachment; filename="fallback.csv"',
        "cfile_1",
      ),
    ).toBe("report.csv");
    expect(generatedFileDownloadName(null, null, "cfile_1")).toBe("cfile_1");
    expect(generatedFileDownloadName(null, null, "")).toBe("download");
  });
});
