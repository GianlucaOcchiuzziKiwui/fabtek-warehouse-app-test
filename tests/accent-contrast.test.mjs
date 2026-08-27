import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function customProperty(source, name) {
  const match = source.match(new RegExp(`--${name}:\\s*([^;]+);`, "u"));
  assert.ok(match, `Missing --${name} color token`);
  return match[1].trim();
}

function resolveColor(source, value) {
  const variable = value.match(/^var\(--([a-z-]+)\)$/u);
  return variable ? resolveColor(source, customProperty(source, variable[1])) : value;
}

function rgb(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/iu);
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function relativeLuminance(hex) {
  const channels = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)]
    .sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

test("accent buttons keep white text above WCAG AA contrast", async () => {
  const css = await readFile("app/globals.css", "utf8");
  const foreground = resolveColor(css, customProperty(css, "accent-foreground"));
  const backgrounds = [
    resolveColor(css, customProperty(css, "accent")),
    resolveColor(css, customProperty(css, "accent-hover")),
  ];

  assert.deepEqual(rgb(foreground), [255, 255, 255]);
  for (const background of backgrounds) {
    assert.ok(
      contrastRatio(background, foreground) >= 4.5,
      `${background} does not reach 4.5:1 against white`,
    );
  }
});
