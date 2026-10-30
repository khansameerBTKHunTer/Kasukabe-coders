export function uploadPhoto(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ imagePath: string; previewUrl: string; storage: string }> {
  return new Promise((resolve, reject) => {
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
    request.open("POST", "/api/uploads");
    request.withCredentials = true;
    request.timeout = 60000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
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
    const form = new FormData();
    form.append("file", file);
    request.send(form);
  });
}
