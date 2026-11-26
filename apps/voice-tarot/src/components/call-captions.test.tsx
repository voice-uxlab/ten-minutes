import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { CallCaptions } from "./call-captions";

test("shows the latest caption and keeps history open while new speech arrives", () => {
  const first = "첫 대사";
  const second = "두 번째 대사";
  const third = "세 번째 대사";
  const fallback = "네 이야기를 듣고 있어.";
  const { rerender } = render(
    <CallCaptions caption={first} history={[first]} fallback={fallback} />,
  );
  expect(screen.queryByRole("button")).toBeNull();

  rerender(
    <CallCaptions caption={second} history={[first, second]} fallback={fallback} />,
  );
  expect(within(screen.getByRole("region", { name: "최신 대사" })).getByText(second)).toBeTruthy();
  expect(screen.queryByText(first)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "이전 대사 보기" }));
  expect(within(screen.getByRole("region", { name: "이전 대사" })).getByText(first)).toBeTruthy();
  expect(screen.queryByText(second)).toBeNull();

  rerender(
    <CallCaptions caption={third} history={[first, second, third]} fallback={fallback} />,
  );
  expect(within(screen.getByRole("region", { name: "이전 대사" })).getByText(second)).toBeTruthy();
  expect(screen.queryByText(third)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "최신 대사 보기" }));
  expect(within(screen.getByRole("region", { name: "최신 대사" })).getByText(third)).toBeTruthy();
  expect(screen.queryByText(second)).toBeNull();
});
