import { render, screen } from "@testing-library/react";
import PositionDisplay from "@/components/PositionDisplay";
import type { MarketData, PositionData } from "@/lib/types";

const market: MarketData = {
  id: 1,
  authority: "11111111111111111111111111111111",
  title: "Test",
  description: "Test",
  resolutionDeadline: Math.floor(Date.now() / 1000) + 86400,
  yesPool: 100,
  noPool: 100,
  status: "Open",
  outcome: null,
  oracleConfidence: 0,
  publicKey: "mock",
};

const position: PositionData = {
  owner: "owner1",
  market: "market1",
  side: "Yes",
  amount: 500,
  claimed: false,
  publicKey: "pos1",
};

describe("PositionDisplay", () => {
  it("renders nothing when position is null", () => {
    const { container } = render(<PositionDisplay position={null} market={market} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows position details when position exists", () => {
    render(<PositionDisplay position={position} market={market} />);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("500 SBYL")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows claim button for resolved winning position", () => {
    const resolvedMarket: MarketData = { ...market, status: "Resolved", outcome: "Yes", oracleConfidence: 90 };
    render(<PositionDisplay position={position} market={resolvedMarket} />);
    expect(screen.getByText("Winner!")).toBeInTheDocument();
    expect(screen.getByText("Claim Winnings")).toBeInTheDocument();
  });

  it("does not show claim button for losing position", () => {
    const resolvedMarket: MarketData = { ...market, status: "Resolved", outcome: "No", oracleConfidence: 90 };
    render(<PositionDisplay position={position} market={resolvedMarket} />);
    expect(screen.getByText("Lost")).toBeInTheDocument();
    expect(screen.queryByText("Claim Winnings")).not.toBeInTheDocument();
  });
});
