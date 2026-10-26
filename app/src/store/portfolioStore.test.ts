import { describe, expect, it } from "vitest";
import { sanitizePortfolios } from "./portfolioStore";

const book = {
  id: "p1",
  name: "Test",
  inceptionDate: "2020-01-01",
  initialCash: 100_000,
  benchmark: "SPY",
  trades: [],
};

describe("sanitizePortfolios — algo orders", () => {
  it("keeps a well-formed parent and defaults a missing list to empty", () => {
    const withOrders = sanitizePortfolios({
      portfolios: [{
        ...book,
        algoOrders: [{
          id: "a1",
          created: "2020-01-02",
          symbol: "aapl",
          side: "BUY",
          quantity: 1000,
          kind: "TWAP",
          startDate: "2020-01-02",
          endDate: "2020-01-08",
        }],
      }],
      activeId: "p1",
    });
    expect(withOrders.portfolios[0].algoOrders).toEqual([{
      id: "a1",
      created: "2020-01-02",
      symbol: "AAPL",
      side: "BUY",
      quantity: 1000,
      kind: "TWAP",
      startDate: "2020-01-02",
      endDate: "2020-01-08",
    }]);

    const legacy = sanitizePortfolios({ portfolios: [book], activeId: "p1" });
    expect(legacy.portfolios[0].algoOrders).toEqual([]);
  });

  it("drops a malformed parent without dropping the book", () => {
    const out = sanitizePortfolios({
      portfolios: [{
        ...book,
        algoOrders: [
          { id: "bad", kind: "TWAP" },
          {
            id: "ok", created: "2020-01-02", symbol: "MSFT", side: "SELL",
            quantity: 50, kind: "ICEBERG", startDate: "2020-01-02", endDate: "2020-01-08",
            displayQty: 10, limit: 20, participation: 0.1, cancelledOn: "2020-01-03",
          },
        ],
      }],
      activeId: "p1",
    });
    expect(out.portfolios[0].algoOrders).toHaveLength(1);
    expect(out.portfolios[0].algoOrders?.[0].id).toBe("ok");
    expect(out.portfolios[0].algoOrders?.[0].displayQty).toBe(10);
    expect(out.portfolios[0].algoOrders?.[0].cancelledOn).toBe("2020-01-03");
  });

  it("preserves algoOrderId on a trade and ignores junk", () => {
    const out = sanitizePortfolios({
      portfolios: [{
        ...book,
        trades: [{
          id: "t1", date: "2020-01-02", symbol: "AAPL", side: "BUY",
          quantity: 10, price: 10, fees: 0, algoOrderId: "a1",
        }],
      }],
      activeId: "p1",
    });
    expect(out.portfolios[0].trades[0].algoOrderId).toBe("a1");
  });
});
