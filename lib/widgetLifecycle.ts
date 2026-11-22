/**
 * lib/widgetLifecycle.ts
 *
 * Shared, dependency-light widget content & publication lifecycle helpers for
 * NotNotes, Weaver, and Youniverse public retrieval.
 *
 * Security invariants:
 *  - Legacy widgets without an explicit `publicationStatus` default to `"draft"`
 *    so previously saved private widgets never expose publicly by accident.
 *  - Public serialization strips internal timestamps/metadata except safe display
 *    fields (`id`, `title`, `content`, `code`, `dependencies`, `publishedAt`, `updatedAt`).
 */

export type WidgetPublicationStatus = "draft" | "published" | "unpublished";

export interface ParsedWidgetContent {
  type: string;
  code: string;
  dependencies: string[];
  publicationStatus: WidgetPublicationStatus;
  publishedAt: string | null;
  unpublishedAt: string | null;
}

export interface OwnerWidgetDTO {
  id: string;
  youniverseId: string;
  title: string;
  code: string;
  dependencies: string[];
  content: ParsedWidgetContent;
  status: string;
  publicationStatus: WidgetPublicationStatus;
  isPublished: boolean;
  publishedAt: string | null;
  unpublishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PublicWidgetDTO {
  id: string;
  title: string;
  content: {
    type: "REACT_WIDGET";
    code: string;
    dependencies: string[];
  };
  code: string;
  dependencies: string[];
  publishedAt: string | null;
  updatedAt: string;
}

function toIsoOrNull(val: unknown): string | null {
  if (!val) return null;
  const d = new Date(val as any);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function sanitizeWidgetDependencies(rawDeps: unknown): string[] {
  if (!Array.isArray(rawDeps)) return [];
  return rawDeps
    .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    .map((d) => d.trim());
}

export function normalizeWidgetPublicationStatus(content: any): WidgetPublicationStatus {
  const status = typeof content?.publicationStatus === "string"
    ? content.publicationStatus.trim().toLowerCase()
    : "";
  if (status === "published") return "published";
  if (status === "unpublished") return "unpublished";
  return "draft";
}

export function parseWidgetContent(rawContent: unknown): ParsedWidgetContent | null {
  let obj: any = rawContent;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") {
    return null;
  }

  const publicationStatus = normalizeWidgetPublicationStatus(obj);
  return {
    type: typeof obj.type === "string" ? obj.type : "",
    code: typeof obj.code === "string" ? obj.code : "",
    dependencies: sanitizeWidgetDependencies(obj.dependencies),
    publicationStatus,
    publishedAt: toIsoOrNull(obj.publishedAt),
    unpublishedAt: toIsoOrNull(obj.unpublishedAt),
  };
}

export function buildWidgetContentPayload(params: {
  code: string;
  dependencies?: unknown;
  publicationStatus: WidgetPublicationStatus;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
}): ParsedWidgetContent {
  return {
    type: "REACT_WIDGET",
    code: String(params.code),
    dependencies: sanitizeWidgetDependencies(params.dependencies),
    publicationStatus: params.publicationStatus,
    publishedAt: params.publishedAt ? toIsoOrNull(params.publishedAt) : null,
    unpublishedAt: params.unpublishedAt ? toIsoOrNull(params.unpublishedAt) : null,
  };
}

export function formatOwnerWidget(row: any, fallbackYouniverseId?: string): OwnerWidgetDTO | null {
  const parsed = parseWidgetContent(row?.content);
  if (!parsed || parsed.type !== "REACT_WIDGET") {
    return null;
  }

  const publicationStatus = parsed.publicationStatus;
  const createdAt = toIsoOrNull(row?.createdAt);
  const updatedAt = toIsoOrNull(row?.updatedAt) ?? createdAt;

  return {
    id: String(row.id),
    youniverseId: String(row.youniverseId ?? fallbackYouniverseId ?? ""),
    title: String(row.title ?? ""),
    code: parsed.code,
    dependencies: parsed.dependencies,
    content: parsed,
    status: String(row.status ?? "APPROVED"),
    publicationStatus,
    isPublished: publicationStatus === "published",
    publishedAt: parsed.publishedAt,
    unpublishedAt: parsed.unpublishedAt,
    createdAt,
    updatedAt,
  };
}

export function formatPublicWidget(row: any): PublicWidgetDTO | null {
  if (String(row?.status ?? "APPROVED") !== "APPROVED") {
    return null;
  }
  const parsed = parseWidgetContent(row?.content);
  if (!parsed || parsed.type !== "REACT_WIDGET") {
    return null;
  }
  if (parsed.publicationStatus !== "published") {
    return null;
  }
  if (!parsed.code.trim()) {
    return null;
  }

  const updatedAt =
    toIsoOrNull(row?.updatedAt) ??
    toIsoOrNull(row?.createdAt) ??
    parsed.publishedAt ??
    new Date().toISOString();

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    content: {
      type: "REACT_WIDGET",
      code: parsed.code,
      dependencies: parsed.dependencies,
    },
    code: parsed.code,
    dependencies: parsed.dependencies,
    publishedAt: parsed.publishedAt,
    updatedAt,
  };
}
