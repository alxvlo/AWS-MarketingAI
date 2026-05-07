/**
 * api.ts — Satisfaction Meter upload + results API client.
 *
 * Migrated from web/app.js (Phase 0 prototype) into the Next.js frontend.
 * These are the only two API endpoints in the live system.
 */

if (
  typeof window !== "undefined" &&
  process.env.NODE_ENV === "production" &&
  (!process.env.NEXT_PUBLIC_UPLOAD_API || !process.env.NEXT_PUBLIC_RESULTS_API)
) {
  throw new Error(
    "NEXT_PUBLIC_UPLOAD_API and NEXT_PUBLIC_RESULTS_API must be set in production."
  );
}

const UPLOAD_API = process.env.NEXT_PUBLIC_UPLOAD_API!;
const RESULTS_API = process.env.NEXT_PUBLIC_RESULTS_API!;

// Statuses that indicate the pipeline reached a terminal state — polling can exit.
// If a freq-cap (or similar suppression) is reintroduced later, add `email_suppressed` here too.
const TERMINAL_STATUSES = new Set([
  "email_sent",
  "email_failed",
  "no_face_detected",
  "invalid_file",
]);

export interface PresignedUrlResponse {
  submissionId: string;
  uploadUrl: string;
}

export interface SubmissionResult {
  submissionId: string;
  email: string;
  status: string;
  dominantEmotion: string;
  emotionScores: Record<string, number>;
  emailSentAt: string;
  templateUsed: string;
  timestamp: string;
}

/**
 * Request a presigned S3 PUT URL from the upload Lambda.
 * @param email       Recipient email address provided by the user.
 * @param contentType MIME type of the image being uploaded.
 * @param fileSize    Size in bytes — validated server-side (max 5 MB).
 */
export async function requestPresignedUrl(
  email: string,
  contentType: string,
  fileSize: number
): Promise<PresignedUrlResponse> {
  const res = await fetch(UPLOAD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, contentType, fileSize }),
  });

  if (!res.ok) {
    throw new Error(`Upload API returned ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<PresignedUrlResponse>;
}

/**
 * Upload an image blob directly to S3 using a presigned URL.
 * The request bypasses Lambda — the browser PUTs directly to S3.
 */
export async function uploadImageToS3(
  uploadUrl: string,
  image: Blob
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": image.type },
    body: image,
  });

  if (!res.ok) {
    throw new Error(`S3 PUT failed with status ${res.status}`);
  }
}

/**
 * Poll GET /results/{submissionId} until the record has an emailSentAt value,
 * indicating the full pipeline (Rekognition → DynamoDB → SES) has completed.
 *
 * @param submissionId  The ID returned by requestPresignedUrl.
 * @param attempts      Maximum number of poll iterations (default 20).
 * @param intervalMs    Milliseconds between each poll (default 1500).
 */
export async function pollResult(
  submissionId: string,
  attempts = 20,
  intervalMs = 1500
): Promise<SubmissionResult> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${RESULTS_API}/${submissionId}`);
    if (res.ok) {
      const data = (await res.json()) as SubmissionResult;
      if (data.emailSentAt || TERMINAL_STATUSES.has(data.status)) {
        return data;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Analysis took longer than expected. Please try again.");
}

/**
 * Full end-to-end helper: presigned URL → S3 upload → poll result.
 * Emits progress messages via the onStatus callback so the caller
 * can display live feedback to the user.
 */
export async function submitPhoto(
  email: string,
  image: Blob,
  onStatus: (msg: string) => void
): Promise<SubmissionResult> {
  onStatus("Requesting upload URL…");
  const { submissionId, uploadUrl } = await requestPresignedUrl(
    email,
    image.type,
    image.size
  );
  onStatus(`Upload URL received (submission: ${submissionId})`);

  onStatus("Uploading photo to S3…");
  await uploadImageToS3(uploadUrl, image);
  onStatus("Photo uploaded.");

  onStatus("Waiting for emotion detection and email dispatch…");
  const result = await pollResult(submissionId);
  onStatus("Done!");

  return result;
}
