import { render, screen } from "@testing-library/react";
import OddsBar from "@/components/OddsBar";

describe("OddsBar", () => {
  it("renders correct percentages (60% Yes / 40% No)", () => {
    render(<OddsBar yesPool={60} noPool={40} />);
    expect(screen.getByText("Yes 60%")).toBeInTheDocument();
    expect(screen.getByText("No 40%")).toBeInTheDocument();
  });

  it("handles 0/0 pools as 50/50 default", () => {
    render(<OddsBar yesPool={0} noPool={0} />);
    expect(screen.getByText("Yes 50%")).toBeInTheDocument();
    expect(screen.getByText("No 50%")).toBeInTheDocument();
  });

  it("handles one-sided pool (100/0)", () => {
    render(<OddsBar yesPool={100} noPool={0} />);
    expect(screen.getByText("Yes 100%")).toBeInTheDocument();
    expect(screen.getByText("No 0%")).toBeInTheDocument();
  });

  it("hides labels when showLabels is false", () => {
    render(<OddsBar yesPool={60} noPool={40} showLabels={false} />);
    expect(screen.queryByText("Yes 60%")).not.toBeInTheDocument();
    expect(screen.queryByText("No 40%")).not.toBeInTheDocument();
  });
});
