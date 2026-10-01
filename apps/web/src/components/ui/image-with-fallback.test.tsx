import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageWithFallback } from "./image-with-fallback";

const UPLOAD = "https://open.s3.regru.cloud/uploads/photo.png";

describe("ImageWithFallback", () => {
  afterEach(cleanup);

  it("serves our own uploads through the optimizer, sized by `sizes`", () => {
    render(<ImageWithFallback src={UPLOAD} alt="photo" sizes="64px" />);
    const img = screen.getByAltText("photo") as HTMLImageElement;

    expect(img.getAttribute("src")).toContain("/_next/image?url=");
    expect(img.getAttribute("src")).toContain(encodeURIComponent(UPLOAD));
    expect(img.getAttribute("srcset")).toMatch(/w=\d+/);
    expect(img.getAttribute("sizes")).toBe("64px");
  });

  it("never routes a third-party URL through the optimizer (no open proxy)", () => {
    const external = "https://cdn.example.com/x.png";
    render(<ImageWithFallback src={external} alt="ext" />);
    const img = screen.getByAltText("ext");

    expect(img.getAttribute("src")).toBe(external);
    expect(img.hasAttribute("srcset")).toBe(false);
  });

  it("falls back to the raw file if the optimizer fails, then to a placeholder", () => {
    render(<ImageWithFallback src={UPLOAD} alt="photo" />);

    fireEvent.error(screen.getByAltText("photo"));
    const raw = screen.getByAltText("photo");
    expect(raw.getAttribute("src")).toBe(UPLOAD);

    fireEvent.error(raw);
    expect(screen.getByRole("img", { name: "photo" }).tagName).toBe("DIV");
  });

  it("shows the placeholder straight away when there is no source", () => {
    render(<ImageWithFallback src={null} alt="none" />);
    expect(screen.getByRole("img", { name: "none" }).tagName).toBe("DIV");
  });

  it("passes the fetch priority through for the LCP image", () => {
    render(<ImageWithFallback src={UPLOAD} alt="hero" fetchPriority="high" />);
    expect(screen.getByAltText("hero").getAttribute("fetchpriority")).toBe("high");
  });
});
