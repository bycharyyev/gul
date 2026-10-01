import { describe, expect, it } from "vitest";
import { percentChange, sortRows, toCsv } from "./table";

describe("toCsv", () => {
  const BOM = String.fromCharCode(0xfeff);
  const lines = (csv: string) => (csv.startsWith(BOM) ? csv.slice(1) : csv).trimEnd().split("\r\n");

  it("is what Excel in a Russian locale opens correctly: BOM, semicolons, CRLF", () => {
    const csv = toCsv(["Имя", "Сумма"], [["Алтын", 10]]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines(csv)).toEqual(["Имя;Сумма", "Алтын;10"]);
  });

  it("neutralizes cells a spreadsheet would execute as formulas (CSV injection)", () => {
    const [, row] = lines(toCsv(["a", "b", "c", "d"], [["=HYPERLINK(\"x\")", "@SUM(1)", "+cmd|' /C calc'!A0", "-2+3"]]));
    const cells = row!.split(";");
    expect(cells[0]).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(cells[1]).toBe("'@SUM(1)");
    expect(cells[2]!.startsWith("'+cmd")).toBe(true);
    // "-2+3" has an operator after the number, so it could be evaluated: neutralized too.
    expect(cells[3]).toBe("'-2+3");
  });

  it("leaves phone numbers and negative amounts alone", () => {
    const [, row] = lines(toCsv(["phone", "delta"], [["+993 65 12-34-56", "-150.5"]]));
    expect(row).toBe("+993 65 12-34-56;-150.5");
  });

  it("quotes separators, quotes and newlines; renders empty and dates predictably", () => {
    const date = new Date("2026-10-01T00:00:00.000Z");
    const [, row] = lines(toCsv(["a", "b", "c", "d"], [["x;y", "say \"hi\"", null, date]]));
    expect(row).toBe(`"x;y";"say ""hi""";;2026-10-01T00:00:00.000Z`);
  });
});

describe("sortRows", () => {
  const rows = [
    { name: "Б", n: 2 },
    { name: "", n: 1 },
    { name: "А", n: 2 },
    { name: "в", n: null },
  ];

  it("sorts by the Russian collation and keeps empty values last in both directions", () => {
    expect(sortRows(rows, (r) => r.name, "asc").map((r) => r.name)).toEqual(["А", "Б", "в", ""]);
    expect(sortRows(rows, (r) => r.name, "desc").map((r) => r.name)).toEqual(["в", "Б", "А", ""]);
  });

  it("is stable: equal keys keep their original order", () => {
    expect(sortRows(rows, (r) => r.n, "asc").map((r) => r.name)).toEqual(["", "Б", "А", "в"]);
  });

  it("compares numbers inside text numerically", () => {
    const items = [{ id: "order-10" }, { id: "order-9" }];
    expect(sortRows(items, (r) => r.id, "asc").map((r) => r.id)).toEqual(["order-9", "order-10"]);
  });
});

describe("percentChange", () => {
  it("reports growth and decline as percentages", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });

  it("has no percentage when there was nothing before, except zero to zero", () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
  });
});
