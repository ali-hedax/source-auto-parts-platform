# S3 media routing

This branch's Caddyfile is a production S3 media profile. It serves public product images through the existing same-origin `/media` path. Private attachments continue to use authenticated API routes.

When the API uses S3, its local static media route is disabled. Production Next.js image optimization therefore needs to retrieve `/media` through the public reverse proxy instead of the internal API. Standalone builds use `PUBLIC_BASE_URL` as that media origin; development retains the internal API media origin.

## Configuration

Keep `PUBLIC_MEDIA_BASE_URL=/media` and `S3_PUBLIC_BASE_URL=/media` when using this proxy profile. Supply the S3 connection variables in the protected server environment. Never commit credentials or environment files.

The media proxy removes browser authentication and forwarding headers before sending the request to object storage. Anonymous bucket access should permit only reading the public product-image prefix. The application credential should be restricted to the buckets and operations it requires.

## Validation

Before switching storage providers, back up files, configuration and the database. Copy existing objects while preserving their keys, compare their contents, and retain the originals until verification is complete.

Build the web image and validate the intended Caddyfile. Then test direct public images, Next.js image optimization, a new upload, authenticated private downloads and anonymous denial for private objects. A successful health endpoint alone does not verify these paths.

Docker file bind mounts can retain an old file after an atomic replacement by Git or an editor. Compare the file visible inside the container with the host configuration. Recreate the Caddy container when needed, preserving its existing certificate and configuration volumes. A directory bind mount can be evaluated separately.

Local-storage Docker deployments require the API media proxy profile. Review that compatibility before merging the production S3 profile into a shared deployment workflow.
