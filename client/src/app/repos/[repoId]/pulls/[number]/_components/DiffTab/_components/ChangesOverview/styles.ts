export const s = {
  container: {
    marginBottom: 24,
  } as const,

  title: {
    margin: "0 0 16px",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } as const,

  table: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    border: "1px solid var(--border-muted)",
    borderRadius: 8,
    overflow: "hidden",
  } as const,

  row: {
    display: "grid",
    gridTemplateColumns: "140px 1fr 80px 100px",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-muted)",
    gap: 16,
  } as const,

  roleCell: {
    flex: "0 0 140px",
  } as const,

  roleLabel: {
    fontWeight: 600,
    fontSize: 13,
    color: "var(--text-primary)",
  } as const,

  descriptionCell: {
    flex: "1",
  } as const,

  description: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as const,

  findingsCell: {
    flex: "0 0 80px",
    textAlign: "center" as const,
  } as const,

  findingsBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "4px 8px",
    backgroundColor: "rgba(255, 100, 100, 0.1)",
    borderRadius: 4,
    width: "fit-content",
  } as const,

  findingsCount: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-error)",
  } as const,

  fileCountCell: {
    flex: "0 0 100px",
    textAlign: "right" as const,
  } as const,

  fileCount: {
    fontSize: 12,
    color: "var(--text-muted)",
  } as const,
} as const;
