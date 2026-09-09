# Feature Spec: Media & File Uploads

This specification covers file, image, video, and audio attachment processing, validation, chunked upload assembly, and dual-driver storage (local development storage and Cloudinary production storage).

## Goal

Enable multi-format file uploads attached to channel messages and direct messages, featuring server-side size/MIME validation, chunked uploads for large media, and secure media previews.

## Scope

- **In Scope**:
  - Image, video, audio (voice messages), and document upload validation.
  - Development driver (`STORAGE_DRIVER=local`) and production driver (`STORAGE_DRIVER=cloudinary`).
  - Chunked file upload processing for files exceeding 5 MB.
  - Upload metadata persistence and message attachment linking.
- **Out of Scope**:
  - Client-side image cropping or video re-encoding before upload.

## Current Behavior

- **API Upload Controller & Driver**:
  - `apps/api/src/modules/uploads/uploads.controller.ts`: Receives upload requests, validates headers/DTOs, and manages chunk assembly in `uploads/.chunks`.
  - `apps/api/src/modules/uploads/uploads.service.ts`: Handles file validation, disk writing or Cloudinary API integration, and database metadata creation.
- **Web Client Upload Surfaces**:
  - `apps/web/src/hooks/useComposerAttachments.ts`: Manages selected files, upload progress tracking, chunking, and attachment ID linking for composer payloads.

## Changes

- Standardized storage configuration parameters in API environment.
- Enforced strict MIME type allowlisting and file size boundaries.

## Technical Approach

- **Modules & Files**:
  - `apps/api/src/modules/uploads/uploads.controller.ts`
  - `apps/api/src/modules/uploads/uploads.service.ts`
  - `apps/web/src/hooks/useComposerAttachments.ts`
- **API Contracts**:
  - `POST /uploads` -> Single file upload (Multipart form data).
  - `POST /uploads/chunk` -> Chunk upload (`chunkIndex`, `totalChunks`, `uploadId`).
- **Storage Configuration**:
  - `STORAGE_DRIVER`: `local` or `cloudinary`.
  - `UPLOAD_MAX_BYTES`: Default `104857600` (100 MB).
  - `UPLOAD_CHUNK_BYTES`: Default `2097152` (2 MB).

## Trade-offs

- **Local Storage vs External S3/Cloudinary**:
  - *Chosen*: Dual-driver model. Local storage in development, Cloudinary for hosted production.
  - *Rationale*: Frictionless developer experience without requiring external cloud credentials for local setup.
  - *Cost*: Requires dual driver code maintainability in `UploadsService`.

## Risks & Rollback

- **Risks**: Temporary chunk files accumulating in `uploads/.chunks` if client aborts chunked upload mid-stream.
- **Rollback**: Fall back to single-part uploads for files under `UPLOAD_MAX_BYTES` limit.

## Test Plan

- **Automated Tests**:
  - Unit tests in `apps/api/src/modules/uploads/uploads.service.spec.ts` testing MIME allowlist validation.
- **Manual Verification**:
  - Upload images, MP4 videos, and audio voice messages; verify preview rendering in chat.

## Deployment Notes

- Ensure `UPLOAD_TMP_DIR` exists and is writable on API instance when using local storage.
- Set Cloudinary environment variables (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) in production.
