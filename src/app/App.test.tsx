import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./App";

test("opens the daily view", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "每日待办" })).toBeInTheDocument();
});
