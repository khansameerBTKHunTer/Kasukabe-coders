interface UploadedPhoto { imagePath: string; previewUrl: string; storage: string }

export async function uploadPhoto(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UploadedPhoto> {
  // Only metadata crosses the app function in real mode. The image goes
  // directly to private Supabase Storage, including photographs over 4.5 MB.
  const prepared = await fetch("/api/uploads", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }), signal,
  });
  const preparation = await prepared.json();
  if (!prepared.ok || !preparation.success)
    throw new Error(preparation.error || "Unable to prepare the photograph upload.");
  const direct = preparation.uploadMode === "direct";
  const uploaded = await new Promise<UploadedPhoto>((resolve, reject) => {
    const request = new XMLHttpRequest();
    if (signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    const cancel = () => request.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    request.onloadend = () => signal?.removeEventListener("abort", cancel);
    request.onabort = () =>
      reject(new DOMException("Upload cancelled", "AbortError"));
    request.open(direct ? "PUT" : "POST", direct ? preparation.uploadUrl : "/api/uploads");
    request.withCredentials = !direct;
    if (direct) {
      request.setRequestHeader("Content-Type", file.type);
      request.setRequestHeader("x-upsert", "false");
    }
    request.timeout = 60000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * (direct ? 90 : 100)));
    };
    request.onerror = () =>
      reject(
        new Error("Photograph upload failed. Check your connection and retry."),
      );
    request.ontimeout = () =>
      reject(
        new Error(
          "Photograph upload timed out. Retry with a smaller photograph.",
        ),
      );
    request.onload = () => {
      try {
        const data = JSON.parse(request.responseText);
        if (direct) {
          if (request.status < 200 || request.status >= 300)
            throw new Error("Photograph upload failed. Check your connection and retry.");
          resolve({ imagePath: preparation.imagePath, previewUrl: "", storage: "supabase" });
          return;
        }
        if (
          request.status < 200 ||
          request.status >= 300 ||
          !data.success ||
          !data.imagePath
        )
          throw new Error(
            data.error ||
              "The server did not acknowledge the photograph upload.",
          );
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    if (direct) request.send(file);
    else {
      const form = new FormData();
      form.append("file", file);
      request.send(form);
    }
  });
  if (!direct) return uploaded;
  const completed = await fetch("/api/uploads/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imagePath: uploaded.imagePath }), signal,
  });
  const result = await completed.json();
  if (!completed.ok || !result.success || !result.imagePath)
    throw new Error(result.error || "The uploaded photograph could not be verified. Retry.");
  onProgress(100);
  return result;
}
