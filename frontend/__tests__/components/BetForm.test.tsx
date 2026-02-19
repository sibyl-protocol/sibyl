import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BetForm from "@/components/BetForm";
import type { MarketData } from "@/lib/types";

const openMarket: MarketData = {
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

const closedMarket: MarketData = { ...openMarket, status: "Resolved", outcome: "Yes", oracleConfidence: 90 };

describe("BetForm", () => {
  it("shows Yes/No buttons when market is Open", () => {
    render(<BetForm market={openMarket} />);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it('shows "Betting is closed" when market is not Open', () => {
    render(<BetForm market={closedMarket} />);
    expect(screen.getByText(/Betting is closed/)).toBeInTheDocument();
  });

  it("side selection highlights the button (adds shadow class)", async () => {
    const user = userEvent.setup();
    render(<BetForm market={openMarket} />);
    const yesBtn = screen.getByText("Yes");
    await user.click(yesBtn);
    // After click, the Yes button gets the active class with shadow
    expect(yesBtn.className).toContain("shadow-lg");
  });

  it("amount input appears after side selection", async () => {
    const user = userEvent.setup();
    render(<BetForm market={openMarket} />);
    expect(screen.queryByPlaceholderText("Amount")).not.toBeInTheDocument();
    await user.click(screen.getByText("Yes"));
    expect(screen.getByPlaceholderText("Amount")).toBeInTheDocument();
  });

  it("confirm button present after side selection", async () => {
    const user = userEvent.setup();
    render(<BetForm market={openMarket} />);
    await user.click(screen.getByText("No"));
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });
});
