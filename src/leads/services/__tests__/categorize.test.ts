import { categorize } from "../leadsSalesService";

describe("categorize", () => {
  it("maps simple types", () => {
    expect(categorize("mobile")).toEqual({ internet: 0, mobile: 1, internetSosh: 0, mobileSosh: 0 });
    expect(categorize("internet")).toEqual({ internet: 1, mobile: 0, internetSosh: 0, mobileSosh: 0 });
    expect(categorize("internetsosh")).toEqual({ internet: 0, mobile: 0, internetSosh: 1, mobileSosh: 0 });
    expect(categorize("mobilesosh")).toEqual({ internet: 0, mobile: 0, internetSosh: 0, mobileSosh: 1 });
  });

  it("maps combined types", () => {
    expect(categorize("internet + mobile")).toEqual({ internet: 1, mobile: 1, internetSosh: 0, mobileSosh: 0 });
    expect(categorize("internetsosh + mobilesosh")).toEqual({ internet: 0, mobile: 0, internetSosh: 1, mobileSosh: 1 });
  });

  it("normalizes casing and spaces", () => {
    expect(categorize("  Mobile  ")).toEqual({ internet: 0, mobile: 1, internetSosh: 0, mobileSosh: 0 });
    expect(categorize("AUTRES")).toEqual({ internet: 0, mobile: 0, internetSosh: 0, mobileSosh: 0 });
  });
});
