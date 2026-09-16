import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "./App";
import { asLocalDate } from "../domain/local-date";

test("opens the daily view", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "每日待办" })).toBeInTheDocument();
});

test("changes dates and preserves selection when switching views", async () => {
  const user = userEvent.setup();
  render(<App today={() => asLocalDate("2026-09-16")} />);
  const date = screen.getByLabelText("日期");
  expect(date).toHaveValue("2026-09-16");
  await user.click(screen.getByRole("button", { name: "下一天" }));
  expect(date).toHaveValue("2026-09-17");
  await user.click(screen.getByRole("tab", { name: "项目" }));
  expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "每日" }));
  expect(screen.getByLabelText("日期")).toHaveValue("2026-09-17");
  await user.click(screen.getByRole("button", { name: "今天" }));
  expect(screen.getByLabelText("日期")).toHaveValue("2026-09-16");
  await user.click(screen.getByRole("tab", { name: "设置" }));
  expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
});
