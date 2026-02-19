import { render, screen } from "@testing-library/react";
import MarketCard from "@/components/MarketCard";
import type { MarketData } from "@/lib/types";

// Mock next/link to render a plain anchor
jest.mock("next/link", () => {
  return ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
});

const baseMarket: MarketData = {
  id: 42,
  authority: "11111111111111111111111111111111",
  title: "Will it rain tomorrow?",
  description: "A test market",
  resolutionDeadline: Math.floor(Date.now() / 1000) + 86400 * 3, // 3 days from now
  yesPool: 1000,
  noPool: 500,
  status: "Open",
  outcome: null,
  oracleConfidence: 0,
  publicKey: "mock",
};

describe("MarketCard", () => {
  it("renders market title and status badge", () => {
    render(<MarketCard market={baseMarket} />);
    expect(screen.getByText("Will it rain tomorrow?")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("shows pool amount", () => {
    render(<MarketCard market={baseMarket} />);
    expect(screen.getByText("Pool: 1,500 SBYL")).toBeInTheDocument();
  });

  it("shows days left for Open markets", () => {
    render(<MarketCard market={baseMarket} />);
    expect(screen.getByText(/\dd left/)).toBeInTheDocument();
  });

  it("shows outcome for Resolved markets", () => {
    const resolved: MarketData = {
      ...baseMarket,
      status: "Resolved",
      outcome: "No",
      oracleConfidence: 87,
    };
    render(<MarketCard market={resolved} />);
    expect(screen.getByText(/Outcome: No/)).toBeInTheDocument();
    expect(screen.getByText(/87% confidence/)).toBeInTheDocument();
  });

  it("links to correct market detail page", () => {
    render(<MarketCard market={baseMarket} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/markets/42");
  });
});
