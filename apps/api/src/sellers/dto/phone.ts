import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { Matches } from "class-validator";

// 7–15 digits, optionally with a leading "+". Spaces, dashes and brackets are accepted on input and
// dropped before the value is stored, so "+993 (61) 12-34-56" saves as "+99361123456".
export const PHONE_PATTERN = /^\+?\d{7,15}$/;

export function normalizePhone(value: unknown): unknown {
  return typeof value === "string" ? value.replace(/[\s()-]/g, "") : value;
}

export function IsPhone() {
  return applyDecorators(
    Transform(({ value }) => normalizePhone(value)),
    Matches(PHONE_PATTERN, { message: "Телефон: 7–15 цифр, можно с + в начале" }),
  );
}
