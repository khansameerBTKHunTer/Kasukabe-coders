import { ApiError } from "@/lib/auth/server";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export function validatePhotoBytes(buffer: Buffer, declaredType: string) {
  if (!buffer.length || buffer.length > MAX_PHOTO_BYTES)
    throw new ApiError(400, "Choose a photograph no larger than 8 MB.");
  const type = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    ? "image/jpeg"
    : buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP"
        ? "image/webp" : null;
  if (!type || type !== declaredType)
    throw new ApiError(400, "Upload a valid JPEG, PNG, or WebP photograph. SVG and other file types are not supported.");
  return type;
}
